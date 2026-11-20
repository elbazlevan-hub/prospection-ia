import mongoose from "mongoose";
import Offer from "../models/offer.model.js";
import Lead from "../models/lead.model.js";
import User, { senderNameOf } from "../models/user.model.js";
import { templatesIn } from "../lib/templates.js";
import { suggestOffer } from "../lib/offerSuggester.js";
import { unlockLeads, withLinks } from "./lead.controller.js";

// ID invalide -> 400 (sinon CastError)
function checkId(id, res) {
  if (!mongoose.isValidObjectId(id)) {
    res.status(400).json({ message: "Invalid offer id" });
    return false;
  }
  return true;
}

// POST /api/offers
export async function createOffer(req, res) {
  // userId vient du TOKEN, jamais du body
  const offer = await Offer.create({ ...req.body, userId: req.userId });
  res.status(201).json(offer);
}

// GET /api/offers?country=GB&sort=-createdAt
export async function getOffers(req, res) {
  const { country, sort } = req.query;
  const filter = { userId: req.userId }; // seulement MES offres
  if (country) filter.targetCountry = String(country).toUpperCase();

  const allowedSort = ["createdAt", "-createdAt", "title", "-title"];
  const sortBy = allowedSort.includes(sort) ? sort : "-createdAt";

  const offers = await Offer.find(filter).sort(sortBy);
  res.status(200).json(offers);
}

// GET /api/offers/:id  -> l'offre + combien de prospects par statut
export async function getOfferById(req, res) {
  if (!checkId(req.params.id, res)) return;

  const offer = await Offer.findOne({ _id: req.params.id, userId: req.userId });
  if (!offer) return res.status(404).json({ message: "Offer not found" });

  const stats = await Lead.aggregate([
    { $match: { offerId: offer._id } },
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);
  const leadsByStatus = Object.fromEntries(stats.map((s) => [s._id, s.count]));
  const lockedLeads = await Lead.countDocuments({ offerId: offer._id, unlocked: false });
  // commerces analysés sans aucun problème lié à l'offre (cachés dans la liste)
  const zero = await Lead.find({ offerId: offer._id, score: 0 }).populate("businessId", "analyzedAt");
  const noProblemLeads = zero.filter((l) => l.businessId?.analyzedAt).length;

  res.status(200).json({ offer, leadsByStatus, lockedLeads, noProblemLeads });
}

// PUT /api/offers/:id  (remplacement complet, body validé par le même schéma que POST)
export async function updateOffer(req, res) {
  if (!checkId(req.params.id, res)) return;

  const offer = await Offer.findOneAndUpdate(
    { _id: req.params.id, userId: req.userId }, // l'id ET le propriétaire
    req.body,
    { returnDocument: "after", runValidators: true }
  );
  if (!offer) return res.status(404).json({ message: "Offer not found" });

  res.status(200).json(offer);
}

// DELETE /api/offers/:id  -> supprime aussi les prospects liés à cette offre
export async function deleteOffer(req, res) {
  if (!checkId(req.params.id, res)) return;

  const offer = await Offer.findOneAndDelete({ _id: req.params.id, userId: req.userId });
  if (!offer) return res.status(404).json({ message: "Offer not found" });

  await Lead.deleteMany({ offerId: offer._id });
  res.status(204).send();
}

// GET /api/offers/templates?lang=fr  -> les modèles dans la langue de l'app
export function getTemplates(req, res) {
  res.status(200).json(templatesIn(String(req.query.lang || "en")));
}

// POST /api/offers/suggest  { text, country?, city?, language? }
// AIDY propose une offre complète à partir d'une description libre (rien n'est enregistré :
// l'utilisateur vérifie, corrige, puis crée l'offre avec POST /api/offers)
export async function suggest(req, res) {
  const draft = await suggestOffer(req.body);
  res.status(200).json(draft);
}

// POST /api/offers/:id/unlock  { count: 5 }
// débloque les meilleurs prospects verrouillés (1 crédit chacun) et AIDY écrit leurs messages
export async function unlockBest(req, res) {
  if (!checkId(req.params.id, res)) return;
  const offer = await Offer.findOne({ _id: req.params.id, userId: req.userId });
  if (!offer) return res.status(404).json({ message: "Offer not found" });

  const user = await User.findById(req.userId);
  if (user.role !== "admin" && user.credits < 1) {
    return res.status(402).json({ message: "No credits left: buy a pack to unlock more leads", credits: 0 });
  }

  // les meilleurs prospects encore verrouillés (score > 0 : ils ont au moins un problème recherché)
  const locked = await Lead.find({ offerId: offer._id, userId: req.userId, unlocked: false, score: { $gt: 0 } })
    .populate("businessId")
    .sort({ score: -1, createdAt: -1 })
    .limit(req.body.count);
  if (locked.length === 0) {
    return res.status(200).json({ unlocked: 0, credits: user.credits, message: "No locked lead to unlock (run the analysis first?)" });
  }

  const result = await unlockLeads(locked, offer, user, req.query.message !== "false");
  res.status(200).json({
    unlocked: result.unlocked.length,
    credits: result.credits,
    messageErrors: result.messageErrors,
    leads: result.unlocked.map((l) => withLinks(l, offer, senderNameOf(user))),
  });
}
