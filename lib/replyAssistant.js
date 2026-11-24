// Assistant de réponse AIDY (Premium) : comprend la réponse d'un prospect et écrit la réponse à envoyer
import { askClaudeJson } from "./claude.js";

export const REPLY_LABELS = ["interested", "question", "meeting", "notInterested", "stop"];

const SYSTEM = `You help a seller answer a local business that replied to a prospecting message.
1) Classify the business's LAST reply with one label:
   - interested: positive, wants to know more
   - question: asks something (price, delay, examples, how it works...)
   - meeting: wants a call, a meeting or a visit
   - notInterested: politely declines
   - stop: asks not to be contacted again (STOP, unsubscribe, leave me alone...)
2) Write the seller's answer, in the SAME language as the business's last reply:
   - Use ONLY the facts in "sellerInfo" and "offer". Never invent a price, a delay, a link, a guarantee or a result.
   - If the business asks something that is not in the data, say the seller will confirm it very soon.
   - Respect sellerInfo.contactPreference: "message" = continue in writing, NEVER propose a call or a meeting;
     "call" = you may propose a short call; "either" = let them choose.
   - If offer.isJob is true, the sender is applying for a JOB (not selling): answer as a polite candidate (availability, experience, CV link if given).
   - If a booking link exists and they want to talk, give it.
   - Short (max 80 words), friendly, professional, no pressure. You do not know the gender of the person: stay neutral.
   - Sign with the seller's signature EXACTLY as written in sellerInfo.signature: never translate or transliterate it.
   - The business may say your first message was wrong ("I already have a website", "where did you get that?"). Then:
     1. say exactly where the observation came from, using "observed" (e.g. "your Google listing has no link to your website",
        "on your website, bookings go through WhatsApp"); if they are right, admit it in a few words, no long apology;
     2. move on to the REAL problem that remains in "observed" (e.g. bookings only by WhatsApp, an old website not made for phones)
        and what it costs them, in one sentence;
     3. make one concrete offer from "offer" and end with one simple question. Never ask them to explain how they work instead.
   - notInterested: thank them politely in 1-2 sentences, no insisting.
   - stop: one short sentence confirming they will not be contacted again.
Give your answer with the save_reply tool.`;

const SCHEMA = {
  type: "object",
  properties: {
    label: { type: "string", enum: REPLY_LABELS },
    summary: { type: "string", description: "what the business said, in a few words, in English" },
    questions: { type: "array", items: { type: "string" }, description: "questions asked by the business, if any" },
    reply: { type: "string", description: "the answer to send, with real line breaks" },
    missingInfo: { type: "array", items: { type: "string" }, description: "infos the seller should add to sellerInfo to answer better, short, written in the seller's app language (sellerLanguage)" },
  },
  required: ["label", "summary", "reply"],
};

// ce qu'AIDY a vraiment vu sur ce commerce (fiche Google + visite du site) : l'assistant s'en sert pour répondre précisément
function observedFacts(business, lead) {
  const a = business?.analysis || {};
  return {
    websiteOnGoogleListing: business?.website || null,
    hasRealWebsite: a.hasWebsite ?? Boolean(business?.website),
    websiteOutdated: a.isOutdated || undefined,
    outdatedSignals: a.outdatedSignals?.length ? a.outdatedSignals : undefined, // noHttps, notMobile, oldCopyright...
    bookingByWhatsApp: a.whatsappBooking || undefined,
    onlineBookingFound: a.onlineBooking ?? undefined,
    deliveryPlatforms: a.deliveryPlatforms?.length ? a.deliveryPlatforms : undefined,
    googleRating: business?.rating,
    googleReviews: business?.reviewCount,
    googlePhotos: business?.photoCount,
    problemsInFirstMessage: lead?.matchReasons || [],
  };
}

export async function analyzeReply({ offer, business, lead, sellerProfile, signature, prospectText, sellerLanguage = "en" }) {
  const conversation = [
    ...(lead.message ? [{ from: "me", text: lead.message }] : []),
    ...(lead.replies || []).map((r) => ({ from: r.from, text: r.text })),
    { from: "business", text: prospectText },
  ].slice(-8); // les 8 derniers messages suffisent

  const data = {
    offer: {
      title: offer.title,
      description: offer.description,
      // "sur devis" : l'IA ne donne pas de prix, elle propose d'en discuter
      price: offer.priceOnQuote ? "on quote (no fixed price: offer to make a personalized quote)" : offer.price || null,
      currency: offer.currency,
      isJob: offer.serviceType === "job",
      cvUrl: offer.serviceType === "job" ? offer.cvUrl : undefined,
    },
    sellerInfo: { ...sellerProfile, contactPreference: sellerProfile.contactPreference || "message", signature },
    business: { name: business?.name, category: business?.category, city: business?.city },
    observed: observedFacts(business, lead),
    sellerLanguage,
    conversation,
  };

  const result = await askClaudeJson({
    system: SYSTEM,
    prompt: `Data:\n${JSON.stringify(data, null, 2)}`,
    maxTokens: 2500, // assez de place pour l'hébreu, l'arabe... (sinon la réponse est coupée)
    name: "save_reply",
    description: "Save the classification and the answer to send",
    schema: SCHEMA,
  });

  return {
    label: REPLY_LABELS.includes(result.label) ? result.label : "interested",
    summary: String(result.summary || "").slice(0, 300),
    questions: Array.isArray(result.questions) ? result.questions.slice(0, 5).map(String) : [],
    reply: String(result.reply || "").slice(0, 2000),
    missingInfo: Array.isArray(result.missingInfo) ? result.missingInfo.slice(0, 5).map(String) : [],
  };
}
