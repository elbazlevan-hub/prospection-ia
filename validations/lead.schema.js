import { z } from "zod";
import { LEAD_STATUS, CHANNELS } from "../models/lead.model.js";

// PATCH /api/leads/:id : changer le statut, les notes ou le montant
export const updateLeadSchema = z
  .object({
    status: z.enum(LEAD_STATUS).optional(),
    notes: z.string().trim().max(2000).optional(),
    dealValue: z.number().min(0, "dealValue must be positive").max(1_000_000).optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: "send at least status, notes or dealValue" });

// POST /api/leads/:id/contact : le message a été envoyé par ce canal
export const contactLeadSchema = z.object({
  channel: z.enum(CHANNELS, { message: `channel must be one of: ${CHANNELS.join(", ")}` }),
});

// POST /api/leads/:id/block : ne plus jamais contacter ce commerce
export const blockLeadSchema = z.object({
  reason: z.string().trim().max(300).optional(),
});

// POST /api/leads/:id/reply : coller la réponse du prospect
export const replySchema = z.object({
  text: z.string().trim().min(1, "paste the business's reply").max(3000),
  lang: z.string().trim().max(10).optional(), // langue de l'app : les conseils d'AIDY sont écrits dans cette langue
});

// POST /api/leads/:id/reply/sent : la réponse d'AIDY (éventuellement modifiée) a été envoyée
export const replySentSchema = z.object({
  text: z.string().trim().min(1).max(3000).optional(),
});
