import { rateLimit } from "express-rate-limit";

// connexion / inscription / mot de passe oublié : 10 essais max par quart d'heure et par connexion internet
// (empêche un robot d'essayer des milliers de mots de passe)
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { message: "Too many attempts. Try again in 15 minutes." },
});
