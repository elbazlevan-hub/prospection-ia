import mongoose from "mongoose";
import Offer from "../models/offer.model.js";
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

  // 1) une recherche Google par catégorie (ex. "barber London", "nail salon London")
  const places = new Map(); // googlePlaceId -> commerce (évite les doublons)
  for (const category of offer.targetCategories) {
    const query = offer.targetCity ? `${category} ${offer.targetCity}` : category;
    const results = await searchPlaces({
      query,
      country: offer.targetCountry,
      language: offer.messageLanguage,
    });
    for (const place of results) {
      places.set(place.googlePlaceId, {
        ...place,
        category: place.category || category,
        country: offer.targetCountry,
        city: offer.targetCity,
        language: offer.messageLanguage,
      });
    }
  }

  const list = [...places.values()];
  offer.lastSearchAt = new Date();
  await offer.save();

  if (list.length === 0) {
    return res.status(200).json({ found: 0, newBusinesses: 0, newLeads: 0 });
  }

  // 2) enregistrer les commerces (créer s'ils n'existent pas, sinon mettre à jour)
  const businessResult = await Business.bulkWrite(
    list.map((b) => ({
      updateOne: { filter: { googlePlaceId: b.googlePlaceId }, update: { $set: b }, upsert: true },
    }))
  );
  const businesses = await Business.find({ googlePlaceId: { $in: list.map((b) => b.googlePlaceId) } });

  // 3) créer un lead par commerce pour cette offre (sans doublon grâce à l'index unique)
  const leadResult = await Lead.bulkWrite(
    businesses.map((b) => ({
      updateOne: {
        filter: { offerId: offer._id, businessId: b._id },
        update: { $setOnInsert: { userId: req.userId, offerId: offer._id, businessId: b._id } },
        upsert: true,
      },
    }))
  );

  res.status(200).json({
    found: list.length,
    newBusinesses: businessResult.upsertedCount,
    newLeads: leadResult.upsertedCount,
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

  const leads = await Lead.find(filter)
    .populate("businessId") // remplace l'id par le document du commerce
    .sort({ score: -1, createdAt: -1 });

  res.status(200).json(leads);
}
