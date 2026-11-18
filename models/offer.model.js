import mongoose from "mongoose";

import { CRITERIA } from "../lib/scoring.js";

// ce que l'utilisateur vend aux commerces + qui il veut cibler
export { CRITERIA };

export const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD", "CHF"];

const offerSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: "" },
    serviceType: { type: String, required: true, trim: true },          // site, photo, marketing...
    targetCategories: { type: [String], required: true },               // barber, nail salon...
    targetCountry: { type: String, required: true, uppercase: true },   // code ISO : US, FR, GB...
    targetCities: { type: [String], default: [] },                      // une ou plusieurs villes
    targetCity: { type: String, trim: true },                           // ancien champ (1 seule ville), gardé pour les anciennes offres
    criteria: { type: [String], enum: CRITERIA, required: true },       // problèmes recherchés
    messageLanguage: { type: String, required: true, lowercase: true }, // en, fr, es...
    customCriterion: { type: String, trim: true }, // critère libre jugé par l'IA, ex. "restaurants qui semblent avoir besoin d'un service de nettoyage"
    price: { type: Number, min: 0, default: 0 },                        // prix du service (paiement unique)
    currency: { type: String, enum: CURRENCIES, default: "USD" },
    dailyLimit: { type: Number, min: 1, max: 200, default: 20 },        // contacts max par jour (évite d'être bloqué)
    lastSearchAt: Date, // dernière recherche Google (limite : 1 par minute)
  },
  { timestamps: true }
);

// les villes de l'offre (nouvelles offres : targetCities, anciennes : targetCity)
export function citiesOf(offer) {
  if (offer.targetCities?.length) return offer.targetCities;
  return offer.targetCity ? [offer.targetCity] : [];
}

export default mongoose.model("Offer", offerSchema);
