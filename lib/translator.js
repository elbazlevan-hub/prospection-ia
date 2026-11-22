import { askClaudeJson } from "./claude.js";

const CHUNK = 60; // textes par appel à l'IA (les appels partent en parallèle)

// { a: { b: "x" } } -> [["a.b", "x"]]
function flatten(obj, prefix = "", out = []) {
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") out.push([path, v]);
    else if (v && typeof v === "object") flatten(v, path, out);
  }
  return out;
}

function setPath(obj, path, value) {
  const keys = path.split(".");
  let cur = obj;
  for (const k of keys.slice(0, -1)) cur = cur[k] ??= {};
  cur[keys.at(-1)] = value;
}

const SYSTEM = `You translate the texts of a web app (AIDY, an AI that finds clients for freelancers and small companies) from English into the requested language.
Rules:
- Natural, short, friendly wording, like a modern app. Use the formal "you" where the language has one.
- Keep EXACTLY as they are: words in {curly braces} (they are variables), emojis, "AIDY", "WhatsApp", "Instagram", "Google", "Excel", "Wolt", "Uber Eats", URLs, and "|" separators.
- Keep the same punctuation style (quotes, colons) adapted to the language.
Give your answer with the save_translation tool: one property per text, same ids.`;

// traduit tout le dictionnaire anglais dans une langue ; un texte non traduit reste en anglais
export async function translateDict(source, languageName) {
  const entries = flatten(source);
  const chunks = [];
  for (let i = 0; i < entries.length; i += CHUNK) chunks.push(entries.slice(i, i + CHUNK));

  const results = await Promise.all(
    chunks.map(async (chunk) => {
      const texts = Object.fromEntries(chunk.map(([, text], i) => [`t${i}`, text]));
      const schema = {
        type: "object",
        properties: Object.fromEntries(Object.keys(texts).map((id) => [id, { type: "string" }])),
        required: Object.keys(texts),
      };
      try {
        const out = await askClaudeJson({
          system: SYSTEM,
          prompt: `Language: ${languageName}\nTexts (JSON):\n${JSON.stringify(texts)}`,
          maxTokens: 4000,
          name: "save_translation",
          description: "Save the translated texts",
          schema,
        });
        return chunk.map(([path, text], i) => [path, typeof out[`t${i}`] === "string" && out[`t${i}`].trim() ? out[`t${i}`] : text]);
      } catch (err) {
        console.error("translation chunk failed:", err.message);
        return chunk; // on garde l'anglais pour ce morceau
      }
    })
  );

  const dict = {};
  for (const [path, text] of results.flat()) setPath(dict, path, text);
  return dict;
}
