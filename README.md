# AIDY — Plateforme IA de prospection (backend)

API Express + MongoDB Atlas. Le JWT est stocké dans un cookie httpOnly.

## Lancer le serveur
1. `npm install`
2. Copier `.env.example` en `.env` et remplir `DATABASE_URL` (MongoDB Atlas), `JWT_SECRET` `GOOGLE_PLACES_API_KEY` (Google Cloud → Places API (New)) et `ANTHROPIC_API_KEY` (console.anthropic.com)
3. `npm start` → http://localhost:3000

## Collections
`users`, `offers`, `businesses`, `leads`, `blocklists` (voir l'ERD)

## Routes
| Méthode | Route | Protégée | Rôle |
|---|---|---|---|
| POST | /api/auth/register | non | inscription (+ connexion) |
| POST | /api/auth/login | non | connexion, pose le cookie `token` |
| POST | /api/auth/logout | non | supprime le cookie |
| GET | /api/auth/me | oui | utilisateur connecté |
| GET | /api/offers/templates | oui | modèles d'offres par métier (site, photographe, community manager…) |
| POST | /api/offers/suggest | oui | AIDY remplit une offre à partir d'une description libre (`text`, `country`, `city`, `language`) |
| POST | /api/offers | oui | créer une offre |
| GET | /api/offers | oui | mes offres (`?country=GB&sort=-createdAt`) |
| GET | /api/offers/:id | oui | une offre + nombre de prospects par statut |
| PUT | /api/offers/:id | oui | modifier une offre |
| DELETE | /api/offers/:id | oui | supprimer une offre et ses prospects |
| POST | /api/offers/:id/search | oui | cherche les commerces sur Google Places et crée les prospects (1 fois / minute) |
| POST | /api/offers/:id/analyze | oui | visite le site de chaque prospect, détecte ses points faibles et calcule son score (0-100) |
| POST | /api/offers/:id/messages | oui | l'IA écrit les messages des meilleurs prospects (`?limit=10`, max 30, `?force=true` pour réécrire) |
| POST | /api/offers/:id/unlock | oui | débloque les meilleurs prospects (`count`, 1 crédit chacun) et AIDY écrit leurs messages |
| GET | /api/offers/:id/export | oui | télécharge les prospects en CSV (Excel) : contacts, score, message |
| GET | /api/leads/:id | oui | un prospect avec son commerce et son message |
| POST | /api/leads/:id/message | oui | réécrire le message IA d'un prospect |
| POST | /api/leads/:id/unlock | oui | débloque un prospect (1 crédit) + message AIDY |
| PATCH | /api/leads/:id | oui | changer le statut, les notes ou le montant (`dealValue`) |
| POST | /api/leads/:id/contact | oui | message (ou relance) envoyé par `channel` : programme les relances J+3 et J+7 |
| POST | /api/leads/:id/block | oui | ne plus jamais contacter ce commerce (liste « ne plus contacter ») |
| GET | /api/dashboard/today | oui | plan du jour : relances + prospects à contacter, limité par `dailyLimit` (`?offerId=`) |
| GET | /api/dashboard/stats | oui | statuts, argent gagné / possible, taux de réponse par canal et par problème (`?offerId=`) |
| GET | /api/dashboard/inbox | oui | « À répondre » : prospects qui ont répondu, classés par priorité (`?offerId=`) |
| POST | /api/leads/:id/reply | oui (Premium) | coller la réponse du prospect : AIDY la classe (intéressé, question, rendez-vous, pas intéressé, STOP), met à jour le statut et écrit la réponse |
| POST | /api/leads/:id/reply/sent | oui | la réponse a été envoyée (ajoutée à la conversation) |
| GET | /api/profile | oui | ma fiche infos (prix, délais, liens…) |
| PUT | /api/profile | oui | modifier ma fiche infos |
| GET | /api/blocklist | oui | mes commerces bloqués |
| DELETE | /api/blocklist/:id | oui | débloquer un commerce |
| GET | /api/offers/:id/leads | oui | prospects de l'offre avec le commerce (`?status=toContact`) |

## Tester avec Postman
Importer `Prospection-API.postman_collection.json`. Lancer d'abord **Register** ou **Login** :
Postman garde le cookie automatiquement pour les requêtes suivantes.

## Critères d'une offre (`criteria`)
`noWebsite`, `socialOnly`, `siteDown`, `oldWebsite`, `whatsappBooking`, `noOnlineBooking`, `lowRating`, `fewReviews`, `noSocial`, `fewPhotos`, `noInstagram`, `noHours`.
Le score d'un prospect = somme des poids des critères de l'offre qu'il remplit (max 100), voir `lib/scoring.js`.

## Messages IA
Pour chaque prospect, l'IA (Claude) reçoit : l'offre, les raisons détectées, les avis Google du commerce et la comparaison avec les concurrents de la même catégorie.
Elle n'utilise que ces faits (pas d'invention), écrit dans la langue de l'offre et ajoute une phrase pour ne plus être contacté.
Si l'offre a un `customCriterion` (critère libre), l'IA indique aussi si le commerce y correspond (`customFit`).

## Suivi des prospects
- **Statuts** : `toContact` → `contacted` → `interested` → `client` (ou `rejected`).
- **Envoi en un clic** : `GET /api/leads/:id` renvoie `links` (WhatsApp avec le message déjà écrit, email avec objet et texte, profil Instagram, téléphone) et `nextMessage` (premier message ou relance).
- **Relances** : après le premier contact, relance à J+3 puis à J+7 (`followUpAt`). Le plan du jour les affiche quand elles sont dues.
- **Limite par jour** : `dailyLimit` de l'offre (20 par défaut) pour ne pas être bloqué par WhatsApp ou les messageries. `?force=true` pour la dépasser.
- **Argent** : `price` et `currency` de l'offre ; `dealValue` du prospect (par défaut le prix de l'offre quand il devient client).
- **Ne plus contacter** : un commerce bloqué n'est plus jamais proposé, ni dans les recherches, ni dans le plan du jour.
- **Plusieurs villes** : `targetCities` (max 10, et villes x catégories <= 20 recherches).

## Essai gratuit et prospects verrouillés
- Un nouveau compte a **1 recherche gratuite** (1 ville, 1 catégorie) et **5 crédits**.
- Les prospects trouvés sont **verrouillés** : le serveur ne renvoie que la catégorie, la ville, la note Google, le score, les problèmes repérés et `hasMobile` / `hasEmail` / `hasInstagram`. Jamais le nom, l'adresse ni les contacts.
- **Débloquer** un prospect coûte 1 crédit et AIDY écrit son message.
- Plus de crédits ou de recherche gratuite : réponse **402** (packs payants à venir). Un compte `admin` n'a pas de limite.

## Numéros fixes
Par défaut, seuls les portables sont gardés (WhatsApp possible). Avec `includeLandlines: true` dans l'offre, les fixes sont aussi montrés, avec un lien pour appeler.

## Assistant de réponse AIDY (Premium)
1. L'utilisateur remplit sa **fiche infos** (`PUT /api/profile`) : signature, prix, délais, réalisations, lien de rendez-vous, garanties, FAQ.
2. Quand un prospect répond, il colle sa réponse (`POST /api/leads/:id/reply`).
3. AIDY la classe : 🟢 `interested`, ❓ `question`, 📅 `meeting`, 🔴 `notInterested`, ⛔ `stop`, met à jour le statut (STOP → liste « ne plus contacter ») et écrit la réponse **avec seulement les infos de la fiche** (rien d'inventé), dans la langue du prospect.
4. `GET /api/dashboard/inbox` liste ceux qui attendent une réponse : rendez-vous, puis questions, puis intéressés.
5. Les montants des clients gardent un **historique** (`dealHistory`).
