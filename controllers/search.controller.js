import mongoose from "mongoose";
import Offer, { citiesOf } from "../models/offer.model.js";
import { blockedSetOf, isBlocked } from "../models/blocklist.model.js";
import User from "../models/user.model.js";
import { publicLead } from "../lib/locking.js";
import Business from "../models/business.model.js";
import Lead from "../models/lead.model.js";
import { searchPlaces } from "../lib/googlePlaces.js";

const WAIT_BETWEEN_SEARCHES = 60 * 1000; // 1 minute (protège le quota Google)

// POST /api/offers/:id/search
// cherche sur Google les commerces qui correspondent à l'offre,
// les enregistre dans businesses et crée un lead (prospect) pour chacun
export async function searchBusinesses(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: "Invalid offer id" });
  }

  const offer = await Offer.findOne({ _id: req.params.id, userId: req.userId });
  if (!offer) return res.status(404).json({ message: "Offer not found" });

  // anti-spam : une recherche par minute et par offre
  if (offer.lastSearchAt && Date.now() - offer.lastSearchAt.getTime() < WAIT_BETWEEN_SEARCHES) {
    return res.status(429).json({ message: "Please wait 1 minute between two searches" });
  }

  // essai gratuit : 1 seule recherche, 1 ville et 1 catégorie
  const user = await User.findById(req.userId);
  const trial = user.plan === "free" && user.role !== "admin";
  if (trial && user.freeSearchUsed) {
    return res.status(402).json({ message: "Free trial: you already used your free search. Buy a pack to search again." });
  }

  // 1) une recherche Google par ville et par catégorie (ex. "barber London", "nail salon Manchester")
  const cities = trial ? citiesOf(offer).slice(0, 1) : citiesOf(offer);
  const categories = trial ? offer.targetCategories.slice(0, 1) : offer.targetCategories;
  const places = new Map(); // googlePlaceId -> commerce (évite les doublons)
  for (const city of cities.length ? cities : [null]) {
    for (const category of categories) {
      const query = city ? `${category} ${city}` : category;
      const results = await searchPlaces({
        query,
        country: offer.targetCountry,
        language: offer.messageLanguage,
      });
      for (const place of results) {
        if (places.has(place.googlePlaceId)) continue;
        places.set(place.googlePlaceId, {
          ...place,
          category: place.category || category,
          country: offer.targetCountry,
          city: city || undefined,
          language: offer.messageLanguage,
        });
      }
    }
  }

  const list = [...places.values()];
  offer.lastSearchAt = new Date();
  await offer.save();
  if (trial) {
    user.freeSearchUsed = true;
    await user.save();
  }

  if (list.length === 0) {
    return res.status(200).json({ found: 0, newBusinesses: 0, newLeads: 0 });
  }

  // 2) enregistrer les commerces (créer s'ils n'existent pas, sinon mettre à jour)
  const businessResult = await Business.bulkWrite(
    list.map((b) => ({
      updateOne: {
        filter: { googlePlaceId: b.googlePlaceId },
        // pas de portable : on efface l'ancien "phone" (parfois un fixe des anciennes données)
        update: b.phone ? { $set: b } : { $set: b, $unset: { phone: "" } },
        upsert: true,
      },
    }))
  );
  const businesses = await Business.find({ googlePlaceId: { $in: list.map((b) => b.googlePlaceId) } });

  // 3) créer un lead par commerce pour cette offre (sans doublon grâce à l'index unique)
  //    sauf pour les commerces de ma liste "ne plus contacter"
  const blocked = await blockedSetOf(req.userId);
  const allowed = businesses.filter((b) => !isBlocked(b, blocked));
  if (allowed.length === 0) {
    return res.status(200).json({ found: list.length, newBusinesses: businessResult.upsertedCount, newLeads: 0, blocked: businesses.length });
  }
  const leadResult = await Lead.bulkWrite(
    allowed.map((b) => ({
      updateOne: {
        filter: { offerId: offer._id, businessId: b._id },
        // nouveau prospect = verrouillé (à débloquer avec un crédit)
        update: { $setOnInsert: { userId: req.userId, offerId: offer._id, businessId: b._id, unlocked: false } },
        upsert: true,
      },
    }))
  );

  res.status(200).json({
    found: list.length,
    newBusinesses: businessResult.upsertedCount,
    newLeads: leadResult.upsertedCount,
    blocked: businesses.length - allowed.length, // ignorés : dans la liste "ne plus contacter"
    cities: cities.length,
    trial: trial || undefined, // essai gratuit : seulement la 1re ville et la 1re catégorie
    credits: user.credits,     // prospects que l'utilisateur peut encore débloquer
  });
}

// GET /api/offers/:id/leads?status=toContact
// les prospects d'une offre, avec les infos du commerce
export async function getOfferLeads(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: "Invalid offer id" });
  }

  const filter = { offerId: req.params.id, userId: req.userId }; // seulement MES prospects
  if (req.query.status) filter.status = req.query.status;

  const offer = await Offer.findOne({ _id: req.params.id, userId: req.userId });
  if (!offer) return res.status(404).json({ message: "Offer not found" });

  const leads = await Lead.find(filter)
    .populate("businessId") // remplace l'id par le document du commerce
    .sort({ score: -1, createdAt: -1 });

  // les prospects verrouillés sont masqués (pas de nom, d'adresse ni de contact)
  res.status(200).json(leads.map((l) => publicLead(l, offer)));
}
