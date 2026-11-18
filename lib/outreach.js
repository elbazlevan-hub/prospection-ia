// Envoi des messages et relances : liens "en un clic" + calendrier des relances
import { mobileOnly } from "./phone.js";

// relance 1 : 3 jours après le premier message, relance 2 : 4 jours après (= J+7). Ensuite on arrête.
export const FOLLOW_UP_DELAYS_DAYS = [3, 4];
export const MAX_FOLLOW_UPS = FOLLOW_UP_DELAYS_DAYS.length;

const DAY = 24 * 60 * 60 * 1000;

export function addDays(date, days) {
  return new Date(date.getTime() + days * DAY);
}

export function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfToday() {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

// date de la prochaine relance après `count` relances déjà faites (null = plus de relance)
export function nextFollowUp(from, count) {
  const delay = FOLLOW_UP_DELAYS_DAYS[count];
  return delay ? addDays(from, delay) : null;
}

// texte de relance court, dans la langue de l'offre (anglais si langue inconnue)
const FOLLOW_UP_TEXT = {
  fr: (sender) =>
    `Bonjour, je me permets de revenir vers vous au sujet de mon message précédent. Seriez-vous disponible pour en parler quelques minutes cette semaine ?\n${sender}\n\nRépondez STOP si vous ne souhaitez plus être contacté.`,
  en: (sender) =>
    `Hello, just following up on my previous message. Would you have a few minutes to talk about it this week?\n${sender}\n\nReply STOP if you don't want to be contacted again.`,
  es: (sender) =>
    `Hola, le escribo de nuevo sobre mi mensaje anterior. ¿Tendría unos minutos para hablarlo esta semana?\n${sender}\n\nResponda STOP si no desea ser contactado de nuevo.`,
  de: (sender) =>
    `Hallo, ich melde mich noch einmal zu meiner letzten Nachricht. Hätten Sie diese Woche ein paar Minuten Zeit, darüber zu sprechen?\n${sender}\n\nAntworten Sie STOP, wenn Sie nicht mehr kontaktiert werden möchten.`,
};

export function followUpMessage(language, sender) {
  const write = FOLLOW_UP_TEXT[language] || FOLLOW_UP_TEXT.en;
  return write(sender || "");
}

// liens prêts à cliquer pour envoyer `text` au commerce
// - whatsapp : ouvre WhatsApp avec le message déjà écrit (portables seulement)
// - email : ouvre la messagerie avec l'objet et le texte
// - instagram : ouvre le profil (Instagram ne permet pas de pré-remplir : le texte est à copier)
export function sendLinks(business, text, subject = "") {
  const links = {};
  const mobile = mobileOnly(business.phone, business.country);
  if (mobile) {
    const digits = mobile.replace(/\D/g, "");
    links.whatsapp = `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
  }
  if (business.email) {
    const params = [subject && `subject=${encodeURIComponent(subject)}`, `body=${encodeURIComponent(text)}`]
      .filter(Boolean)
      .join("&");
    links.email = `mailto:${business.email}?${params}`;
  }
  if (business.instagram) {
    links.instagram = business.instagram;
  }
  if (mobile) links.phone = `tel:${mobile.replace(/\s/g, "")}`;
  return links;
}
