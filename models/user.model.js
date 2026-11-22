import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["user", "admin"], default: "user" },
    language: { type: String, default: "en", lowercase: true },  // langue de l'interface
    country: { type: String, uppercase: true },                  // code ISO : US, FR, GB...
    // essai gratuit puis packs payants (paiement unique)
    plan: { type: String, enum: ["free", "paid", "premium"], default: "free" }, // premium = assistant de réponse AIDY
    credits: { type: Number, min: 0, default: 5 },              // prospects qu'il peut encore débloquer (5 offerts)
    freeSearchUsed: { type: Boolean, default: false },           // essai gratuit : 1 seule recherche
    // anti-abus : un essai gratuit par boîte mail et 2 max par connexion internet (voir lib/antiAbuse.js)
    trialGiven: { type: Boolean, default: true },                // false = compte créé sans les 5 crédits offerts
    emailKey: { type: String, index: true },                     // la vraie boîte mail (sans les +alias)
    trialIpHash: { type: String, index: true },                  // IP hachée à l'inscription (jamais en clair)
    // mot de passe oublié : seulement l'empreinte du lien est gardée, valable 30 minutes
    resetTokenHash: { type: String, index: true },
    resetTokenExpires: Date,
    // fiche infos du vendeur : AIDY s'en sert pour répondre aux prospects (sans rien inventer)
    sellerProfile: {
      signature: { type: String, trim: true },     // nom affiché en bas des messages (ex. "Nyxela")
      priceInfo: { type: String, trim: true },     // ex. "Site vitrine 900 €, avec réservation 1 200 €"
      deliveryTime: { type: String, trim: true },  // ex. "7 jours"
      portfolioUrl: { type: String, trim: true },  // exemples de réalisations
      bookingUrl: { type: String, trim: true },    // lien pour prendre rendez-vous (Calendly...)
      guarantees: { type: String, trim: true },    // ex. "Satisfait ou remboursé 14 jours"
      faq: { type: String, trim: true },           // autres infos utiles (paiement, maintenance...)
    },
  },
  { timestamps: true } // createdAt + updatedAt
);

// ne jamais renvoyer passwordHash au client
userSchema.set("toJSON", {
  transform: (doc, ret) => {
    delete ret.passwordHash;
    delete ret.__v;
    delete ret.trialIpHash;
    delete ret.emailKey;
    delete ret.resetTokenHash;
    delete ret.resetTokenExpires;
    return ret;
  },
});

// le nom qui signe les messages : la signature de la fiche infos, sinon le nom du compte
export function senderNameOf(user) {
  return user?.sellerProfile?.signature || user?.name || "";
}

export const isPremium = (user) => user?.plan === "premium" || user?.role === "admin";

export default mongoose.model("User", userSchema);
