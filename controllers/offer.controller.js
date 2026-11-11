import mongoose from "mongoose";
import Offer from "../models/offer.model.js";
import Lead from "../models/lead.model.js";

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

  res.status(200).json({ offer, leadsByStatus });
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
