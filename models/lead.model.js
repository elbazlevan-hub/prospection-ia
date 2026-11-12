import mongoose from "mongoose";

export const LEAD_STATUS = ["toContact", "contacted", "interested", "client", "rejected"];

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
    contactedAt: Date,
    notes: { type: String, default: "" },
  },
  { timestamps: true }
);

// un commerce ne peut apparaître qu'une fois par offre
leadSchema.index({ offerId: 1, businessId: 1 }, { unique: true });

export default mongoose.model("Lead", leadSchema);
