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
  fewPhotos: 30,       // moins de 5 photos sur la fiche Google (photographes, vidéastes)
  noInstagram: 25,     // aucun compte Instagram trouvé (community managers)
  noHours: 15,         // pas d'horaires sur la fiche Google (fiche incomplète : référencement local)
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
  if (typeof business.photoCount === "number" && business.photoCount < 5) reasons.push("fewPhotos");
  if (business.analyzedAt && !business.instagram) reasons.push("noInstagram"); // seulement après l'analyse du site
  if (business.hasHours === false) reasons.push("noHours");

  return reasons;
}

// score d'un commerce pour une offre : on additionne seulement les critères choisis dans l'offre
// sans problème choisi (ex. un fournisseur d'eau) : tous les commerces du type comptent,
// les plus gros d'abord (beaucoup d'avis = beaucoup de clients), score entre 30 et 100
export function sizeScore(business) {
  const reviews = Number(business.reviewCount) || 0;
  const size = Math.min(55, Math.round(Math.log10(reviews + 1) * 20));
  const good = typeof business.rating === "number" && business.rating >= 4 ? 15 : 0;
  return Math.min(100, 30 + size + good);
}

export function scoreBusiness(business, offerCriteria = []) {
  if (!offerCriteria.length) return { score: sizeScore(business), matchReasons: [] };
  const matchReasons = detectReasons(business).filter((r) => offerCriteria.includes(r));
  const total = matchReasons.reduce((sum, r) => sum + CRITERIA_WEIGHTS[r], 0);
  return { score: Math.min(100, total), matchReasons };
}
