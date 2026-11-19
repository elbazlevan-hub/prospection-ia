import crypto from "node:crypto";

// ---------- Anti-abus de l'essai gratuit (5 commerces offerts) ----------
// 1) emails jetables refusés
// 2) même boîte mail déguisée (jean+1@gmail.com, j.ean@gmail.com) = pas de 2e essai
// 3) au maximum FREE_TRIALS_PER_IP essais gratuits par connexion internet sur 30 jours

export const FREE_TRIALS_PER_IP = Number(process.env.FREE_TRIALS_PER_IP) || 2;
export const TRIAL_WINDOW_DAYS = 30;

// les services d'emails jetables les plus utilisés
export const DISPOSABLE_DOMAINS = new Set([
  "yopmail.com", "yopmail.fr", "yopmail.net", "cool.fr.nf", "jetable.fr.nf", "courriel.fr.nf", "moncourrier.fr.nf",
  "monemail.fr.nf", "monmail.fr.nf", "nospam.ze.tc", "nomail.xl.cx", "mega.zik.dj", "speed.1s.fr",
  "jetable.org", "jetable.com", "trashmail.com", "trashmail.fr", "trashmail.de", "trashmail.net", "trash-mail.com",
  "mailinator.com", "mailinator.net", "mailinator2.com", "guerrillamail.com", "guerrillamail.net", "guerrillamail.org",
  "guerrillamail.biz", "guerrillamail.de", "sharklasers.com", "grr.la", "guerrillamailblock.com", "spam4.me",
  "10minutemail.com", "10minutemail.net", "10minemail.com", "20minutemail.com", "temp-mail.org", "temp-mail.io",
  "tempmail.com", "tempmail.net", "tempmail.dev", "tempmailo.com", "tempr.email", "temp-mail.ru", "tmpmail.org",
  "tmpmail.net", "throwawaymail.com", "getnada.com", "nada.email", "dispostable.com", "maildrop.cc", "mailnesia.com",
  "mintemail.com", "mohmal.com", "emailondeck.com", "fakeinbox.com", "fakemail.net", "spamgourmet.com",
  "mailcatch.com", "mytemp.email", "mailpoof.com", "burnermail.io", "discard.email", "inboxkitten.com",
  "1secmail.com", "1secmail.net", "1secmail.org", "emailfake.com", "email-fake.com", "crazymailing.com",
  "minuteinbox.com", "moakt.com", "tempail.com", "luxusmail.org", "mail.tm", "mail.gw", "dropmail.me",
  "firemail.cc", "spambox.us", "mailsac.com", "harakirimail.com", "anonbox.net", "byom.de", "wegwerfmail.de",
  "einrot.com", "33mail.com", "linshiyouxiang.net", "emltmp.com", "tmail.ws", "trbvm.com", "kzccv.com",
]);

const domainOf = (email) => String(email || "").trim().toLowerCase().split("@")[1] || "";

// vrai si le domaine (ou un de ses parents : x.yopmail.com) est jetable
export function isDisposableEmail(email) {
  const parts = domainOf(email).split(".");
  for (let i = 0; i < parts.length - 1; i++) {
    if (DISPOSABLE_DOMAINS.has(parts.slice(i).join("."))) return true;
  }
  return false;
}

// "J.ean+test@Gmail.com" -> "jean@gmail.com" : la vraie boîte mail derrière l'adresse
export function emailKeyOf(email) {
  let [local = "", domain = ""] = String(email || "").trim().toLowerCase().split("@");
  local = local.split("+")[0];
  if (domain === "googlemail.com") domain = "gmail.com";
  if (domain === "gmail.com") local = local.replaceAll(".", "");
  return `${local}@${domain}`;
}

const LOCAL_IPS = new Set(["::1", "127.0.0.1", "::ffff:127.0.0.1"]);

// l'adresse IP est "hachée" : on ne stocke jamais l'IP en clair (vie privée)
// en local (localhost) on ne compte pas, sinon tous les comptes de test seraient bloqués
export function ipHashOf(req) {
  const ip = req.ip || req.socket?.remoteAddress || "";
  if (!ip || LOCAL_IPS.has(ip)) return null;
  return crypto.createHash("sha256").update(`${ip}|${process.env.JWT_SECRET}`).digest("hex");
}
