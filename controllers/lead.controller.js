import mongoose from "mongoose";
import Lead from "../models/lead.model.js";
import Business from "../models/business.model.js";
import Offer from "../models/offer.model.js";
import User, { senderNameOf, isPremium, isJobOffer, creditsFor, spendCredits } from "../models/user.model.js";
import { analyzeReply } from "../lib/replyAssistant.js";
import Blocklist, { blockedSetOf, isBlocked } from "../models/blocklist.model.js";
import { sendLinks, followUpMessage, nextFollowUp, startOfToday, MAX_FOLLOW_UPS } from "../lib/outreach.js";
import { isLocked, publicLead, canContact } from "../lib/locking.js";
import { generateFor, runInParallel } from "./message.controller.js";

function checkId(id, res) {
  if (!mongoose.isValidObjectId(id)) {
    res.status(400).json({ message: "Invalid lead id" });
    return false;
  }
  return true;
}

// « empreinte » d'un commerce : Google a parfois 2 fiches pour le même commerce (2 googlePlaceId différents).
// Même portable, même email, même Instagram, ou même nom + même adresse = le même commerce.
function shopKeysOf(b) {
  if (!b) return [];
  const keys = [];
  const digits = String(b.phone || "").replace(/\D/g, "");
  if (digits.length >= 8) keys.push("tel:" + digits.slice(-9));
  if (b.email) keys.push("mail:" + b.email.toLowerCase());
  if (b.instagram) keys.push("ig:" + b.instagram.toLowerCase().replace(/\/+$/, ""));
  if (b.name && b.address) keys.push("addr:" + `${b.name}|${b.address}`.toLowerCase().replace(/\s+/g, " ").trim());
  return keys;
}
const sameShop = (a, b) => {
  const keys = new Set(shopKeysOf(a));
  return shopKeysOf(b).some((k) => keys.has(k));
};

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
      text: followUpMessage(offer?.messageLanguage, senderName, offer?.serviceType === "job"),
      subject: lead.emailSubject ? `Re: ${lead.emailSubject}` : "",
    };
  }
  return { kind: "first", text: lead.message, subject: lead.emailSubject };
}

// ajoute au prospect les liens d'envoi (WhatsApp, email, Instagram, téléphone)
// un prospect verrouillé est renvoyé masqué (sans nom, contacts ni message)
export function withLinks(lead, offer, senderName) {
  return publicLead(lead, offer, (obj) => {
    const next = nextMessageOf(lead, offer, senderName);
    const canSend = ["toContact", "contacted"].includes(lead.status) && Boolean(next.text);
    return {
      nextMessage: canSend ? next : null,
      links:
        canSend && lead.businessId
          ? sendLinks(obj.businessId, next.text, next.subject, { includeLandlines: offer?.includeLandlines })
          : {},
      // la réponse proposée par AIDY : boutons WhatsApp / SMS / email prêts, même après avoir rechargé la page
      replyLinks:
        lead.suggestedReply && obj.businessId
          ? sendLinks(obj.businessId, lead.suggestedReply, lead.emailSubject ? `Re: ${lead.emailSubject}` : "", { includeLandlines: offer?.includeLandlines })
          : {},
    };
  });
}

// débloque des prospects (1 crédit chacun) puis AIDY écrit leur message
// renvoie { unlocked, credits, messageErrors }
export async function unlockLeads(leads, offer, user, writeMessages = true) {
  const toUnlock = leads.filter((l) => isLocked(l) && canContact(l.businessId, offer)); // jamais de crédit pour un commerce injoignable
  const free = user.role === "admin";
  const count = free ? toUnlock.length : Math.min(toUnlock.length, creditsFor(user, offer));
  const chosen = toUnlock.slice(0, count);
  if (chosen.length === 0) return { unlocked: [], credits: user.credits, messageErrors: 0 };

  const now = new Date();
  for (const lead of chosen) {
    lead.unlocked = true;
    lead.unlockedAt = now;
    await lead.save();
  }
  if (!free) {
    spendCredits(user, offer, chosen.length); // Pack Emploi : seulement pour une offre emploi
    await user.save();
  }

  // le message AIDY est inclus dans le déblocage
  let messageErrors = 0;
  if (writeMessages) {
    const allLeads = await Lead.find({ offerId: offer._id, userId: user._id }).populate("businessId");
    const toWrite = chosen.filter((lead) => !lead.message && lead.score > 0);
    // plusieurs messages écrits en même temps (plus rapide quand on débloque tout)
    const { errors } = await runInParallel(toWrite, (lead) =>
      generateFor(lead, offer, allLeads, senderNameOf(user), user.sellerProfile || {})
    );
    messageErrors = errors.length;
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

  if (creditsFor(user, offer) < 1) {
    return res.status(402).json({ message: "No credits left: buy a pack to unlock more leads", credits: 0 });
  }
  // on débloque après l'analyse : sinon on ne sait pas encore quel est son problème
  if (!lead.businessId?.analyzedAt) {
    return res.status(400).json({ message: "Run the analysis first: AIDY needs to know this business's problems" });
  }
  if (!canContact(lead.businessId, offer)) {
    return res.status(400).json({ message: "This business has no phone, email or Instagram: it can't be contacted" });
  }
  const result = await unlockLeads([lead], offer, user, req.query.message !== "false");
  res.status(200).json({
    credits: result.credits,
    messageError: result.messageErrors > 0 || undefined,
    lead: withLinks(lead, offer, senderNameOf(user)),
  });
}

// un crédit rendu retourne d'où il vient : crédits emploi pour une offre emploi, sinon crédits normaux
function refundCredit(user, offer) {
  if (isJobOffer(offer)) user.jobCredits = (user.jobCredits || 0) + 1;
  else user.credits += 1;
}

// GET /api/leads/:id  -> un prospect avec son commerce, son message et les liens d'envoi
export async function getLead(req, res) {
  const lead = await findMyLead(req, res);
  if (!lead) return;
  const offer = await Offer.findById(lead.offerId);
  const user = await User.findById(req.userId);

  // ancien prospect débloqué sans aucun contact : il sort de la liste, et le crédit est rendu
  if (!isLocked(lead) && lead.status === "toContact" && !canContact(lead.businessId, offer)) {
    lead.status = "rejected";
    if (lead.unlockedAt && !lead.refundedAt && user.role !== "admin") {
      lead.refundedAt = new Date();
      refundCredit(user, offer);
      await user.save();
    }
    await lead.save();
    return res.status(200).json({ ...withLinks(lead, offer, senderNameOf(user)), unreachable: true });
  }
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

  // « pas intéressé » : ses doublons dans la même offre (2e fiche Google du même commerce) sont refusés aussi
  if (status === "rejected") {
    const others = await Lead.find({ userId: req.userId, offerId: lead.offerId, _id: { $ne: lead._id }, status: { $ne: "rejected" } }).populate("businessId");
    const twins = others.filter((l) => sameShop(l.businessId, lead.businessId));
    if (twins.length) {
      await Lead.updateMany({ _id: { $in: twins.map((l) => l._id) } }, { $set: { status: "rejected", waitingForMe: false }, $unset: { followUpAt: "" } });
    }
  }

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
    sellerLanguage: req.body.lang || user.language,
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

// POST /api/leads/:id/bad-phone  -> « le numéro ne marche pas »
// le numéro est caché, signalé pour tout le monde, et le crédit est rendu SI :
//  - le commerce n'a aucun autre contact (email, Instagram), sinon il reste contactable
//  - il n'a jamais répondu (ni à moi, ni à un autre utilisateur) : une réponse prouve que le numéro marche
//  - maximum 3 crédits rendus par mois et par compte (anti-triche)
export const MAX_REFUNDS_PER_MONTH = 3;
const PHONE_REPORTS_TO_CONFIRM = 2; // 2 utilisateurs différents = numéro faux pour tout le monde

export async function reportBadPhone(req, res) {
  const lead = await findMyLead(req, res);
  if (!lead) return;
  if (isLocked(lead)) return res.status(403).json({ message: "Unlock this lead first" });
  const business = lead.businessId;
  const phone = business?.phone || business?.landline;
  if (!phone || lead.badPhoneAt) return res.status(400).json({ message: "No phone number to report" });

  const [offer, user] = await Promise.all([Offer.findById(lead.offerId), User.findById(req.userId)]);
  const now = new Date();

  // signalement partagé : au 2e utilisateur, le numéro n'est plus proposé à personne
  if (!business.phoneReports.some((r) => String(r.userId) === String(req.userId))) {
    business.phoneReports.push({ userId: req.userId, phone, at: now });
  }
  const reporters = new Set(business.phoneReports.filter((r) => r.phone === phone).map((r) => String(r.userId)));
  if (reporters.size >= PHONE_REPORTS_TO_CONFIRM) {
    if (!business.badPhones.includes(phone)) business.badPhones.push(phone);
    if (business.phone === phone) business.phone = undefined;
    if (business.landline === phone) business.landline = undefined;
  }
  await business.save();

  // remboursement : seulement si toutes les règles sont respectées
  const hasOtherContact = Boolean(business.email || business.instagram);
  const answered =
    Boolean(lead.repliedAt) || lead.replies?.some((r) => r.from === "prospect") || ["interested", "client"].includes(lead.status);
  const answeredOthers = await Lead.exists({
    businessId: business._id,
    userId: { $ne: req.userId },
    $or: [{ repliedAt: { $exists: true } }, { status: { $in: ["interested", "client"] } }],
  });
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const refundsThisMonth = await Lead.countDocuments({ userId: req.userId, refundedAt: { $gte: monthAgo } });

  let reason = null;
  if (user.role === "admin") reason = "unlimited";
  else if (lead.refundedAt) reason = "alreadyRefunded";
  else if (hasOtherContact) reason = "otherContact";
  else if (answered || answeredOthers) reason = "answered";
  else if (refundsThisMonth >= MAX_REFUNDS_PER_MONTH) reason = "limit";

  lead.badPhoneAt = now;
  if (!reason) {
    lead.refundedAt = now;
    refundCredit(user, offer);
    await user.save();
  }
  // plus aucun moyen de le contacter : il sort de la liste « à contacter »
  if (!hasOtherContact && ["toContact", "contacted"].includes(lead.status)) lead.status = "rejected";
  await lead.save();

  res.status(200).json({
    refunded: !reason,
    reason,
    credits: user.credits,
    lead: withLinks(lead, offer, senderNameOf(user)),
  });
}

// GET /api/leads/search?q=bayside&offerId=...  -> retrouver vite un commerce débloqué (nom, téléphone, email, Instagram)
// dans toutes mes offres, par exemple pour le passer en « Refusé » quand il répond qu'il n'est pas intéressé
export async function searchLeads(req, res) {
  const q = String(req.query.q || "").trim().slice(0, 60);
  if (q.length < 2) return res.status(200).json([]);

  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); // le texte tapé est cherché tel quel (pas une regex)
  const or = [
    { name: { $regex: escaped, $options: "i" } },
    { email: { $regex: escaped, $options: "i" } },
    { instagram: { $regex: escaped, $options: "i" } },
  ];
  // un numéro tapé avec ou sans espaces / tirets : "050 123" trouve "+972 50-123-4567"
  const digits = q.replace(/\D/g, "");
  if (digits.length >= 4) {
    const loose = digits.replace(/^0/, "").split("").join("\\D*");
    or.push({ phone: { $regex: loose } }, { landline: { $regex: loose } });
  }

  const businesses = await Business.find({ $or: or }).select("_id").limit(500);
  const leads = await Lead.find({
    userId: req.userId, // seulement MES prospects
    ...(mongoose.isValidObjectId(req.query.offerId) && { offerId: req.query.offerId }), // dans cette offre seulement
    businessId: { $in: businesses.map((b) => b._id) },
    unlocked: { $ne: false }, // jamais les commerces verrouillés (pas payés)
  })
    .populate("businessId", "name category city phone email instagram address")
    .populate("offerId", "title")
    .sort({ lastContactAt: -1, updatedAt: -1 }) // le plus récemment contacté / modifié d'abord
    .limit(50);

  // même commerce en double (2 fiches Google) : on garde seulement le plus récent, dans chaque offre
  const kept = [];
  for (const l of leads) {
    const twin = kept.some((k) => String(k.offerId?._id) === String(l.offerId?._id) && sameShop(k.businessId, l.businessId));
    if (!twin) kept.push(l);
  }

  res.status(200).json(
    kept.slice(0, 20).map((l) => ({
      _id: l._id,
      name: l.businessId?.name,
      category: l.businessId?.category,
      city: l.businessId?.city,
      status: l.status,
      offerTitle: l.offerId?.title,
    }))
  );
}
