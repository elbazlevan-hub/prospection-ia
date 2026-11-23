import crypto from "node:crypto";
import bcrypt from "bcrypt";
import { sendMail } from "../lib/mailer.js";
import jwt from "jsonwebtoken";
import User from "../models/user.model.js";
import { emailKeyOf, ipHashOf, FREE_TRIALS_PER_IP, TRIAL_WINDOW_DAYS } from "../lib/antiAbuse.js";

const ONE_DAY = 24 * 60 * 60 * 1000;

// options du cookie : httpOnly = le JavaScript du navigateur ne peut pas lire le token
// en ligne, si l'app et l'API sont sur 2 domaines différents : COOKIE_SAMESITE=none (https obligatoire)
const isProd = process.env.NODE_ENV === "production";
const cookieOptions = {
  httpOnly: true,
  sameSite: process.env.COOKIE_SAMESITE || "lax",
  secure: isProd || process.env.COOKIE_SAMESITE === "none", // https seulement en production
  maxAge: ONE_DAY,
};

function sendToken(res, user, status, extra = {}) {
  const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: "1d", algorithm: "HS256" });
  res.cookie("token", token, cookieOptions);
  res.status(status).json({ user, ...extra }); // toJSON enlève passwordHash
}

// a-t-il droit aux 5 crédits offerts ? (anti-abus : pas d'essai en boucle avec plein de comptes)
async function canGetFreeTrial(emailKey, trialIpHash) {
  const sameMailbox = await User.exists({ emailKey });
  if (sameMailbox) return false; // jean+2@gmail.com = même boîte que jean@gmail.com
  if (!trialIpHash) return true;  // en local : pas de limite par IP
  const since = new Date(Date.now() - TRIAL_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const trialsFromIp = await User.countDocuments({ trialIpHash, trialGiven: true, createdAt: { $gte: since } });
  return trialsFromIp < FREE_TRIALS_PER_IP;
}

// POST /api/auth/register  (body déjà validé par Zod)
export async function register(req, res) {
  const { name, email, password, language, country } = req.body;

  const exists = await User.findOne({ email: email.toLowerCase() });
  if (exists) {
    return res.status(409).json({ message: "Email already exists" });
  }

  const emailKey = emailKeyOf(email);
  const trialIpHash = ipHashOf(req);
  const trialGiven = await canGetFreeTrial(emailKey, trialIpHash);

  const passwordHash = await bcrypt.hash(password, 10); // 10 salt rounds
  const user = await User.create({
    name, email, passwordHash, language, country,
    emailKey, trialIpHash, trialGiven,
    // sans essai gratuit : 0 crédit et plus de recherche gratuite -> il peut quand même acheter un pack
    ...(trialGiven ? {} : { credits: 0, freeSearchUsed: true }),
  });

  sendToken(res, user, 201, { trialGiven }); // connecté directement après l'inscription
}

// POST /api/auth/login
export async function login(req, res) {
  const { email, password } = req.body;

  const user = await User.findOne({ email: email.toLowerCase() });
  // même message si email ou mot de passe faux (on ne dit pas lequel)
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ message: "Invalid email or password" });
  }

  sendToken(res, user, 200);
}

// POST /api/auth/logout
export function logout(req, res) {
  res.clearCookie("token", { ...cookieOptions, maxAge: undefined });
  res.status(200).json({ message: "Logged out" });
}

// GET /api/auth/me  (protégée) -> le React l'appelle au démarrage pour savoir qui est connecté
export async function me(req, res) {
  const user = await User.findById(req.userId);
  if (!user) return res.status(404).json({ message: "User not found" });
  res.status(200).json({ user });
}

// ---------- mot de passe oublié ----------
const RESET_MINUTES = 30;
const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");
const appUrl = () => (process.env.CLIENT_URL || "http://localhost:5173").split(",").pop().trim().replace(/\/$/, "");

const RESET_MAIL = {
  en: (link) => ({ subject: "Reset your AIDY password", text: `Hello,\n\nClick this link to choose a new password (valid ${RESET_MINUTES} minutes):\n${link}\n\nIf you didn't ask for it, just ignore this email.` }),
  fr: (link) => ({ subject: "Réinitialiser votre mot de passe AIDY", text: `Bonjour,\n\nCliquez sur ce lien pour choisir un nouveau mot de passe (valable ${RESET_MINUTES} minutes) :\n${link}\n\nSi vous n'avez rien demandé, ignorez simplement cet email.` }),
  es: (link) => ({ subject: "Restablece tu contraseña de AIDY", text: `Hola,\n\nHaz clic en este enlace para elegir una nueva contraseña (válido ${RESET_MINUTES} minutos):\n${link}\n\nSi no lo pediste, ignora este email.` }),
};

// POST /api/auth/forgot-password  { email }
// répond toujours la même chose : on ne dit jamais si l'email existe (sécurité)
export async function forgotPassword(req, res) {
  const user = await User.findOne({ email: req.body.email.toLowerCase() });
  // max 1 lien par minute pour le même compte
  const recentlySent = user?.resetTokenExpires && user.resetTokenExpires.getTime() - RESET_MINUTES * 60_000 > Date.now() - 60_000;
  if (user && !recentlySent) {
    const token = crypto.randomBytes(32).toString("hex"); // envoyé par email, jamais stocké en clair
    user.resetTokenHash = hashToken(token);
    user.resetTokenExpires = new Date(Date.now() + RESET_MINUTES * 60_000);
    await user.save();
    const link = `${appUrl()}/reset-password?token=${token}`;
    const mail = (RESET_MAIL[user.language] || RESET_MAIL.en)(link);
    await sendMail({ to: user.email, subject: mail.subject, text: mail.text });
  }
  res.status(200).json({ message: "If an account exists for this email, a reset link has been sent" });
}

// POST /api/auth/reset-password  { token, password }
export async function resetPassword(req, res) {
  const user = await User.findOne({ resetTokenHash: hashToken(req.body.token), resetTokenExpires: { $gt: new Date() } });
  if (!user) return res.status(400).json({ message: "This link is invalid or expired. Ask for a new one." });
  user.passwordHash = await bcrypt.hash(req.body.password, 10);
  user.resetTokenHash = undefined;
  user.resetTokenExpires = undefined;
  await user.save();
  sendToken(res, user, 200); // connecté directement avec le nouveau mot de passe
}
