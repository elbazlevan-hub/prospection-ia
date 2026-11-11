import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import User from "../models/user.model.js";

const ONE_DAY = 24 * 60 * 60 * 1000;

// options du cookie : httpOnly = le JavaScript du navigateur ne peut pas lire le token
const cookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production", // https seulement en production
  maxAge: ONE_DAY,
};

function sendToken(res, user, status) {
  const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: "1d" });
  res.cookie("token", token, cookieOptions);
  res.status(status).json({ user }); // toJSON enlève passwordHash
}

// POST /api/auth/register  (body déjà validé par Zod)
export async function register(req, res) {
  const { name, email, password, language, country } = req.body;

  const exists = await User.findOne({ email: email.toLowerCase() });
  if (exists) {
    return res.status(409).json({ message: "Email already exists" });
  }

  const passwordHash = await bcrypt.hash(password, 10); // 10 salt rounds
  const user = await User.create({ name, email, passwordHash, language, country });

  sendToken(res, user, 201); // connecté directement après l'inscription
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
