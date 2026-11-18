import mongoose from "mongoose";
import Lead from "../models/lead.model.js";
import Offer from "../models/offer.model.js";
import User from "../models/user.model.js";
import Blocklist, { blockedSetOf, isBlocked } from "../models/blocklist.model.js";
import { sendLinks, followUpMessage, nextFollowUp, startOfToday, MAX_FOLLOW_UPS } from "../lib/outreach.js";

function checkId(id, res) {
  if (!mongoose.isValidObjectId(id)) {
    res.status(400).json({ message: "Invalid lead id" });
    return false;
  }
  return true;
}

async function findMyLead(req, res) {
  if (!checkId(req.params.id, res)) return null;
  const lead = await Lead.findOne({ _id: req.params.id, userId: req.userId }).populate("businessId");
  if (!lead) res.status(404).json({ message: "Lead not found" });
  return lead;
}

// le texte à envoyer maintenant : premier message, ou relance si déjà contacté
export function nextMessageOf(lead, offer, senderName) {
  if (lead.status === "contacted") {
    return {
      kind: "followUp",
      text: followUpMessage(offer?.messageLanguage, senderName),
      subject: lead.emailSubject ? `Re: ${lead.emailSubject}` : "",
    };
  }
  return { kind: "first", text: lead.message, subject: lead.emailSubject };
}

// ajoute au prospect les liens d'envoi (WhatsApp, email, Instagram, téléphone)
export function withLinks(lead, offer, senderName) {
  const next = nextMessageOf(lead, offer, senderName);
  const canSend = ["toContact", "contacted"].includes(lead.status) && Boolean(next.text);
  return {
    ...lead.toObject(),
    nextMessage: canSend ? next : null,
    links: canSend && lead.businessId ? sendLinks(lead.businessId, next.text, next.subject) : {},
  };
}

// GET /api/leads/:id  -> un prospect avec son commerce, son message et les liens d'envoi
export async function getLead(req, res) {
  const lead = await findMyLead(req, res);
  if (!lead) return;
  const offer = await Offer.findById(lead.offerId);
  const user = await User.findById(req.userId);
  res.status(200).json(withLinks(lead, offer, user?.name));
}

// PATCH /api/leads/:id  { status?, notes?, dealValue? }
// le statut met à jour les dates automatiquement (réponse, client, relances arrêtées...)
export async function updateLead(req, res) {
  const lead = await findMyLead(req, res);
  if (!lead) return;
  const offer = await Offer.findById(lead.offerId);
  const { status, notes, dealValue } = req.body;
  const now = new Date();

  if (notes !== undefined) lead.notes = notes;
  if (dealValue !== undefined) lead.dealValue = dealValue;

  if (status && status !== lead.status) {
    lead.status = status;
    if (status === "toContact") {
      // retour au départ : on efface le suivi
      Object.assign(lead, { contactedAt: undefined, contactedVia: undefined, lastContactAt: undefined, followUpAt: undefined, followUpCount: 0, repliedAt: undefined, clientAt: undefined });
    }
    if (status === "contacted" && !lead.contactedAt) {
      lead.contactedAt = now;
      lead.lastContactAt = now;
      lead.followUpCount = 0;
      lead.followUpAt = nextFollowUp(now, 0);
    }
    if (status === "interested") {
      lead.repliedAt = lead.repliedAt || now;
      lead.followUpAt = undefined; // il a répondu : plus de relance automatique
    }
    if (status === "client") {
      lead.repliedAt = lead.repliedAt || now;
      lead.clientAt = now;
      lead.followUpAt = undefined;
      if (lead.dealValue === undefined) lead.dealValue = offer?.price || 0; // par défaut : le prix de l'offre
    }
    if (status === "rejected") {
      lead.followUpAt = undefined;
    }
  }

  await lead.save();
  const user = await User.findById(req.userId);
  res.status(200).json(withLinks(lead, offer, user?.name));
}

// POST /api/leads/:id/contact  { channel: "whatsapp" | "email" | "instagram" | "phone" | "other" }
// à appeler après avoir envoyé le message (ou la relance) : le prospect passe en "contacté"
// et la prochaine relance est programmée (J+3, puis J+7)
// ?force=true pour dépasser la limite du jour
export async function contactLead(req, res) {
  const lead = await findMyLead(req, res);
  if (!lead) return;
  if (!["toContact", "contacted"].includes(lead.status)) {
    return res.status(400).json({ message: `This lead is already "${lead.status}": change its status instead` });
  }
  if (lead.status === "contacted" && lead.followUpCount >= MAX_FOLLOW_UPS) {
    return res.status(400).json({ message: "No more follow-ups for this lead (max reached)" });
  }

  // jamais de message à un commerce bloqué
  const blocked = await blockedSetOf(req.userId);
  if (lead.businessId && isBlocked(lead.businessId, blocked)) {
    return res.status(403).json({ message: "This business is in your blocklist: it must not be contacted" });
  }

  // limite par jour (WhatsApp / emails bloqués si on envoie trop)
  const offer = await Offer.findById(lead.offerId);
  const dailyLimit = offer?.dailyLimit || 20;
  const sentToday = await Lead.countDocuments({ userId: req.userId, lastContactAt: { $gte: startOfToday() } });
  if (sentToday >= dailyLimit && req.query.force !== "true") {
    return res.status(429).json({ message: `Daily limit reached (${dailyLimit} contacts today). Try again tomorrow or use ?force=true` });
  }

  const now = new Date();
  if (lead.status === "toContact") {
    lead.status = "contacted";
    lead.contactedAt = now;
    lead.contactedVia = req.body.channel;
    lead.followUpCount = 0;
    lead.followUpAt = nextFollowUp(now, 0);
  } else {
    // c'est une relance
    lead.followUpCount += 1;
    lead.followUpAt = nextFollowUp(now, lead.followUpCount) || undefined;
  }
  lead.lastContactAt = now;
  await lead.save();

  const user = await User.findById(req.userId);
  res.status(200).json({
    sentToday: sentToday + 1,
    dailyLimit,
    lead: withLinks(lead, offer, user?.name),
  });
}

// POST /api/leads/:id/block  { reason? }
// le commerce ne sera plus jamais contacté (ni proposé dans les prochaines recherches)
export async function blockLead(req, res) {
  const lead = await findMyLead(req, res);
  if (!lead) return;
  const b = lead.businessId;
  if (!b) return res.status(404).json({ message: "Business not found" });

  const entry = await Blocklist.findOneAndUpdate(
    { userId: req.userId, googlePlaceId: b.googlePlaceId },
    { userId: req.userId, businessId: b._id, googlePlaceId: b.googlePlaceId, name: b.name, phone: b.phone, email: b.email, reason: req.body.reason || "" },
    { upsert: true, returnDocument: "after", runValidators: true }
  );

  // tous les prospects de ce commerce (dans toutes mes offres) passent en "refusé"
  const updated = await Lead.updateMany(
    { userId: req.userId, businessId: b._id },
    { $set: { status: "rejected" }, $unset: { followUpAt: "" } }
  );

  res.status(201).json({ blocked: entry, leadsUpdated: updated.modifiedCount });
}
