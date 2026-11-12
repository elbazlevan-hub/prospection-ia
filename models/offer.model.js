import mongoose from "mongoose";

import { CRITERIA } from "../lib/scoring.js";

// ce que l'utilisateur vend aux commerces + qui il veut cibler
export { CRITERIA };

const offerSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: "" },
    serviceType: { type: String, required: true, trim: true },          // site, photo, marketing...
    targetCategories: { type: [String], required: true },               // barber, nail salon...
    targetCountry: { type: String, required: true, uppercase: true },   // code ISO : US, FR, GB...
    targetCity: { type: String, trim: true },
    criteria: { type: [String], enum: CRITERIA, required: true },       // problèmes recherchés
    messageLanguage: { type: String, required: true, lowercase: true }, // en, fr, es...
    customCriterion: { type: String, trim: true }, // critère libre jugé par l'IA, ex. "restaurants qui semblent avoir besoin d'un service de nettoyage"
    lastSearchAt: Date, // dernière recherche Google (limite : 1 par minute)
  },
  { timestamps: true }
);

export default mongoose.model("Offer", offerSchema);
