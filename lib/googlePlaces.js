// Appel à Google Places API (New) - Text Search
// doc : https://developers.google.com/maps/documentation/places/web-service/text-search

const URL = "https://places.googleapis.com/v1/places:searchText";

// les champs qu'on demande à Google (obligatoire, sinon erreur)
const FIELDS = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.internationalPhoneNumber",
  "places.websiteUri",
  "places.rating",
  "places.primaryTypeDisplayName",
].join(",");

// erreur avec un code HTTP, gérée par le error middleware
function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

// enlève les champs vides (ex. pas de site web -> pas de champ "website")
function removeEmpty(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null));
}

// cherche des commerces : ex. query = "barber Netanya", country = "IL", language = "he"
export async function searchPlaces({ query, country, language }) {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) throw httpError(500, "GOOGLE_PLACES_API_KEY is missing in .env");

  const response = await fetch(URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": FIELDS,
    },
    body: JSON.stringify({
      textQuery: query,
      regionCode: country,   // limite/oriente la recherche au pays
      languageCode: language,
      pageSize: 20,          // max 20 résultats par recherche
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    // ex. clé invalide, quota dépassé, API pas activée
    console.error("Google Places error:", data.error?.message);
    throw httpError(502, `Google Places error: ${data.error?.message || response.status}`);
  }

  // on transforme la réponse Google en objets simples pour notre collection businesses
  return (data.places || []).map((p) =>
    removeEmpty({
      googlePlaceId: p.id,
      name: p.displayName?.text,
      category: p.primaryTypeDisplayName?.text,
      address: p.formattedAddress,
      phone: p.internationalPhoneNumber,
      website: p.websiteUri,
      rating: p.rating,
    })
  );
}
