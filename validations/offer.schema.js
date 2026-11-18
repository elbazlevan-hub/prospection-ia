import { z } from "zod";
import { CRITERIA, CURRENCIES } from "../models/offer.model.js";

// même schéma pour POST (création) et PUT (remplacement complet)
export const offerSchema = z
  .object({
    title: z.string().trim().min(3, "title must be at least 3 characters").max(100),
    description: z.string().trim().max(1000).optional(),
    serviceType: z.string().trim().min(2, "serviceType is required"),
    targetCategories: z
      .array(z.string().trim().min(2))
      .min(1, "choose at least one category")
      .max(10, "max 10 categories"),
    targetCountry: z.string().trim().length(2, "targetCountry = ISO code (US, FR, GB...)"),
    targetCities: z.array(z.string().trim().min(2)).max(10, "max 10 cities").optional(),
    targetCity: z.string().trim().min(2).optional(), // ancien format (1 ville), encore accepté
    criteria: z.array(z.enum(CRITERIA)).min(1, "choose at least one criterion"),
    messageLanguage: z.string().trim().length(2, "messageLanguage = 2 letters (en, fr, es...)"),
    customCriterion: z.string().trim().min(5, "customCriterion is too short").max(300).optional(),
    price: z.number().min(0, "price must be positive").max(1_000_000).default(0),
    currency: z.enum(CURRENCIES).default("USD"),
    dailyLimit: z.number().int().min(1).max(200, "max 200 contacts per day").default(20),
    includeLandlines: z.boolean().default(false),
  })
  // une recherche = (villes x catégories) : on limite pour protéger le quota Google
  .refine((o) => (o.targetCities?.length || 1) * o.targetCategories.length <= 20, {
    message: "too many searches: cities x categories must be 20 or less",
    path: ["targetCities"],
  })
  // on range tout dans targetCities (sans doublons)
  .transform(({ targetCity, targetCities, ...rest }) => {
    const cities = [...new Set([...(targetCities || []), ...(targetCity ? [targetCity] : [])])];
    return { ...rest, targetCities: cities, targetCity: cities[0] };
  });

// POST /api/offers/suggest : AIDY remplit l'offre à partir d'une description libre
export const suggestOfferSchema = z.object({
  text: z.string().trim().min(15, "describe what you sell in at least 15 characters").max(1500),
  country: z.string().trim().length(2, "country = ISO code (US, FR, GB...)").toUpperCase().optional(),
  city: z.string().trim().min(2).max(80).optional(),
  language: z.string().trim().length(2, "language = 2 letters (en, fr, es...)").toLowerCase().optional(),
});

// POST /api/offers/:id/unlock : débloquer les meilleurs prospects
export const unlockSchema = z.object({
  count: z.number().int().min(1).max(100, "max 100 leads at once").default(5),
});
