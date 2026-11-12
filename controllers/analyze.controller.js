import mongoose from "mongoose";
import Offer from "../models/offer.model.js";
import Business from "../models/business.model.js";
import Lead from "../models/lead.model.js";
import { analyzeWebsite } from "../lib/analyzeWebsite.js";
import { scoreBusiness } from "../lib/scoring.js";

const CACHE_DAYS = 7;       // un commerce analysé il y a moins de 7 jours n'est pas ré-analysé
const PARALLEL = 6;         // nombre de sites visités en même temps

// exécute fn sur chaque élément, PARALLEL à la fois
async function runInParallel(items, fn) {
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const item = items[index++];
      await fn(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(PARALLEL, items.length) }, worker));
}

// POST /api/offers/:id/analyze   (?force=true pour ré-analyser même les sites récents)
// analyse le site de chaque prospect de l'offre, puis calcule son score et ses raisons
export async function analyzeLeads(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: "Invalid offer id" });
  }

  const offer = await Offer.findOne({ _id: req.params.id, userId: req.userId });
  if (!offer) return res.status(404).json({ message: "Offer not found" });

  const leads = await Lead.find({ offerId: offer._id, userId: req.userId }).populate("businessId");
  if (leads.length === 0) {
    return res.status(200).json({ message: "No leads yet: run the search first", leads: 0 });
  }

  // 1) analyser les sites (sauf ceux déjà analysés récemment)
  const limit = Date.now() - CACHE_DAYS * 24 * 60 * 60 * 1000;
  const toAnalyze = leads
    .map((l) => l.businessId)
    .filter((b) => b && (req.query.force === "true" || !b.analyzedAt || b.analyzedAt.getTime() < limit));

  await runInParallel(toAnalyze, async (business) => {
    const { contacts = {}, ...analysis } = await analyzeWebsite(business.website);
    business.analysis = analysis;
    // les contacts viennent du site : on les met à jour à chaque analyse
    if (contacts.email) business.email = contacts.email;
    if (contacts.instagram) business.instagram = contacts.instagram;
    business.analyzedAt = new Date();
    await business.save();
  });

  // 2) calculer le score de chaque prospect selon les critères de l'offre
  const stats = { hot: 0, warm: 0, cold: 0 };
  const reasonsCount = {};

  await Lead.bulkWrite(
    leads
      .filter((l) => l.businessId)
      .map((lead) => {
        const { score, matchReasons } = scoreBusiness(lead.businessId, offer.criteria);
        if (score >= 60) stats.hot++;
        else if (score >= 30) stats.warm++;
        else stats.cold++;
        for (const r of matchReasons) reasonsCount[r] = (reasonsCount[r] || 0) + 1;
        return { updateOne: { filter: { _id: lead._id }, update: { $set: { score, matchReasons } } } };
      })
  );

  const withEmail = leads.filter((l) => l.businessId?.email).length;
  const withInstagram = leads.filter((l) => l.businessId?.instagram).length;

  res.status(200).json({
    leads: leads.length,
    withEmail,      // prospects dont on a trouvé l'email
    withInstagram,  // prospects dont on a trouvé l'Instagram
    analyzedNow: toAnalyze.length,
    fromCache: leads.length - toAnalyze.length,
    hot: stats.hot,     // score >= 60
    warm: stats.warm,   // score 30-59
    cold: stats.cold,   // score < 30
    reasons: reasonsCount, // ex. { noWebsite: 12, whatsappBooking: 5 }
  });
}
