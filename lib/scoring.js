// Les critères possibles et leur poids dans le score (0 à 100)
// L'utilisateur choisit dans son offre les critères qui l'intéressent.
export const CRITERIA_WEIGHTS = {
  noWebsite: 40,       // aucun site web
  socialOnly: 35,      // seulement une page Facebook / Instagram / Linktree
  siteDown: 35,        // le site ne répond pas
  oldWebsite: 30,      // site vieillot (pas mobile, pas https, vieux copyright...)
  whatsappBooking: 35, // rendez-vous / commandes par WhatsApp
  noOnlineBooking: 25, // pas de réservation en ligne
  lowRating: 15,       // note Google < 4
  fewReviews: 15,      // moins de 20 avis Google
  noSocial: 10,        // aucun lien vers des réseaux sociaux sur le site
};

export const CRITERIA = Object.keys(CRITERIA_WEIGHTS);

// à partir des infos du commerce, liste tous les "problèmes" trouvés
export function detectReasons(business) {
  const a = business.analysis || {};
  const reasons = [];

  if (!a.hasWebsite && !a.socialOnly) reasons.push("noWebsite");
  if (a.socialOnly) reasons.push("socialOnly");
  if (a.hasWebsite && a.siteReachable === false) reasons.push("siteDown");
  if (a.hasWebsite && a.siteReachable && a.isOutdated) reasons.push("oldWebsite");
  if (a.whatsappBooking) reasons.push("whatsappBooking");
  if (!a.onlineBooking) reasons.push("noOnlineBooking");
  if (typeof business.rating === "number" && business.rating < 4) reasons.push("lowRating");
  if (typeof business.reviewCount === "number" && business.reviewCount < 20) reasons.push("fewReviews");
  if (a.hasWebsite && a.siteReachable && !a.hasSocialLinks) reasons.push("noSocial");

  return reasons;
}

// score d'un commerce pour une offre : on additionne seulement les critères choisis dans l'offre
export function scoreBusiness(business, offerCriteria) {
  const matchReasons = detectReasons(business).filter((r) => offerCriteria.includes(r));
  const total = matchReasons.reduce((sum, r) => sum + CRITERIA_WEIGHTS[r], 0);
  return { score: Math.min(100, total), matchReasons };
}
