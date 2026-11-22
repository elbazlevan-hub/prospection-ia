import { z } from "zod";
import { isDisposableEmail } from "../lib/antiAbuse.js";

export const registerSchema = z.object({
  name: z.string().trim().min(2, "name must be at least 2 characters"),
  email: z
    .string()
    .trim()
    .email("invalid email")
    .refine((email) => !isDisposableEmail(email), "disposable email addresses are not accepted"),
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

// mot de passe oublié : on demande un lien par email
export const forgotPasswordSchema = z.object({
  email: z.string().trim().email("invalid email"),
});

// nouveau mot de passe avec le lien reçu par email
export const resetPasswordSchema = z.object({
  token: z.string().trim().min(20, "invalid link"),
  password: z
    .string()
    .min(8, "password must be at least 8 characters")
    .regex(/[0-9]/, "password must contain a number")
    .regex(/[^A-Za-z0-9]/, "password must contain a special character"),
});
