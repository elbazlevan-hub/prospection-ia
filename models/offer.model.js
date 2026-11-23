import mongoose from "mongoose";

import { CRITERIA } from "../lib/scoring.js";

// ce que l'utilisateur vend aux commerces + qui il veut cibler
export { CRITERIA };

// principales devises (codes ISO 4217)
export const CURRENCIES = [
  "EUR", "USD", "GBP", "CHF", "CAD", "AUD", "NZD", "JPY", "CNY", "HKD", "SGD", "INR", "KRW",
  "AED", "SAR", "QAR", "KWD", "ILS", "TRY", "EGP", "MAD", "TND", "DZD", "XOF", "XAF", "ZAR", "NGN", "KES",
  "BRL", "MXN", "ARS", "CLP", "COP", "PEN", "SEK", "NOK", "DKK", "PLN", "CZK", "HUF", "RON", "BGN", "RUB", "UAH",
  "THB", "MYR", "IDR", "PHP", "VND",
];

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
    criteria: { type: [String], enum: CRITERIA, default: [] },          // problèmes recherchés (vide = tous les commerces du type)
    sellingPoint: { type: String, trim: true },                         // l'avantage du vendeur, ex. "moins cher, en gros, livré dans toute la France"
    cvUrl: { type: String, trim: true },                                // recherche d'emploi (serviceType "job") : lien vers le CV
    messageLanguage: { type: String, required: true, lowercase: true }, // en, fr, es...
    customCriterion: { type: String, trim: true }, // critère libre jugé par l'IA, ex. "restaurants qui semblent avoir besoin d'un service de nettoyage"
    price: { type: Number, min: 0, default: 0 },                        // prix du service (paiement unique)
    priceOnQuote: { type: Boolean, default: false },                    // prix "sur devis" (pas de prix fixe)
    currency: { type: String, enum: CURRENCIES, default: "USD" },
    dailyLimit: { type: Number, min: 1, max: 200, default: 60 },        // commerces contactés max par jour (1 message chacun)
    includeLandlines: { type: Boolean, default: false },                // montrer aussi les numéros fixes (pour appeler)
    lastSearchAt: Date, // dernière recherche Google (limite : 1 par minute)
  },
  { timestamps: true }
);

// les villes de l'offre (nouvelles offres : targetCities, anciennes : targetCity)
// "toutes les villes", "all", "כל"... = tout le pays (pas une vraie ville)
const EVERYWHERE = /^(tou(t|te|tes|s)|partout|all|every|everywhere|whole|any|todas?|todos?|cualquier|כל)(?=\s|$)/i;
export const isEverywhere = (city) => EVERYWHERE.test(String(city || "").trim());

export function citiesOf(offer) {
  const cities = offer.targetCities?.length ? offer.targetCities : offer.targetCity ? [offer.targetCity] : [];
  return cities.filter((c) => !isEverywhere(c)); // vide = recherche dans tout le pays
}

export default mongoose.model("Offer", offerSchema);
