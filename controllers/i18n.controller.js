import crypto from "node:crypto";
import Translation from "../models/translation.model.js";
import { translateDict } from "../lib/translator.js";

const MAX_SOURCE = 80_000; // taille max des textes envoyés (en caractères)

export const hashOfSource = (source) => crypto.createHash("sha256").update(JSON.stringify(source)).digest("hex").slice(0, 16);

// nom anglais d'une langue, ou null si le code n'est pas une vraie langue
export function languageName(code) {
  try {
    const name = new Intl.DisplayNames(["en"], { type: "language" }).of(code);
    return name && name.toLowerCase() !== code.toLowerCase() ? name : null;
  } catch {
    return null;
  }
}

// POST /api/i18n/:lang  { source: { ...textes anglais de l'app } }
// renvoie l'app traduite dans cette langue (traduite par l'IA la 1re fois, puis gardée en base)
export async function getTranslation(req, res) {
  const lang = String(req.params.lang);
  const name = /^[a-z]{2,3}(-[A-Z]{2})?$/.test(lang) ? languageName(lang) : null;
  if (!name || ["en", "fr"].includes(lang)) return res.status(400).json({ message: "Unknown language" });

  const source = req.body?.source;
  const raw = JSON.stringify(source || "");
  if (!source || typeof source !== "object" || raw.length > MAX_SOURCE) return res.status(400).json({ message: "Invalid source texts" });

  const { dict, created } = await translationFor(lang, name, source);
  res.status(created ? 201 : 200).json({ lang, hash: hashOfSource(source), dict });
}

// la traduction d'une langue pour ces textes anglais : en base si elle existe,
// sinon l'IA traduit seulement ce qui a changé depuis la dernière traduction de cette langue
export async function translationFor(lang, name, source) {
  const hash = hashOfSource(source);
  const cached = await Translation.findOne({ lang, hash });
  if (cached) return { dict: cached.dict, created: false, translated: 0 };

  const previous = await Translation.findOne({ lang, source: { $exists: true } }).sort({ updatedAt: -1 });
  const { dict, translated, reused } = await translateDict(source, name, previous);
  await Translation.updateOne({ lang, hash }, { $set: { dict, source } }, { upsert: true });
  await Translation.deleteMany({ lang, hash: { $ne: hash } }); // les anciennes versions ne servent plus
  return { dict, created: true, translated, reused };
}
