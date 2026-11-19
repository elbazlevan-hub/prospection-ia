// AIDY remplit une offre à partir d'une description libre de l'utilisateur
import { askClaudeJson } from "./claude.js";
import { CRITERIA } from "./scoring.js";

const CRITERIA_HELP = {
  noWebsite: "no website at all",
  socialOnly: "only a Facebook / Instagram / Linktree page instead of a website",
  siteDown: "website does not work",
  oldWebsite: "website looks outdated or not mobile friendly",
  whatsappBooking: "customers book or order through WhatsApp",
  noOnlineBooking: "no online booking or ordering",
  lowRating: "Google rating below 4 stars",
  fewReviews: "fewer than 20 Google reviews",
  noSocial: "website has no links to social media",
  fewPhotos: "fewer than 5 photos on the Google listing",
  noInstagram: "no Instagram account found",
  noHours: "no opening hours on the Google listing",
};

const SYSTEM = `You help a seller set up a B2B prospecting campaign. From the seller's own description of what they sell, fill the campaign with the save_offer tool.
- title and description: in the seller's language.
- serviceType: 1-3 words in English (e.g. "website", "photography").
- targetCategories: 2 to 5 types of local businesses to search on Google Maps, in English, plain words (e.g. "restaurant", "hair salon").
  If the seller names the businesses they want (e.g. "for restaurants", "for barbers"), use exactly those and nothing else.
  Otherwise pick the types that MOST need this service and that are close to each other (e.g. a booking tool: hair salon, barber, nail salon),
  never a mix of unrelated trades.
- criteria: the signals that show a business NEEDS this service (1 to 5 keys from the allowed list).
- customCriterion: one extra condition the AI can check from reviews or data, in English, or empty if the criteria are enough.
- messageLanguage: 2-letter code of the language the messages should be written in.
Allowed criteria: ${CRITERIA.map((c) => `${c} (${CRITERIA_HELP[c]})`).join("; ")}.`;

const OFFER_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    description: { type: "string" },
    serviceType: { type: "string" },
    targetCategories: { type: "array", items: { type: "string" } },
    criteria: { type: "array", items: { type: "string", enum: CRITERIA } },
    customCriterion: { type: "string" },
    messageLanguage: { type: "string" },
  },
  required: ["title", "description", "serviceType", "targetCategories", "criteria", "messageLanguage"],
};

export async function suggestOffer({ text, country, city, language }) {
  const prompt = `Seller description: ${text}\nTarget country: ${country || "unknown"}\nTarget city: ${city || "unknown"}\nPreferred message language: ${language || "same as the description"}`;
  const raw = await askClaudeJson({
    system: SYSTEM,
    prompt,
    maxTokens: 600,
    name: "save_offer",
    description: "Save the prospecting campaign",
    schema: OFFER_SCHEMA,
  });

  // on ne garde que des valeurs valides (l'IA peut se tromper)
  const criteria = [...new Set((raw.criteria || []).filter((c) => CRITERIA.includes(c)))];
  const categories = (raw.targetCategories || []).filter((c) => typeof c === "string" && c.trim().length >= 2).slice(0, 5);
  return {
    title: String(raw.title || "").slice(0, 100),
    description: String(raw.description || "").slice(0, 1000),
    serviceType: String(raw.serviceType || "service").slice(0, 50),
    targetCategories: categories,
    criteria: criteria.length ? criteria : ["noWebsite"],
    customCriterion: raw.customCriterion?.trim() ? String(raw.customCriterion).slice(0, 300) : undefined,
    messageLanguage: /^[a-z]{2}$/.test(raw.messageLanguage || "") ? raw.messageLanguage : language || "en",
    targetCountry: country,
    targetCities: city ? [city] : [],
  };
}
