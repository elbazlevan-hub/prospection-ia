import mongoose from "mongoose";
import Lead from "../models/lead.model.js";
import Offer from "../models/offer.model.js";
import User from "../models/user.model.js";
import { blockedSetOf, isBlocked } from "../models/blocklist.model.js";
import { startOfToday, endOfToday } from "../lib/outreach.js";
import { withLinks } from "./lead.controller.js";

// ?offerId=... (optionnel) -> filtre sur une offre ; sinon toutes mes offres
async function scopeOf(req, res) {
  const filter = { userId: req.userId };
  let offer = null;
  if (req.query.offerId) {
    if (!mongoose.isValidObjectId(req.query.offerId)) {
      res.status(400).json({ message: "Invalid offerId" });
      return null;
    }
    offer = await Offer.findOne({ _id: req.query.offerId, userId: req.userId });
    if (!offer) {
      res.status(404).json({ message: "Offer not found" });
      return null;
    }
    filter.offerId = offer._id;
  }
  return { filter, offer };
}

// GET /api/dashboard/today?offerId=
// le plan du jour : les relances à faire + les nouveaux prospects à contacter,
// sans dépasser la limite de contacts par jour
export async function getToday(req, res) {
  const scope = await scopeOf(req, res);
  if (!scope) return;
  const { filter, offer } = scope;

  const offers = await Offer.find({ userId: req.userId });
  const offersById = new Map(offers.map((o) => [String(o._id), o]));
  const dailyLimit = offer?.dailyLimit || Math.max(20, ...offers.map((o) => o.dailyLimit || 20));

  const sentToday = await Lead.countDocuments({ userId: req.userId, lastContactAt: { $gte: startOfToday() } });
  let remaining = Math.max(dailyLimit - sentToday, 0);

  const blocked = await blockedSetOf(req.userId);
  const user = await User.findById(req.userId);
  const toCard = (lead) => withLinks(lead, offersById.get(String(lead.offerId)), user?.name);
  const notBlocked = (lead) => lead.businessId && !isBlocked(lead.businessId, blocked);

  // 1) les relances prévues aujourd'hui (ou en retard), les plus anciennes d'abord
  const dueFollowUps = (
    await Lead.find({ ...filter, status: "contacted", followUpAt: { $lte: endOfToday() } })
      .populate("businessId")
      .sort({ followUpAt: 1 })
  ).filter(notBlocked);
  const followUps = dueFollowUps.slice(0, remaining);
  remaining -= followUps.length;

  // 2) les meilleurs prospects pas encore contactés (avec un message IA prêt)
  const ready = (
    await Lead.find({ ...filter, status: "toContact", message: { $ne: "" } })
      .populate("businessId")
      .sort({ score: -1, createdAt: -1 })
      .limit(remaining + 50)
  ).filter(notBlocked);
  const toContact = ready.slice(0, remaining);

  // prospects intéressants mais sans message : il faut lancer la génération IA
  const withoutMessage = await Lead.countDocuments({ ...filter, status: "toContact", message: "", score: { $gt: 0 } });

  res.status(200).json({
    dailyLimit,
    sentToday,
    remainingToday: Math.max(dailyLimit - sentToday, 0),
    followUps: followUps.map(toCard),
    toContact: toContact.map(toCard),
    lateFollowUps: dueFollowUps.length - followUps.length, // relances qui ne rentrent pas dans la limite du jour
    withoutMessage,
  });
}

const pct = (part, total) => (total ? Math.round((part / total) * 1000) / 10 : 0);
const REPLIED = ["interested", "client"];

// GET /api/dashboard/stats?offerId=
// statuts, argent gagné / possible, taux de réponse par canal, ce qui marche le mieux
export async function getStats(req, res) {
  const scope = await scopeOf(req, res);
  if (!scope) return;
  const { filter } = scope;

  const leads = await Lead.find(filter).lean();
  const offers = await Offer.find({ userId: req.userId }).lean();
  const offersById = new Map(offers.map((o) => [String(o._id), o]));

  // 1) combien de prospects par statut
  const byStatus = { toContact: 0, contacted: 0, interested: 0, client: 0, rejected: 0 };
  for (const l of leads) byStatus[l.status] = (byStatus[l.status] || 0) + 1;

  // 2) argent : gagné (clients) et possible (intéressés), par devise
  const money = {};
  for (const l of leads) {
    const offer = offersById.get(String(l.offerId));
    const currency = offer?.currency || "USD";
    money[currency] ??= { earned: 0, potential: 0, clients: 0, interested: 0 };
    if (l.status === "client") {
      money[currency].earned += l.dealValue ?? offer?.price ?? 0;
      money[currency].clients += 1;
    }
    if (l.status === "interested") {
      money[currency].potential += l.dealValue ?? offer?.price ?? 0;
      money[currency].interested += 1;
    }
  }

  // 3) résultats : seulement les prospects déjà contactés
  const contacted = leads.filter((l) => l.contactedAt);
  const replied = contacted.filter((l) => REPLIED.includes(l.status) || l.repliedAt);
  const clients = contacted.filter((l) => l.status === "client");

  // 4) par canal (WhatsApp, email, Instagram...)
  const byChannel = {};
  for (const l of contacted) {
    const c = l.contactedVia || "other";
    byChannel[c] ??= { contacted: 0, replied: 0, clients: 0 };
    byChannel[c].contacted += 1;
    if (REPLIED.includes(l.status) || l.repliedAt) byChannel[c].replied += 1;
    if (l.status === "client") byChannel[c].clients += 1;
  }
  for (const c of Object.values(byChannel)) {
    c.replyRate = pct(c.replied, c.contacted);
    c.clientRate = pct(c.clients, c.contacted);
  }

  // 5) par problème repéré (sans site, vieux site...) : lesquels deviennent clients ?
  const byReason = {};
  for (const l of contacted) {
    for (const r of l.matchReasons || []) {
      byReason[r] ??= { contacted: 0, replied: 0, clients: 0 };
      byReason[r].contacted += 1;
      if (REPLIED.includes(l.status) || l.repliedAt) byReason[r].replied += 1;
      if (l.status === "client") byReason[r].clients += 1;
    }
  }
  for (const r of Object.values(byReason)) {
    r.replyRate = pct(r.replied, r.contacted);
    r.clientRate = pct(r.clients, r.contacted);
  }
  const bestReason = Object.entries(byReason)
    .filter(([, r]) => r.contacted >= 5) // assez de données pour comparer
    .sort((a, b) => b[1].clientRate - a[1].clientRate || b[1].replyRate - a[1].replyRate)[0];

  res.status(200).json({
    leads: leads.length,
    byStatus,
    money,
    contacted: contacted.length,
    replied: replied.length,
    clients: clients.length,
    replyRate: pct(replied.length, contacted.length),
    clientRate: pct(clients.length, contacted.length),
    followUpsSent: contacted.reduce((sum, l) => sum + (l.followUpCount || 0), 0),
    byChannel,
    byReason,
    bestReason: bestReason ? { reason: bestReason[0], ...bestReason[1] } : null,
  });
}
