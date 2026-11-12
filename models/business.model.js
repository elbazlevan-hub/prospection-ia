import mongoose from "mongoose";

// un commerce trouvé sur Google Places (partagé entre toutes les offres)
const businessSchema = new mongoose.Schema(
  {
    googlePlaceId: { type: String, required: true, unique: true },
    name: { type: String, required: true, trim: true },
    category: { type: String, trim: true },
    country: { type: String, uppercase: true },
    city: { type: String, trim: true },
    address: { type: String, trim: true },
    phone: { type: String, trim: true },        // format international : +44, +33, +1...
    website: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    instagram: { type: String, trim: true },
    rating: { type: Number, min: 0, max: 5 },
    reviewCount: { type: Number, min: 0 },     // nombre d'avis Google
    language: { type: String, lowercase: true },
    // résultat de l'analyse du site (rempli par POST /api/offers/:id/analyze)
    analysis: {
      hasWebsite: Boolean,      // a un vrai site (pas juste un réseau social)
      socialOnly: Boolean,      // seulement Facebook / Instagram / Linktree
      siteReachable: Boolean,   // le site répond
      blockedByBot: Boolean,    // le site bloque les robots : impossible de l'analyser
      https: Boolean,
      mobileFriendly: Boolean,
      copyrightYear: Number,
      outdatedSignals: [String], // noHttps, notMobile, oldCopyright, oldTech, siteDown
      isOutdated: Boolean,
      whatsappBooking: Boolean, // lien WhatsApp pour réserver / commander
      onlineBooking: Boolean,   // outil de réservation en ligne détecté
      hasSocialLinks: Boolean,
    },
    analyzedAt: Date,
    // avis Google (5 max), gardés 30 jours pour ne pas les redemander
    reviews: [{ rating: Number, text: String, _id: false }],
    reviewsFetchedAt: Date,
  },
  { timestamps: true }
);

export default mongoose.model("Business", businessSchema);
