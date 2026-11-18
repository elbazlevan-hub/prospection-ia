import { askClaudeJson } from "./claude.js";

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
};

const SYSTEM = `You write short, honest, personalized B2B outreach messages that a seller sends to a local business.
Rules:
- Use ONLY the facts in the data. Never invent numbers, names, prices, results or promises.
- Mention 1 or 2 concrete observations about this business (from the reasons, the reviews or the competitors).
- "competitorsInSameCity" counts similar businesses found in the same city search, NOT necessarily nearby: say "in <city>", never "nearby" or "around you".
- If reviews show a real customer problem the seller's offer solves (e.g. "hard to book", "never answers the phone"), use it politely without quoting the customer's name.
- Friendly and respectful, never pushy. Maximum 90 words for the message. At most 1 emoji.
- End with one simple question (e.g. a short call).
- Sign with the sender's name.
- Last line: a short polite opt-out sentence (e.g. "If you'd rather not hear from me, just tell me.").
- Write the subject and the message in the requested language.
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
    message: { type: "string", description: "the message, with real line breaks" },
  },
  required: ["fits", "painPoints", "subject", "message"],
};

// écrit le message pour un prospect
export async function writeMessage({ offer, business, matchReasons, reviews, competitors, senderName }) {
  const data = {
    language: LANGUAGES[offer.messageLanguage] || offer.messageLanguage,
    sender: {
      name: senderName,
      offer: offer.title,
      offerDescription: offer.description,
      serviceType: offer.serviceType,
    },
    customCriterion: offer.customCriterion || null,
    business: {
      name: business.name,
      category: business.category,
      city: business.city,
      rating: business.rating,
      reviewCount: business.reviewCount,
      hasWebsite: business.analysis?.hasWebsite ?? Boolean(business.website),
    },
    reasons: matchReasons.map((r) => REASON_TEXT[r] || r),
    competitorsInSameCity: competitors, // ex. { total: 25, withWebsite: 20, withOnlineBooking: 12 } dans la même ville
    reviews,
  };

  // réponse structurée : l'IA remplit un formulaire (schéma), donc plus d'erreur de JSON
  const result = await askClaudeJson({
    system: SYSTEM,
    prompt: `Data:\n${JSON.stringify(data, null, 2)}`,
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
    message: String(result.message || "").slice(0, 2000),
  };
}
