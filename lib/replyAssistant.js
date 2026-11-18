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
   - If the business asks something that is not in the data, say the seller will confirm it, and offer a short call.
   - If a booking link exists and they want to talk, give it.
   - Short (max 80 words), friendly, professional, no pressure. You do not know the gender of the person: stay neutral.
   - Sign with the seller's signature.
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
    missingInfo: { type: "array", items: { type: "string" }, description: "infos the seller should add to sellerInfo to answer better" },
  },
  required: ["label", "summary", "reply"],
};

export async function analyzeReply({ offer, business, lead, sellerProfile, signature, prospectText }) {
  const conversation = [
    ...(lead.message ? [{ from: "me", text: lead.message }] : []),
    ...(lead.replies || []).map((r) => ({ from: r.from, text: r.text })),
    { from: "business", text: prospectText },
  ].slice(-8); // les 8 derniers messages suffisent

  const data = {
    offer: { title: offer.title, description: offer.description, price: offer.price || null, currency: offer.currency },
    sellerInfo: { ...sellerProfile, signature },
    business: { name: business?.name, category: business?.category, city: business?.city },
    conversation,
  };

  const result = await askClaudeJson({
    system: SYSTEM,
    prompt: `Data:\n${JSON.stringify(data, null, 2)}`,
    maxTokens: 800,
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
