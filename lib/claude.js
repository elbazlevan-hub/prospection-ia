// Appel à l'API Claude (Anthropic) - https://docs.claude.com
const URL = "https://api.anthropic.com/v1/messages";

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// envoie un prompt à Claude et renvoie le texte de la réponse
// réessaie automatiquement si l'API est surchargée ou si on envoie trop de demandes (429, 529, 5xx)
export async function askClaude({ system, prompt, maxTokens = 1200 }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw httpError(500, "ANTHROPIC_API_KEY is missing in .env");

  for (let attempt = 1; ; attempt++) {
    const response = await fetch(URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-haiku-5-5",
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (response.ok) return data.content?.map((c) => c.text || "").join("") || "";

    const retryable = response.status === 429 || response.status >= 500;
    if (retryable && attempt < 4) {
      // l'API dit combien de secondes attendre (sinon 2s, 4s, 8s)
      const seconds = Number(response.headers.get("retry-after")) || 2 ** attempt;
      console.warn(`Claude API ${response.status}, nouvel essai dans ${seconds}s...`);
      await wait(seconds * 1000);
      continue;
    }

    console.error("Claude API error:", response.status, data.error?.message);
    throw httpError(502, `Claude API error: ${data.error?.message || response.status}`);
  }
}

// répare les retours à la ligne écrits "en vrai" dans les textes (interdits en JSON)
function escapeNewlinesInStrings(json) {
  let out = "";
  let inString = false;
  let escaped = false;
  for (const ch of json) {
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      else if (ch === "\n") { out += "\\n"; continue; }
      else if (ch === "\r") continue;
      else if (ch === "\t") { out += "\\t"; continue; }
    } else if (ch === '"') inString = true;
    out += ch;
  }
  return out;
}

// trouve le premier objet JSON complet { ... } en respectant les textes entre guillemets
function extractFirstObject(text) {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return text.slice(start, i + 1);
  }
  return text.slice(start); // JSON coupé : on tente quand même
}

// récupère le premier objet JSON dans un texte (Claude renvoie du JSON)
export function parseJson(text) {
  const raw = extractFirstObject(text);
  if (raw) {
    for (const candidate of [raw, escapeNewlinesInStrings(raw)]) {
      try {
        return JSON.parse(candidate);
      } catch {
        // on essaie la version suivante
      }
    }
  }
  // pour comprendre le problème : on affiche le début de la réponse dans le terminal
  console.error("Invalid AI JSON (debut):", text.slice(0, 400).replace(/\n/g, " "));
  throw httpError(502, "AI answer is not valid JSON");
}
