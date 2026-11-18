import { z } from "zod";

const text = (max) => z.string().trim().max(max).optional();
const url = z.string().trim().url("must be a full link (https://...)").max(300).optional().or(z.literal(""));

// PUT /api/profile : la fiche infos du vendeur
export const sellerProfileSchema = z.object({
  signature: text(60),
  priceInfo: text(500),
  deliveryTime: text(200),
  portfolioUrl: url,
  bookingUrl: url,
  guarantees: text(300),
  faq: text(1500),
});
