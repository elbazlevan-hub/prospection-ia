import mongoose from "mongoose";
import Lead from "../models/lead.model.js";
import Offer from "../models/offer.model.js";
import User, { senderNameOf, isPremium } from "../models/user.model.js";
import { analyzeReply } from "../lib/replyAssistant.js";
import Blocklist, { blockedSetOf, isBlocked } from "../models/blocklist.model.js";
import { sendLinks, followUpMessage, nextFollowUp, startOfToday, MAX_FOLLOW_UPS } from "../lib/outreach.js";
import { isLocked, publicLead } from "../lib/locking.js";
import { generateFor } from "./message.controller.js";

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
// un prospect verrouillé est renvoyé masqué (sans nom, contacts ni message)
export function withLinks(lead, offer, senderName) {
  return publicLead(lead, offer, () => {
    const next = nextMessageOf(lead, offer, senderName);
    const canSend = ["toContact", "contacted"].includes(lead.status) && Boolean(next.text);
    return {
      nextMessage: canSend ? next : null,
      links:
        canSend && lead.businessId
          ? sendLinks(lead.businessId, next.text, next.subject, { includeLandlines: offer?.includeLandlines })
          : {},
    };
  });
}

// débloque des prospects (1 crédit chacun) puis AIDY écrit leur message
// renvoie { unlocked, credits, messageErrors }
export async function unlockLeads(leads, offer, user, writeMessages = true) {
  const toUnlock = leads.filter((l) => isLocked(l));
  const free = user.role === "admin";
  const count = free ? toUnlock.length : Math.min(toUnlock.length, user.credits);
  const chosen = toUnlock.slice(0, count);
  if (chosen.length === 0) return { unlocked: [], credits: user.credits, messageErrors: 0 };

  const now = new Date();
  for (const lead of chosen) {
    lead.unlocked = true;
    lead.unlockedAt = now;
    await lead.save();
  }
  if (!free) {
    user.credits -= chosen.length;
    await user.save();
  }

  // le message AIDY est inclus dans le déblocage
  let messageErrors = 0;
  if (writeMessages) {
    const allLeads = await Lead.find({ offerId: offer._id, userId: user._id }).populate("businessId");
    for (const lead of chosen) {
      if (lead.message || !(lead.score > 0)) continue;
      try {
        await generateFor(lead, offer, allLeads, senderNameOf(user), user.sellerProfile?.contactPreference);
      } catch (err) {
        console.error("Message generation failed:", err.message);
        messageErrors++;
      }
    }
  }
  return { unlocked: chosen, credits: user.credits, messageErrors };
}

// POST /api/leads/:id/unlock  -> débloque UN prospect (1 crédit) + message AIDY  (?message=false pour ne pas l'écrire)
export async function unlockLead(req, res) {
  const lead = await findMyLead(req, res);
  if (!lead) return;
  const offer = await Offer.findById(lead.offerId);
  const user = await User.findById(req.userId);
  if (!isLocked(lead)) return res.status(200).json({ credits: user.credits, lead: withLinks(lead, offer, senderNameOf(user)) });

  if (user.role !== "admin" && user.credits < 1) {
    return res.status(402).json({ message: "No credits left: buy a pack to unlock more leads", credits: 0 });
  }
  // on débloque après l'analyse : sinon on ne sait pas encore quel est son problème
  if (!lead.businessId?.analyzedAt) {
    return res.status(400).json({ message: "Run the analysis first: AIDY needs to know this business's problems" });
  }
  const result = await unlockLeads([lead], offer, user, req.query.message !== "false");
  res.status(200).json({
    credits: result.credits,
    messageError: result.messageErrors > 0 || undefined,
    lead: withLinks(lead, offer, senderNameOf(user)),
  });
}

// GET /api/leads/:id  -> un prospect avec son commerce, son message et les liens d'envoi
export async function getLead(req, res) {
  const lead = await findMyLead(req, res);
  if (!lead) return;
  const offer = await Offer.findById(lead.offerId);
  const user = await User.findById(req.userId);
  res.status(200).json(withLinks(lead, offer, senderNameOf(user)));
}

// PATCH /api/leads/:id  { status?, notes?, dealValue? }
// le statut met à jour les dates automatiquement (réponse, client, relances arrêtées...)
export async function updateLead(req, res) {
  const lead = await findMyLead(req, res);
  if (!lead) return;
  if (isLocked(lead)) return res.status(403).json({ message: "Unlock this lead first" });
  const offer = await Offer.findById(lead.offerId);
  const { status, notes, dealValue } = req.body;
  const now = new Date();

  if (notes !== undefined) lead.notes = notes;
  const oldValue = lead.dealValue;
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
    if (["interested", "client", "rejected"].includes(status)) lead.waitingForMe = false;
    if (status === "rejected") {
      lead.followUpAt = undefined;
    }
  }

  // historique des montants (visible : on sait quand et comment le montant a changé)
  if (lead.dealValue !== undefined && lead.dealValue !== oldValue) {
    lead.dealHistory.push({ value: lead.dealValue, at: now });
  }

  await lead.save();
  const user = await User.findById(req.userId);
  res.status(200).json(withLinks(lead, offer, senderNameOf(user)));
}

// POST /api/leads/:id/contact  { channel: "whatsapp" | "email" | "instagram" | "phone" | "other" }
// à appeler après avoir envoyé le message (ou la relance) : le prospect passe en "contacté"
// et la prochaine relance est programmée (J+3, puis J+7)
// ?force=true pour dépasser la limite du jour
export async function contactLead(req, res) {
  const lead = await findMyLead(req, res);
  if (!lead) return;
  if (isLocked(lead)) return res.status(403).json({ message: "Unlock this lead first" });
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
  const dailyLimit = offer?.dailyLimit || 60;
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
    lead: withLinks(lead, offer, senderNameOf(user)),
  });
}

// POST /api/leads/:id/block  { reason? }
// le commerce ne sera plus jamais contacté (ni proposé dans les prochaines recherches)
export async function blockLead(req, res) {
  const lead = await findMyLead(req, res);
  if (!lead) return;
  if (isLocked(lead)) return res.status(403).json({ message: "Unlock this lead first" });
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

// ce que devient le prospect selon sa réponse
const STATUS_BY_LABEL = { interested: "interested", question: "interested", meeting: "interested", notInterested: "rejected", stop: "rejected" };

// POST /api/leads/:id/reply  { text }  (Premium)
// on colle la réponse du prospect : AIDY la classe, met à jour le statut et écrit la réponse à envoyer
export async function replyToLead(req, res) {
  const lead = await findMyLead(req, res);
  if (!lead) return;
  if (isLocked(lead)) return res.status(403).json({ message: "Unlock this lead first" });

  const user = await User.findById(req.userId);
  if (!isPremium(user)) {
    return res.status(402).json({ message: "The AIDY reply assistant is a Premium feature" });
  }
  const offer = await Offer.findById(lead.offerId);

  const result = await analyzeReply({
    offer,
    business: lead.businessId,
    lead,
    sellerProfile: user.toObject().sellerProfile || {},
    signature: senderNameOf(user),
    prospectText: req.body.text,
  });

  const now = new Date();
  lead.replies.push({ from: "prospect", text: req.body.text, label: result.label, at: now });
  lead.replyLabel = result.label;
  lead.lastReplyAt = now;
  lead.repliedAt = lead.repliedAt || now;
  lead.suggestedReply = result.reply;
  lead.followUpAt = undefined; // il a répondu : plus de relance automatique
  if (!lead.contactedAt) lead.contactedAt = now;
  if (lead.status !== "client") lead.status = STATUS_BY_LABEL[result.label];
  lead.waitingForMe = !["notInterested", "stop"].includes(result.label);
  await lead.save();

  // STOP : le commerce va dans la liste "ne plus contacter"
  let blocked = false;
  if (result.label === "stop" && lead.businessId) {
    const b = lead.businessId;
    await Blocklist.findOneAndUpdate(
      { userId: req.userId, googlePlaceId: b.googlePlaceId },
      { userId: req.userId, businessId: b._id, googlePlaceId: b.googlePlaceId, name: b.name, phone: b.phone, email: b.email, reason: "Asked to stop (AIDY)" },
      { upsert: true }
    );
    await Lead.updateMany({ userId: req.userId, businessId: b._id }, { $set: { status: "rejected" }, $unset: { followUpAt: "" } });
    blocked = true;
  }

  const subject = lead.emailSubject ? `Re: ${lead.emailSubject}` : "";
  res.status(200).json({
    label: result.label,
    summary: result.summary,
    questions: result.questions,
    missingInfo: result.missingInfo, // infos à ajouter à la fiche pour mieux répondre
    reply: result.reply,
    blocked,
    links: lead.businessId ? sendLinks(lead.businessId, result.reply, subject, { includeLandlines: offer?.includeLandlines }) : {},
    lead: withLinks(lead, offer, senderNameOf(user)),
  });
}

// POST /api/leads/:id/reply/sent  { text? }
// la réponse a été envoyée (le texte d'AIDY, ou la version modifiée) : on l'ajoute à la conversation
export async function replySent(req, res) {
  const lead = await findMyLead(req, res);
  if (!lead) return;
  if (isLocked(lead)) return res.status(403).json({ message: "Unlock this lead first" });
  const text = req.body.text || lead.suggestedReply;
  if (!text) return res.status(400).json({ message: "No reply to save" });

  lead.replies.push({ from: "me", text, at: new Date() });
  lead.suggestedReply = "";
  lead.waitingForMe = false;
  lead.lastContactAt = new Date();
  await lead.save();

  const offer = await Offer.findById(lead.offerId);
  const user = await User.findById(req.userId);
  res.status(200).json(withLinks(lead, offer, senderNameOf(user)));
}
