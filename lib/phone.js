// Numéros de téléphone : on ne garde que les PORTABLES (WhatsApp / SMS possibles)
// libphonenumber-js connaît les règles de chaque pays (ex. FR : 06/07 = portable, 01-05/09 = fixe)
import { parsePhoneNumberFromString, findPhoneNumbersInText } from "libphonenumber-js/max";

// MOBILE = portable sûr ; FIXED_LINE_OR_MOBILE = pays où on ne peut pas savoir (ex. US, CA)
const OK_TYPES = ["MOBILE", "FIXED_LINE_OR_MOBILE"];

// renvoie le numéro au format international ("+33 6 12 34 56 78") s'il est portable, sinon undefined
export function mobileOnly(raw, country) {
  if (!raw) return undefined;
  const phone = parsePhoneNumberFromString(String(raw), country?.toUpperCase());
  if (!phone || !phone.isValid()) return undefined;
  // un numéro d'un autre pays (souvent un faux numéro lu dans le code de la page) est ignoré
  if (country && phone.country !== country.toUpperCase()) return undefined;
  return OK_TYPES.includes(phone.getType()) ? phone.formatInternational() : undefined;
}

// le fixe d'un commerce (anciennes données : le fixe était parfois rangé dans "phone")
export function landlineOf(business) {
  if (business.landline) return business.landline;
  return business.phone && !mobileOnly(business.phone, business.country) ? business.phone : undefined;
}

export function isMobile(raw, country) {
  return Boolean(mobileOnly(raw, country));
}

// cherche le premier numéro de portable dans le HTML d'un site
// (liens tel:, liens WhatsApp, puis numéros écrits dans le texte)
export function findMobileInHtml(html, country) {
  const candidates = [];

  // liens WhatsApp : wa.me/33612345678 ou api.whatsapp.com/send?phone=33612345678
  for (const m of html.matchAll(/(?:wa\.me\/|whatsapp\.com\/send\/?\?phone=)\+?(\d{8,15})/gi)) {
    candidates.push("+" + m[1]);
  }
  // liens tel:
  for (const m of html.matchAll(/href=["']tel:([^"']+)["']/gi)) {
    candidates.push(decodeURIComponent(m[1]).replace(/[^\d+]/g, ""));
  }
  for (const c of candidates) {
    const mobile = mobileOnly(c, country);
    if (mobile) return mobile;
  }

  // numéros écrits dans le texte de la page
  const text = html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ");
  for (const found of findPhoneNumbersInText(text, country?.toUpperCase())) {
    const mobile = mobileOnly(found.number.number, country);
    if (mobile) return mobile;
  }
  return undefined;
}
