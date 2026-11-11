import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().trim().min(2, "name must be at least 2 characters"),
  email: z.string().trim().email("invalid email"),
  password: z
    .string()
    .min(8, "password must be at least 8 characters")
    .regex(/[0-9]/, "password must contain a number")
    .regex(/[^A-Za-z0-9]/, "password must contain a special character"),
  language: z.string().trim().length(2, "language = 2 letters (en, fr, es...)").optional(),
  country: z.string().trim().length(2, "country = ISO code (US, FR, GB...)").optional(),
});

export const loginSchema = z.object({
  email: z.string().trim().email("invalid email"),
  password: z.string().min(1, "password is required"),
});
