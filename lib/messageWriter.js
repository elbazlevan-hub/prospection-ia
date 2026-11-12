import { askClaude, parseJson } from "./claude.js";

// si le JSON est cassé (ex. guillemets non échappés dans le message),
// on récupère quand même les champs : "message" est le dernier champ demandé
function parseAnswer(text) {
  try {
    return parseJson(text);
  } catch (err) {
    const pick = (key) => text.match(new RegExp(`"${key}"\\s*:\\s*"([\\s\\S]*?)"\\s*,\\s*"`))?.[1];
    const message = text.match(/"message"\s*:\s*"([\s\S]*)"\s*}/)?.[1];
    if (!message) throw err;
    console.warn("AI JSON repaired with fallback");
    return {
      fits: !/"fits"\s*:\s*false/.test(text),
      fitReason: pick("fitReason"),
      painPoints: [],
      subject: pick("subject"),
      message: message.replace(/\\n/g, "\n").replace(/\\"/g, '"'),
    };
  }
}

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
- Never use double quotes (") inside the texts: use single quotes (') if you quote something. Use \\n for line breaks.
- Write the subject and the message in the requested language.
If a "customCriterion" is given, decide honestly from the data whether the business matches it ("fits"); if there is no customCriterion, fits = true.
Answer with ONLY a JSON object, no other text:
{"fits": boolean, "fitReason": "short reason in English", "painPoints": ["short", "phrases"], "subject": "email subject", "message": "the message"}`;

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

  // si la réponse de l'IA n'est pas un JSON valide, on redemande (2 essais en tout)
  let result;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const text = await askClaude({
      system: SYSTEM,
      prompt: `Data:\n${JSON.stringify(data, null, 2)}${attempt > 1 ? "\n\nReturn ONLY valid JSON, with \\n for line breaks inside strings." : ""}`,
    });
    try {
      result = parseAnswer(text);
      break;
    } catch (err) {
      if (attempt === 2) throw err;
      console.warn("AI answer was not valid JSON, retrying...");
    }
  }

  return {
    fits: result.fits !== false,
    fitReason: String(result.fitReason || "").slice(0, 300),
    painPoints: Array.isArray(result.painPoints) ? result.painPoints.slice(0, 5).map(String) : [],
    subject: String(result.subject || "").slice(0, 200),
    message: String(result.message || "").slice(0, 2000),
  };
}
