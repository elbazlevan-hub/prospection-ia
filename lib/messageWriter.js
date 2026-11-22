import { askClaudeJson } from "./claude.js";
import { isEverywhere } from "../models/offer.model.js";

const LANGUAGES = { en: "English", fr: "French", es: "Spanish", de: "German", it: "Italian", pt: "Portuguese", nl: "Dutch", ar: "Arabic", he: "Hebrew", ru: "Russian" };

// explications lisibles des raisons détectées à l'étape 4 (pour l'IA)
const REASON_TEXT = {
  noWebsite: "has no website at all",
  socialOnly: "only has a social media page (Facebook / Instagram / Linktree), no real website",
  siteDown: "its website does not work (error or unreachable)",
  oldWebsite: "its website looks outdated",
  whatsappBooking: "customers book or order through WhatsApp messages",
  noOnlineBooking: "customers cannot book or order online",
  lowRating: "its Google rating is below 4 stars",
  fewReviews: "it has few Google reviews",
  noSocial: "its website has no links to social media",
  fewPhotos: "its Google listing has very few photos",
  noInstagram: "it has no Instagram account",
  noHours: "its Google listing has no opening hours",
};

const SYSTEM = `You write the FIRST message a seller sends to a local business. It must be short and about ONE thing: the business's problem and how the seller fixes it.
It works for any trade (websites, photos, social media, cleaning, accounting...): adapt to the seller's offer.
Structure, in this order, nothing else:
  1. A greeting with the business name.
  2. THE PROBLEM, in one sentence: the main problem found ("reasons"), as a concrete, polite observation
     (e.g. "I noticed you don't have a website, so clients can only book by WhatsApp").
  3. WHAT IT COSTS THEM, in one short sentence (e.g. "Clients who search at night can't book and go elsewhere.").
  4. THE SOLUTION, in one sentence: what the seller does that fixes exactly this problem.
  5. One simple question, following "contactPreference" (see below).
Rules:
- Maximum 60 words in total. Short sentences. No compliments, no statistics, no numbers about competitors, no list of features.
- Use ONLY the facts in the data. Never invent numbers, names, prices, results or promises.
- If "reasons" is empty, look in the reviews for a real problem the offer solves (never quote or name the customer);
  if there is none, do NOT invent a problem: write a 2-sentence neutral introduction of the offer and the question.
- If "mode" is "product" (the seller targets all businesses of this type, no problem to find), use this structure instead:
  1. greeting with the business name, 2. what the seller offers to businesses like this one (one sentence),
  3. the seller's advantage ("sellingPoint") in one sentence, 4. one simple question following "contactPreference" (e.g. a free trial or a quote).
- contactPreference = how the seller wants to continue the conversation. The final question MUST respect it:
  "message": continue in writing only (e.g. "Would you like me to tell you more here?"). NEVER propose a call, a meeting or a visit.
  "call": propose a short call (e.g. "Are you free for a quick 10-minute call this week?").
  "either": let them choose (e.g. "Can I send you more details here, or would you prefer a quick call?").
- NEVER claim past work, clients, experience or results, and NEVER offer to send "examples of what I've done",
  unless "portfolioUrl" is given. If it is given, you may offer to send examples (do not write the link yourself).
- Adapt the solution to HOW clients contact this kind of business. Trades that clients CALL, often in an emergency
  (electrician, plumber, locksmith, towing, glazier, pest control, repair...), do not need online booking:
  for them, ignore the reasons about booking or ordering online; if the website is outdated or too simple, the solution is
  a modern, impressive website that inspires trust and makes clients want to call (big call button, reviews, photos of jobs).
  Only talk about online booking for businesses that take appointments or orders (salons, restaurants, clinics, coaches...).
- If a "sellingPoint" is given, use it in the solution sentence. Never invent other advantages.
- Friendly and respectful, never pushy. No emoji.
- Do NOT sign and do NOT write the sender's name: the app adds the signature itself.
- optOut: one short polite sentence to stop receiving messages (e.g. "If you'd rather not hear from me, just tell me.").
- Write the subject, the message and optOut in the requested language.
- You do not know the gender of the owner: use gender-neutral wording (e.g. in French "Seriez-vous disponible", never "ouverte" or "ouvert").
If a "customCriterion" is given, decide honestly from the data whether the business matches it ("fits"); if there is no customCriterion, fits = true.
Give your answer with the save_message tool.`;

// format imposé à la réponse de l'IA (toujours un JSON valide)
const MESSAGE_SCHEMA = {
  type: "object",
  properties: {
    fits: { type: "boolean", description: "true if the business matches the customCriterion (true if none)" },
    fitReason: { type: "string", description: "short reason in English" },
    painPoints: { type: "array", items: { type: "string" }, description: "short phrases" },
    subject: { type: "string", description: "email subject" },
    message: { type: "string", description: "the message WITHOUT signature and WITHOUT the opt-out sentence, with real line breaks" },
    optOut: { type: "string", description: "one short sentence to stop receiving messages" },
  },
  required: ["fits", "painPoints", "subject", "message", "optOut"],
};

// écrit le message pour un prospect
export async function writeMessage({ offer, business, matchReasons, reviews, senderName, contactPreference = "message", portfolioUrl }) {
  const data = {
    language: LANGUAGES[offer.messageLanguage] || offer.messageLanguage,
    sender: {
      name: senderName,
      offer: offer.title,
      offerDescription: offer.description,
      serviceType: offer.serviceType,
      sellingPoint: offer.sellingPoint || undefined,
      portfolioUrl: portfolioUrl || undefined, // pas de lien = pas d'« exemples de mes réalisations »
    },
    contactPreference: ["message", "call", "either"].includes(contactPreference) ? contactPreference : "message",
    mode: offer.criteria?.length ? "problem" : "product",
    customCriterion: offer.customCriterion || null,
    business: {
      name: business.name,
      category: business.category,
      city: isEverywhere(business.city) ? undefined : business.city, // jamais "toutes les villes" dans un message
      rating: business.rating,
      reviewCount: business.reviewCount,
      hasWebsite: business.analysis?.hasWebsite ?? Boolean(business.website),
    },
    reasons: matchReasons.map((r) => REASON_TEXT[r] || r),
    reviews,
  };

  // réponse structurée : l'IA remplit un formulaire (schéma), donc plus d'erreur de JSON
  const result = await askClaudeJson({
    system: SYSTEM,
    prompt: `Data:\n${JSON.stringify(data, null, 2)}`,
    maxTokens: 2500, // assez de place pour les langues longues (hébreu, arabe...) : le message n'est jamais coupé
    name: "save_message",
    description: "Save the outreach message written for this business",
    schema: MESSAGE_SCHEMA,
  });
  if (!result?.message) throw new Error("AI answer has no message");

  return {
    fits: result.fits !== false,
    fitReason: String(result.fitReason || "").slice(0, 300),
    painPoints: Array.isArray(result.painPoints) ? result.painPoints.slice(0, 5).map(String) : [],
    subject: String(result.subject || "").slice(0, 200),
    // la signature est ajoutée par l'app, telle qu'écrite dans les Réglages (jamais traduite par l'IA)
    message: [String(result.message || "").trim(), senderName, String(result.optOut || "").trim()].filter(Boolean).join("\n\n").slice(0, 2000),
  };
}
