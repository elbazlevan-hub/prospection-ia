import mongoose from "mongoose";
import Offer from "../models/offer.model.js";
import Lead from "../models/lead.model.js";
import User from "../models/user.model.js";
import { writeMessage } from "../lib/messageWriter.js";
import { getPlaceReviews } from "../lib/googlePlaces.js";

const REVIEWS_CACHE_DAYS = 30;
const PARALLEL = 2; // messages écrits en même temps (les nouveaux comptes Claude ont une limite par minute)
const MAX_PER_CALL = 30; // limite de coût par appel

// compare un commerce avec les autres commerces de la même catégorie dans l'offre
function competitorsOf(business, allLeads) {
  const others = allLeads
    .map((l) => l.businessId)
    .filter((b) => b && String(b._id) !== String(business._id) && b.category === business.category && b.analyzedAt);
  return {
    total: others.length,
    withWebsite: others.filter((b) => b.analysis?.hasWebsite).length,
    withOnlineBooking: others.filter((b) => b.analysis?.onlineBooking).length,
  };
}

// avis Google du commerce (depuis le cache si récents)
async function reviewsOf(business, language) {
  const limit = Date.now() - REVIEWS_CACHE_DAYS * 24 * 60 * 60 * 1000;
  if (business.reviewsFetchedAt && business.reviewsFetchedAt.getTime() > limit) return business.reviews;
  if (!business.reviewCount) return [];
  business.reviews = await getPlaceReviews(business.googlePlaceId, language);
  business.reviewsFetchedAt = new Date();
  await business.save();
  return business.reviews;
}

// écrit et enregistre le message d'un lead
async function generateFor(lead, offer, allLeads, senderName) {
  const business = lead.businessId;
  const reviews = await reviewsOf(business, offer.messageLanguage);
  const result = await writeMessage({
    offer,
    business,
    matchReasons: lead.matchReasons,
    reviews: reviews.map((r) => ({ rating: r.rating, text: r.text })),
    competitors: competitorsOf(business, allLeads),
    senderName,
  });

  lead.message = result.message;
  lead.emailSubject = result.subject;
  lead.painPoints = result.painPoints;
  lead.customFit = offer.customCriterion ? result.fits : undefined;
  lead.customFitReason = offer.customCriterion ? result.fitReason : undefined;
  lead.messageGeneratedAt = new Date();
  await lead.save();
  return lead;
}

async function runInParallel(items, fn) {
  let index = 0;
  const errors = [];
  const done = [];
  async function worker() {
    while (index < items.length) {
      const item = items[index++];
      try {
        await fn(item);
        done.push(item);
      } catch (err) {
        console.error("Message generation failed:", err.message);
        errors.push(err);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(PARALLEL, items.length) }, worker));
  return { errors, done };
}

// POST /api/offers/:id/messages?limit=10&force=true
// écrit les messages IA pour les meilleurs prospects de l'offre (par score)
export async function generateOfferMessages(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: "Invalid offer id" });
  }
  const offer = await Offer.findOne({ _id: req.params.id, userId: req.userId });
  if (!offer) return res.status(404).json({ message: "Offer not found" });

  const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), MAX_PER_CALL);
  const force = req.query.force === "true";

  const allLeads = await Lead.find({ offerId: offer._id, userId: req.userId })
    .populate("businessId")
    .sort({ score: -1, createdAt: -1 });

  const toWrite = allLeads
    .filter((l) => l.businessId && l.score > 0 && (force || !l.message))
    .slice(0, limit);

  if (toWrite.length === 0) {
    return res.status(200).json({ written: 0, message: "No lead to write: run the analysis first, or use ?force=true" });
  }

  const user = await User.findById(req.userId);
  const { errors, done } = await runInParallel(toWrite, (lead) => generateFor(lead, offer, allLeads, user?.name));

  // si toutes les écritures ont échoué (ex. clé IA invalide), on renvoie l'erreur
  if (errors.length === toWrite.length) throw errors[0];

  res.status(200).json({
    written: toWrite.length - errors.length,
    failed: errors.length,
    errors: errors.length ? [...new Set(errors.map((e) => e.message))].slice(0, 3) : undefined, // raisons des échecs
    notMatchingCustomCriterion: offer.customCriterion ? done.filter((l) => l.customFit === false).length : undefined,
    // seulement les messages écrits pendant CET appel
    leads: done
      .map((l) => ({ _id: l._id, name: l.businessId.name, score: l.score, subject: l.emailSubject, message: l.message })),
  });
}

// GET /api/leads/:id  -> un prospect avec son commerce
export async function getLead(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: "Invalid lead id" });
  }
  const lead = await Lead.findOne({ _id: req.params.id, userId: req.userId }).populate("businessId");
  if (!lead) return res.status(404).json({ message: "Lead not found" });
  res.status(200).json(lead);
}

// POST /api/leads/:id/message  -> (ré)écrire le message d'un seul prospect
export async function regenerateLeadMessage(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: "Invalid lead id" });
  }
  const lead = await Lead.findOne({ _id: req.params.id, userId: req.userId }).populate("businessId");
  if (!lead) return res.status(404).json({ message: "Lead not found" });

  const offer = await Offer.findById(lead.offerId);
  const allLeads = await Lead.find({ offerId: lead.offerId, userId: req.userId }).populate("businessId");
  const user = await User.findById(req.userId);

  await generateFor(lead, offer, allLeads, user?.name);
  res.status(200).json(lead);
}
