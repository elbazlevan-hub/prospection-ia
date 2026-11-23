// Envoi des messages et relances : liens "en un clic" + calendrier des relances
import { mobileOnly, landlineOf } from "./phone.js";

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
// neutre : ne propose ni appel ni rendez-vous, et n'invente rien
const FOLLOW_UP_TEXT = {
  fr: ["Bonjour, je me permets de revenir vers vous au sujet de mon message précédent. Est-ce que cela pourrait vous intéresser ?", "Répondez STOP si vous ne souhaitez plus être contacté."],
  en: ["Hello, just following up on my previous message. Could this be of interest to you?", "Reply STOP if you don't want to be contacted again."],
  es: ["Hola, le escribo de nuevo sobre mi mensaje anterior. ¿Podría interesarle?", "Responda STOP si no desea ser contactado de nuevo."],
  de: ["Hallo, ich melde mich noch einmal zu meiner letzten Nachricht. Wäre das für Sie interessant?", "Antworten Sie STOP, wenn Sie nicht mehr kontaktiert werden möchten."],
  he: ["שלום, רציתי לחזור אליכם לגבי ההודעה הקודמת שלי. האם זה יכול לעניין אתכם?", "אם אינכם מעוניינים לקבל הודעות נוספות, השיבו STOP."],
  ar: ["مرحباً، أردت المتابعة بخصوص رسالتي السابقة. هل يمكن أن يهمكم ذلك؟", "إذا كنتم لا ترغبون في تلقي رسائل أخرى، أرسلوا STOP."],
  it: ["Buongiorno, le riscrivo riguardo al mio messaggio precedente. Potrebbe interessarle?", "Risponda STOP se non desidera essere ricontattato."],
  pt: ["Olá, volto a escrever sobre a minha mensagem anterior. Isto poderia interessar-lhe?", "Responda STOP se não quiser ser contactado novamente."],
  ru: ["Здравствуйте, пишу ещё раз по поводу моего предыдущего сообщения. Вам это может быть интересно?", "Ответьте STOP, если не хотите больше получать сообщения."],
  nl: ["Hallo, ik kom even terug op mijn vorige bericht. Zou dit u interesseren?", "Antwoord STOP als u niet meer benaderd wilt worden."],
};

// relance d'une candidature (recherche d'emploi)
const FOLLOW_UP_JOB = {
  fr: "Bonjour, je me permets de revenir vers vous au sujet de ma candidature. Recrutez-vous en ce moment ?",
  en: "Hello, just following up on my job application. Are you hiring at the moment?",
  es: "Hola, le escribo de nuevo sobre mi candidatura. ¿Están contratando en este momento?",
  de: "Hallo, ich melde mich noch einmal wegen meiner Bewerbung. Stellen Sie gerade ein?",
  he: "שלום, רציתי לחזור אליכם לגבי המועמדות שלי. האם אתם מגייסים כרגע?",
  ar: "مرحباً، أردت المتابعة بخصوص طلب التوظيف الخاص بي. هل توظفون حالياً؟",
  it: "Buongiorno, le riscrivo riguardo alla mia candidatura. State assumendo in questo momento?",
  pt: "Olá, volto a escrever sobre a minha candidatura. Estão a contratar neste momento?",
  ru: "Здравствуйте, пишу ещё раз по поводу моего отклика на вакансию. Вы сейчас набираете сотрудников?",
  nl: "Hallo, ik kom even terug op mijn sollicitatie. Zoekt u op dit moment personeel?",
};

export function followUpMessage(language, sender, isJob = false) {
  const [saleText, stop] = FOLLOW_UP_TEXT[language] || FOLLOW_UP_TEXT.en;
  const text = isJob ? FOLLOW_UP_JOB[language] || FOLLOW_UP_JOB.en : saleText;
  return [text, sender, stop].filter(Boolean).join("\n\n");
}

// liens prêts à cliquer pour envoyer `text` au commerce
// - whatsapp : ouvre WhatsApp avec le message déjà écrit (portables seulement)
// - email : ouvre la messagerie avec l'objet et le texte
// - instagram : ouvre le profil (Instagram ne permet pas de pré-remplir : le texte est à copier)
// options.includeLandlines : ajoute un lien "appeler" vers le fixe s'il n'y a pas de portable
export function sendLinks(business, text, subject = "", options = {}) {
  const links = {};
  const mobile = mobileOnly(business.phone, business.country);
  if (mobile) {
    const digits = mobile.replace(/\D/g, "");
    links.whatsapp = `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
    // SMS avec le message déjà écrit (si le numéro n'est pas sur WhatsApp) ; « ?&body= » marche sur iPhone et Android
    links.sms = `sms:+${digits}?&body=${encodeURIComponent(text)}`;
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
  else if (options.includeLandlines && landlineOf(business)) links.phone = `tel:${landlineOf(business).replace(/\s/g, "")}`;
  // WhatsApp et email s'ouvrent avec le message déjà écrit ; ailleurs il faut copier puis coller
  links.needsCopy = !links.whatsapp && !links.email;
  return links;
}
