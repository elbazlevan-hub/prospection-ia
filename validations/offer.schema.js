import { z } from "zod";
import { CRITERIA } from "../models/offer.model.js";

// même schéma pour POST (création) et PUT (remplacement complet)
export const offerSchema = z.object({
  title: z.string().trim().min(3, "title must be at least 3 characters").max(100),
  description: z.string().trim().max(1000).optional(),
  serviceType: z.string().trim().min(2, "serviceType is required"),
  targetCategories: z
    .array(z.string().trim().min(2))
    .min(1, "choose at least one category")
    .max(10, "max 10 categories"),
  targetCountry: z.string().trim().length(2, "targetCountry = ISO code (IL, FR, US...)"),
  targetCity: z.string().trim().min(2).optional(),
  criteria: z.array(z.enum(CRITERIA)).min(1, "choose at least one criterion"),
  messageLanguage: z.string().trim().length(2, "messageLanguage = 2 letters (he, fr, en...)"),
});
