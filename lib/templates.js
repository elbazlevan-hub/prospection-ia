// Modèles d'offres prêts à l'emploi, par métier (textes en anglais, français et espagnol).
// L'utilisateur en choisit un, puis complète le pays, la ville, la langue et son prix.
const T = (en, fr, es) => ({ en, fr, es });

export const OFFER_TEMPLATES = [
  {
    id: "job",
    name: T("I'm looking for a job", "Je cherche un emploi", "Busco trabajo"),
    title: T("Waiter / waitress", "Serveur / serveuse", "Camarero / camarera"),
    description: T(
      "2 years of experience in restaurants, friendly with customers, used to busy services.",
      "2 ans d'expérience en restauration, souriant avec les clients, habitué aux services chargés.",
      "2 años de experiencia en restaurantes, amable con los clientes, acostumbrado a servicios con mucha gente."
    ),
    sellingPoint: T("Available evenings and weekends, starting now", "Disponible le soir et le week-end, dès maintenant", "Disponible por las tardes y fines de semana, desde ya"),
    serviceType: "job",
    targetCategories: ["restaurant", "cafe", "bar"],
    criteria: [],
  },
  {
    id: "website",
    name: T("Website creation", "Création de site internet", "Creación de páginas web"),
    title: T("Modern website with online booking", "Site moderne avec réservation en ligne", "Web moderna con reservas en línea"),
    description: T(
      "Fast website, easy to use on a phone, with online appointments or orders.",
      "Site rapide, adapté au téléphone, avec prise de rendez-vous ou commande en ligne.",
      "Web rápida, fácil de usar en el móvil, con citas o pedidos en línea."
    ),
    serviceType: "website",
    targetCategories: ["hair salon", "barber", "nail salon", "beauty salon"],
    criteria: ["noWebsite", "socialOnly", "siteDown", "oldWebsite", "whatsappBooking", "noOnlineBooking"],
  },
  {
    id: "restaurant-website",
    name: T("Restaurant showcase website", "Site vitrine pour restaurant", "Web escaparate para restaurante"),
    title: T("Your menu, your photos and your order links", "Votre menu, vos photos et vos liens de commande", "Tu menú, tus fotos y tus enlaces de pedido"),
    description: T(
      "A website with your menu, beautiful photos, opening hours and address, plus buttons to order on Wolt / Uber Eats or book a table.",
      "Un site avec votre menu, de belles photos, vos horaires et votre adresse, et des boutons pour commander sur Wolt / Uber Eats ou réserver une table.",
      "Una web con tu menú, fotos bonitas, horario y dirección, y botones para pedir en Wolt / Uber Eats o reservar mesa."
    ),
    serviceType: "website",
    targetCategories: ["restaurant", "cafe", "bakery"],
    criteria: ["noWebsite", "socialOnly", "oldWebsite", "fewPhotos"],
  },
  {
    id: "booking",
    name: T("Booking software", "Logiciel de réservation", "Software de reservas"),
    title: T("Online booking 24/7", "Réservation en ligne 24h/24", "Reservas en línea 24/7"),
    description: T(
      "Your clients book on their own, even at night: fewer calls and WhatsApp messages to handle.",
      "Vos clients réservent seuls, même la nuit : moins d'appels et de messages WhatsApp à gérer.",
      "Tus clientes reservan solos, incluso de noche: menos llamadas y mensajes de WhatsApp."
    ),
    serviceType: "booking software",
    targetCategories: ["hair salon", "beauty salon", "massage", "physiotherapist"],
    criteria: ["whatsappBooking", "noOnlineBooking", "noWebsite"],
  },
  {
    id: "photographer",
    name: T("Photographer", "Photographe", "Fotógrafo"),
    title: T("Professional photos for your Google listing and social media", "Photos professionnelles pour votre fiche Google et vos réseaux", "Fotos profesionales para tu ficha de Google y tus redes"),
    description: T(
      "Photos of your products, dishes and place to make people want to come from the first Google search.",
      "Photos de vos produits, de vos plats et de votre lieu pour donner envie dès la recherche Google.",
      "Fotos de tus productos, platos y local para dar ganas desde la búsqueda en Google."
    ),
    serviceType: "photography",
    targetCategories: ["restaurant", "cafe", "bakery", "hotel"],
    criteria: ["fewPhotos", "fewReviews", "noInstagram"],
  },
  {
    id: "social-media",
    name: T("Social media manager", "Community manager", "Community manager"),
    title: T("We run your social media", "Gestion de vos réseaux sociaux", "Gestión de tus redes sociales"),
    description: T(
      "Regular posts on Instagram and Facebook to bring in new clients.",
      "Publications régulières sur Instagram et Facebook pour attirer de nouveaux clients.",
      "Publicaciones regulares en Instagram y Facebook para atraer nuevos clientes."
    ),
    serviceType: "social media management",
    targetCategories: ["restaurant", "clothing store", "beauty salon", "gym"],
    criteria: ["noInstagram", "noSocial", "socialOnly", "fewReviews"],
  },
  {
    id: "local-seo",
    name: T("Local SEO (Google listing)", "Référencement local (fiche Google)", "SEO local (ficha de Google)"),
    title: T("More clients from your Google listing", "Plus de clients grâce à votre fiche Google", "Más clientes gracias a tu ficha de Google"),
    description: T(
      "A complete Google listing (hours, photos), more client reviews and a better position on Google Maps.",
      "Fiche Google complète (horaires, photos), plus d'avis clients et meilleure position sur Google Maps.",
      "Ficha de Google completa (horario, fotos), más reseñas y mejor posición en Google Maps."
    ),
    serviceType: "local SEO",
    targetCategories: ["plumber", "electrician", "locksmith"],
    criteria: ["noHours", "fewPhotos", "fewReviews", "lowRating", "noWebsite"],
  },
  {
    id: "reputation",
    name: T("Review management", "Gestion des avis clients", "Gestión de reseñas"),
    title: T("Improve your Google rating", "Améliorez votre note Google", "Mejora tu nota en Google"),
    description: T(
      "Collect positive reviews and professional answers to negative ones.",
      "Récolte d'avis positifs et réponses professionnelles aux avis négatifs.",
      "Más reseñas positivas y respuestas profesionales a las negativas."
    ),
    serviceType: "reputation management",
    targetCategories: ["restaurant", "hotel", "car repair", "dentist"],
    criteria: ["lowRating", "fewReviews"],
  },
  {
    id: "cleaning",
    name: T("Professional cleaning", "Nettoyage professionnel", "Limpieza profesional"),
    title: T("Cleaning of your premises", "Nettoyage de vos locaux", "Limpieza de tu local"),
    description: T(
      "Regular cleaning of your premises, before or after opening hours.",
      "Nettoyage régulier de vos locaux, avant ou après vos heures d'ouverture.",
      "Limpieza regular de tu local, antes o después del horario de apertura."
    ),
    serviceType: "cleaning",
    targetCategories: ["restaurant", "office", "gym", "medical center"],
    criteria: ["lowRating"],
    customCriterion: "businesses whose reviews mention cleanliness or hygiene problems",
  },
];

// les modèles dans une langue (en par défaut)
export function templatesIn(lang) {
  const l = ["en", "fr", "es"].includes(lang) ? lang : "en";
  return OFFER_TEMPLATES.map((tpl) => ({
    ...tpl,
    name: tpl.name[l],
    title: tpl.title[l],
    description: tpl.description[l],
    sellingPoint: tpl.sellingPoint?.[l],
  }));
}
