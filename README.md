# Plateforme IA de prospection — Backend

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
| POST | /api/offers | oui | créer une offre |
| GET | /api/offers | oui | mes offres (`?country=GB&sort=-createdAt`) |
| GET | /api/offers/:id | oui | une offre + nombre de prospects par statut |
| PUT | /api/offers/:id | oui | modifier une offre |
| DELETE | /api/offers/:id | oui | supprimer une offre et ses prospects |
| POST | /api/offers/:id/search | oui | cherche les commerces sur Google Places et crée les prospects (1 fois / minute) |
| POST | /api/offers/:id/analyze | oui | visite le site de chaque prospect, détecte ses points faibles et calcule son score (0-100) |
| POST | /api/offers/:id/messages | oui | l'IA écrit les messages des meilleurs prospects (`?limit=10`, max 30, `?force=true` pour réécrire) |
| GET | /api/offers/:id/export | oui | télécharge les prospects en CSV (Excel) : contacts, score, message |
| GET | /api/leads/:id | oui | un prospect avec son commerce et son message |
| POST | /api/leads/:id/message | oui | réécrire le message IA d'un prospect |
| PATCH | /api/leads/:id | oui | changer le statut, les notes ou le montant (`dealValue`) |
| POST | /api/leads/:id/contact | oui | message (ou relance) envoyé par `channel` : programme les relances J+3 et J+7 |
| POST | /api/leads/:id/block | oui | ne plus jamais contacter ce commerce (liste « ne plus contacter ») |
| GET | /api/dashboard/today | oui | plan du jour : relances + prospects à contacter, limité par `dailyLimit` (`?offerId=`) |
| GET | /api/dashboard/stats | oui | statuts, argent gagné / possible, taux de réponse par canal et par problème (`?offerId=`) |
| GET | /api/blocklist | oui | mes commerces bloqués |
| DELETE | /api/blocklist/:id | oui | débloquer un commerce |
| GET | /api/offers/:id/leads | oui | prospects de l'offre avec le commerce (`?status=toContact`) |

## Tester avec Postman
Importer `Prospection-API.postman_collection.json`. Lancer d'abord **Register** ou **Login** :
Postman garde le cookie automatiquement pour les requêtes suivantes.

## Critères d'une offre (`criteria`)
`noWebsite`, `socialOnly`, `siteDown`, `oldWebsite`, `whatsappBooking`, `noOnlineBooking`, `lowRating`, `fewReviews`, `noSocial`.
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
