import mongoose from "mongoose";

export const LEAD_STATUS = ["toContact", "contacted", "interested", "client", "rejected"];
export const CHANNELS = ["whatsapp", "email", "instagram", "phone", "other"];

// le lien entre UNE offre et UN commerce : score, message IA et suivi
const leadSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    offerId: { type: mongoose.Schema.Types.ObjectId, ref: "Offer", required: true },
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: "Business", required: true },
    matchReasons: { type: [String], default: [] },
    score: { type: Number, min: 0, max: 100, default: 0 },
    message: { type: String, default: "" },       // généré par l'IA
    emailSubject: { type: String, default: "" },  // objet de l'email (IA)
    painPoints: { type: [String], default: [] },  // problèmes repérés par l'IA (avis, concurrents...)
    customFit: Boolean,                           // correspond au critère libre de l'offre (IA)
    customFitReason: String,
    messageGeneratedAt: Date,
    status: { type: String, enum: LEAD_STATUS, default: "toContact" },
    // false = verrouillé : nom, adresse, contacts et message cachés tant qu'il n'est pas débloqué
    // (pas de valeur par défaut : les anciens prospects, sans ce champ, restent visibles)
    unlocked: Boolean,
    unlockedAt: Date,
    contactedAt: Date,                                     // premier contact
    contactedVia: { type: String, enum: CHANNELS },        // canal du premier contact
    lastContactAt: Date,                                   // dernier contact (premier message ou relance)
    followUpAt: Date,                                      // date de la prochaine relance (J+3 puis J+7)
    followUpCount: { type: Number, min: 0, default: 0 },   // relances déjà envoyées (max 2)
    repliedAt: Date,                                       // le commerce a répondu
    clientAt: Date,                                        // devenu client
    dealValue: { type: Number, min: 0 },                   // montant payé par le client
    dealHistory: [{ value: Number, at: Date, _id: false }], // chaque changement de montant, avec sa date
    // assistant de réponse (Premium) : la conversation avec le prospect
    replies: [
      {
        from: { type: String, enum: ["prospect", "me"] },
        text: String,
        label: String, // pour les réponses du prospect : interested, question, meeting, notInterested, stop
        at: Date,
        _id: false,
      },
    ],
    replyLabel: { type: String, enum: ["interested", "question", "meeting", "notInterested", "stop"] }, // dernière réponse
    suggestedReply: { type: String, default: "" }, // réponse écrite par AIDY, à envoyer
    lastReplyAt: Date,                             // dernière réponse du prospect
    waitingForMe: { type: Boolean, default: false }, // le prospect attend une réponse
    notes: { type: String, default: "" },
    badPhoneAt: Date,      // l'utilisateur a signalé que le numéro ne marche pas (numéro caché pour lui)
    refundedAt: Date,      // crédit rendu pour ce commerce
  },
  { timestamps: true }
);

// un commerce ne peut apparaître qu'une fois par offre
leadSchema.index({ offerId: 1, businessId: 1 }, { unique: true });
// pour le plan du jour : relances à faire et contacts du jour
leadSchema.index({ userId: 1, status: 1, followUpAt: 1 });
leadSchema.index({ userId: 1, lastContactAt: 1 });

export default mongoose.model("Lead", leadSchema);
