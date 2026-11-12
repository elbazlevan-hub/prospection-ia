# Plateforme IA de prospection — Backend

API Express + MongoDB Atlas. Le JWT est stocké dans un cookie httpOnly.

## Lancer le serveur
1. `npm install`
2. Copier `.env.example` en `.env` et remplir `DATABASE_URL` (MongoDB Atlas), `JWT_SECRET` et `GOOGLE_PLACES_API_KEY` (Google Cloud → Places API (New))
3. `npm start` → http://localhost:3000

## Collections
`users`, `offers`, `businesses`, `leads` (voir l'ERD)

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
| GET | /api/offers/:id/leads | oui | prospects de l'offre avec le commerce (`?status=toContact`) |

## Tester avec Postman
Importer `Prospection-API.postman_collection.json`. Lancer d'abord **Register** ou **Login** :
Postman garde le cookie automatiquement pour les requêtes suivantes.

## Critères d'une offre (`criteria`)
`noWebsite`, `socialOnly`, `siteDown`, `oldWebsite`, `whatsappBooking`, `noOnlineBooking`, `lowRating`, `fewReviews`, `noSocial`.
Le score d'un prospect = somme des poids des critères de l'offre qu'il remplit (max 100), voir `lib/scoring.js`.
