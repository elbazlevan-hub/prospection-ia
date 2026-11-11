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
  "nextPageToken", // pour récupérer la page suivante
].join(",");

const MAX_PAGES = 3; // Google donne au maximum 3 pages de 20 = 60 résultats

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

// une seule page de résultats Google (20 max)
async function fetchPage({ query, country, language, pageToken, key }) {
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
      pageSize: 20,
      ...(pageToken && { pageToken }), // page suivante
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    // ex. clé invalide, quota dépassé, API pas activée
    console.error("Google Places error:", data.error?.message);
    throw httpError(502, `Google Places error: ${data.error?.message || response.status}`);
  }
  return data;
}

// cherche des commerces : ex. query = "barber London", country = "GB", language = "en"
// renvoie jusqu'à 60 commerces (3 pages de 20)
export async function searchPlaces({ query, country, language }) {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) throw httpError(500, "GOOGLE_PLACES_API_KEY is missing in .env");

  const places = [];
  let pageToken;
  for (let page = 0; page < MAX_PAGES; page++) {
    const data = await fetchPage({ query, country, language, pageToken, key });
    places.push(...(data.places || []));
    pageToken = data.nextPageToken;
    if (!pageToken) break; // plus de résultats
  }

  // on transforme la réponse Google en objets simples pour notre collection businesses
  return places.map((p) =>
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
