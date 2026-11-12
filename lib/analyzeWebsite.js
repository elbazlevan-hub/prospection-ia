// Visite le site d'un commerce et détecte ses points faibles

const TIMEOUT = 8000; // 8 secondes max par site
const MAX_HTML = 1_500_000; // on lit au maximum ~1,5 Mo de HTML

// pages qui ne sont pas un "vrai" site
const SOCIAL_HOSTS = ["facebook.com", "instagram.com", "linktr.ee", "tiktok.com", "wa.me", "whatsapp.com", "linkin.bio", "beacons.ai"];

// systèmes de réservation / commande en ligne connus
const BOOKING_TOOLS = [
  "calendly.com", "booksy.com", "setmore.com", "simplybook", "acuityscheduling", "fresha.com",
  "treatwell", "planity", "vagaro.com", "squareup.com/appointments", "square.site", "schedulicity",
  "mindbodyonline", "gettimely", "opentable", "resy.com", "thefork", "zenchef", "doctolib",
  "youcanbook.me", "picktime", "appointy", "glossgenius", "styleseat", "zocdoc", "tock",
  "outlook.office365.com/owa/calendar", "bookings.cloud.microsoft",
  "phorest", "salonized", "shedul", "kitomba", "bookwhen", "booker.com", "zenoti", "mangomint", "boulevard",
];

// liens de réservation sur le site lui-même (ex. Wix "/book-online", "/booking", "/reservation")
const BOOKING_LINK = /href=["'][^"']*(book-online|booking|book-now|reservation|appointment|rendez-vous)[^"']*["']/i;

const WHATSAPP = /wa\.me\/|api\.whatsapp\.com|whatsapp:\/\/|web\.whatsapp\.com\/send/i;
const SOCIAL_LINKS = /instagram\.com\/|facebook\.com\/|tiktok\.com\/@/i;
const VIEWPORT = /<meta[^>]+name=["']?viewport/i;
const OLD_TECH = /<font[\s>]|<marquee|<center>|\.swf["'?]|jquery[-.]1\.\d/i;
const COPYRIGHT = /(?:©|&copy;|copyright)\s*(?:\d{4}\s*[-–]\s*)?(\d{4})/gi;

const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const BAD_EMAIL = /(example\.|exemple\.|sentry|wixpress|\.(png|jpe?g|gif|webp|svg)$|@2x|domain\.com|domaine\.(com|fr)|email\.com|yourname|votre|utilisateur@|user@|nom@|name@|test@|noreply|no-reply)/i;
const INSTAGRAM = /instagram\.com\/([a-z0-9._]{2,30})/i;
const NOT_INSTA_USER = ["p", "reel", "explore", "accounts", "stories", "tv", "share"];

const VALID_EMAIL = /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/;

// cherche un email et un compte Instagram dans le HTML
function findContacts(html) {
  const decoded = html
    .replace(/%40/gi, "@")
    .replace(/%20/g, " ")
    .replace(/&#64;|&#x40;|\s*\[at\]\s*|\s*\(at\)\s*/gi, "@")
    .replace(/\\(["'\/])/g, "$1"); // enlève les \" des pages qui contiennent du JSON
  const emails = (decoded.match(EMAIL) || [])
    .map((e) => e.toLowerCase().replace(/^[^a-z0-9]+|[^a-z]+$/g, ""))
    .filter((e) => VALID_EMAIL.test(e) && !BAD_EMAIL.test(e));
  const insta = [...decoded.matchAll(new RegExp(INSTAGRAM, "gi"))]
    .map((m) => m[1].toLowerCase().replace(/\.$/, ""))
    .find((u) => !NOT_INSTA_USER.includes(u));
  return { email: emails[0], instagram: insta ? `https://instagram.com/${insta}` : undefined };
}

// trouve le lien vers la page "contact" du même site
function findContactPage(html, baseUrl) {
  const m = html.match(/href=["']([^"']*contact[^"']*)["']/i);
  if (!m) return null;
  try {
    const url = new URL(m[1], baseUrl);
    return url.hostname === new URL(baseUrl).hostname ? url.href : null;
  } catch {
    return null;
  }
}

function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

// sécurité : on ne visite que des sites publics en http/https
function isSafeUrl(url) {
  try {
    const u = new URL(url);
    if (!["http:", "https:"].includes(u.protocol)) return false;
    const h = u.hostname;
    return !(
      h === "localhost" ||
      h.endsWith(".local") ||
      /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
      h.includes(":") // adresses IPv6 brutes
    );
  } catch {
    return false;
  }
}

// télécharge la page d'accueil (avec une limite de temps)
async function fetchHtml(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ProspectionBot/1.0)" },
    });
    // le site existe mais bloque les robots (protection anti-bot) -> on ne peut pas juger
    if ([401, 403, 429, 503].includes(res.status)) return { blocked: true };
    if (!res.ok) return null; // 404, 500... -> site cassé
    const html = (await res.text()).slice(0, MAX_HTML);
    return { html, finalUrl: res.url || url };
  } catch {
    return null; // site injoignable, trop lent, erreur réseau...
  } finally {
    clearTimeout(timer);
  }
}

// analyse complète d'un commerce -> objet "analysis" enregistré dans businesses
export async function analyzeWebsite(website) {
  // 1) pas de site du tout
  if (!website) {
    return { hasWebsite: false, socialOnly: false, whatsappBooking: false, onlineBooking: false };
  }

  // 2) le "site" est en fait une page de réseau social
  const host = hostOf(website);
  if (SOCIAL_HOSTS.some((s) => host === s || host.endsWith("." + s))) {
    const insta = host.includes("instagram.com") ? findContacts(website).instagram : undefined;
    return {
      contacts: { instagram: insta },
      hasWebsite: false,
      socialOnly: true,
      whatsappBooking: host.includes("wa.me") || host.includes("whatsapp"),
      onlineBooking: false,
    };
  }

  // 3) le site est déjà un outil de réservation (ex. page Booksy)
  if (BOOKING_TOOLS.some((b) => website.toLowerCase().includes(b))) {
    return { hasWebsite: true, siteReachable: true, onlineBooking: true, whatsappBooking: false, isOutdated: false, outdatedSignals: [], hasSocialLinks: true };
  }

  if (!isSafeUrl(website)) {
    return { hasWebsite: true, siteReachable: false, isOutdated: true, outdatedSignals: ["siteDown"], whatsappBooking: false, onlineBooking: false };
  }

  // 4) on visite le site
  const page = await fetchHtml(website);
  if (page?.blocked) {
    // on sait seulement que le site existe : pas de point faible compté
    return { hasWebsite: true, siteReachable: true, blockedByBot: true, isOutdated: false, outdatedSignals: [], whatsappBooking: false, onlineBooking: true, hasSocialLinks: true };
  }
  if (!page) {
    return { hasWebsite: true, siteReachable: false, isOutdated: true, outdatedSignals: ["siteDown"], whatsappBooking: false, onlineBooking: false };
  }

  const { html, finalUrl } = page;
  const lower = html.toLowerCase();

  const https = finalUrl.startsWith("https://");
  const mobileFriendly = VIEWPORT.test(html);
  const oldTech = OLD_TECH.test(html);
  const years = [...html.matchAll(COPYRIGHT)].map((m) => Number(m[1])).filter((y) => y > 1990 && y <= new Date().getFullYear());
  const copyrightYear = years.length ? Math.max(...years) : undefined;

  const outdatedSignals = [];
  if (!https) outdatedSignals.push("noHttps");
  if (!mobileFriendly) outdatedSignals.push("notMobile");
  if (copyrightYear && copyrightYear <= new Date().getFullYear() - 4) outdatedSignals.push("oldCopyright");
  if (oldTech) outdatedSignals.push("oldTech");

  // contacts : sur la page d'accueil, sinon sur la page "contact"
  let contacts = findContacts(html);
  if (!contacts.email) {
    const contactUrl = findContactPage(html, finalUrl);
    if (contactUrl && isSafeUrl(contactUrl)) {
      const contactPage = await fetchHtml(contactUrl);
      if (contactPage?.html) {
        const more = findContacts(contactPage.html);
        contacts = { email: more.email, instagram: contacts.instagram || more.instagram };
      }
    }
  }

  const onlineBooking = BOOKING_TOOLS.some((b) => lower.includes(b)) || BOOKING_LINK.test(html);

  return {
    contacts,
    hasWebsite: true,
    siteReachable: true,
    https,
    mobileFriendly,
    copyrightYear,
    outdatedSignals,
    // vieillot si pas adapté au mobile, ou au moins 2 signes de vieillesse
    isOutdated: !mobileFriendly || outdatedSignals.length >= 2,
    onlineBooking,
    // WhatsApp compte seulement s'il n'y a pas déjà une vraie réservation en ligne
    whatsappBooking: !onlineBooking && WHATSAPP.test(html),
    hasSocialLinks: SOCIAL_LINKS.test(html),
  };
}
