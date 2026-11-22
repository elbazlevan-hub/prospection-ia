// Prospects verrouillés : le serveur n'envoie JAMAIS ce qui permet de retrouver le commerce
// (nom, adresse, téléphone, email, site, Instagram, avis, message IA) tant qu'il n'est pas débloqué.
import { mobileOnly, landlineOf } from "./phone.js";

export function isLocked(lead) {
  return lead.unlocked === false; // undefined (anciens prospects) = visible
}

// ce qu'on montre d'un commerce verrouillé : de quoi donner envie, pas de quoi le retrouver
export function maskLead(leadObj, offer) {
  const b = leadObj.businessId || {};
  return {
    _id: leadObj._id,
    offerId: leadObj.offerId,
    locked: true,
    score: leadObj.score,
    matchReasons: leadObj.matchReasons,
    status: leadObj.status,
    preview: {
      category: b.category,
      city: b.city,
      country: b.country,
      rating: b.rating,
      reviewCount: b.reviewCount,
      hasMobile: Boolean(mobileOnly(b.phone, b.country)),
      hasEmail: Boolean(b.email),
      hasInstagram: Boolean(b.instagram),
      hasLandline: Boolean(offer?.includeLandlines && landlineOf(b)),
      aiMessageIncluded: true, // le message AIDY est écrit au déblocage
    },
  };
}

// prospect prêt à envoyer au client : masqué s'il est verrouillé
export function publicLead(lead, offer, extra = () => ({})) {
  const obj = typeof lead.toObject === "function" ? lead.toObject() : lead;
  if (isLocked(obj)) return maskLead(obj, offer);
  if (obj.businessId) {
    obj.businessId = { ...obj.businessId };
    delete obj.businessId.phoneReports; // signalements des autres utilisateurs : jamais envoyés
    delete obj.businessId.badPhones;
    // fixe caché si l'offre ne l'autorise pas
    if (!offer?.includeLandlines) {
      delete obj.businessId.landline;
      if (obj.businessId.phone && !mobileOnly(obj.businessId.phone, obj.businessId.country)) delete obj.businessId.phone;
    }
    // numéro signalé « ne marche pas » par cet utilisateur : caché pour lui
    if (obj.badPhoneAt) {
      delete obj.businessId.phone;
      delete obj.businessId.landline;
    }
  }
  return { ...obj, locked: false, ...extra(obj) };
}
