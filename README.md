# AIDY — Plateforme IA de prospection (backend)

API Express + MongoDB Atlas. Le JWT est stocké dans un cookie httpOnly.

## Lancer le serveur
1. `npm install`
2. Copier `.env.example` en `.env` et remplir `DATABASE_URL` (MongoDB Atlas), `JWT_SECRET`, `GOOGLE_PLACES_API_KEY` (Google Cloud → Places API (New)) et `ANTHROPIC_API_KEY` (console.anthropic.com)
3. `npm start` → http://localhost:3000

## Collections
`users`, `offers`, `businesses`, `leads`, `blocklists`, `purchases` : voir le schéma `docs/ERD-AIDY.drawio` (s'ouvre sur https://app.diagrams.net).

## Routes
| Méthode | Route | Protégée | Rôle |
|---|---|---|---|
| POST | /api/auth/register | non | inscription (+ connexion) |
| POST | /api/auth/login | non | connexion, pose le cookie `token` |
| POST | /api/auth/logout | non | supprime le cookie |
| GET | /api/auth/me | oui | utilisateur connecté |
| POST | /api/auth/forgot-password | non | mot de passe oublié : envoie un lien par email (valable 30 min, réponse identique que l'email existe ou non) |
| POST | /api/auth/reset-password | non | nouveau mot de passe avec le lien (`token`, `password`), puis connexion |
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
| GET | /api/packs | oui | les packs + mes crédits + mon historique d'achats |
| POST | /api/packs/:id/buy | oui | acheter un pack `standard`, `premium` ou `recharge` (paiement de démonstration) |
| POST | /api/i18n/:lang | oui | l'interface traduite dans une langue (`de`, `ar`, `pt-BR`…) — traduite par l'IA la 1re fois, puis gardée dans la collection `translations` |
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
- **Limite par jour** : `dailyLimit` de l'offre (60 par défaut) pour ne pas être bloqué par WhatsApp ou les messageries. `?force=true` pour la dépasser.
- **Argent** : `price` et `currency` de l'offre ; `dealValue` du prospect (par défaut le prix de l'offre quand il devient client).
- **Ne plus contacter** : un commerce bloqué n'est plus jamais proposé, ni dans les recherches, ni dans le plan du jour.
- **Plusieurs villes** : `targetCities` (max 10, et villes x catégories <= 20 recherches). Sans ville (ou « toutes les villes »), la recherche se fait dans tout le pays.

## Essai gratuit et prospects verrouillés
- Un nouveau compte a **1 recherche gratuite** (1 ville, 1 catégorie) et **5 crédits**.
- Les prospects trouvés sont **verrouillés** : le serveur ne renvoie que la catégorie, la ville, la note Google, le score, les problèmes repérés et `hasMobile` / `hasEmail` / `hasInstagram`. Jamais le nom, l'adresse ni les contacts.
- **Débloquer** un prospect coûte 1 crédit et AIDY écrit son message.
- Plus de crédits ou de recherche gratuite : réponse **402**, l'utilisateur achète un pack. Un compte `admin` n'a pas de limite.
- La recherche gratuite n'est consommée que si elle trouve des commerces, et les commerces sans aucun problème lié à l'offre sont cachés (ils n'ont pas besoin du vendeur).

## Numéros fixes
Par défaut, seuls les portables sont gardés (WhatsApp possible). Avec `includeLandlines: true` dans l'offre, les fixes sont aussi montrés, avec un lien pour appeler.

## Assistant de réponse AIDY (Premium)
1. L'utilisateur remplit sa **fiche infos** (`PUT /api/profile`) : signature, prix, délais, réalisations, lien de rendez-vous, garanties, FAQ.
2. Quand un prospect répond, il colle sa réponse (`POST /api/leads/:id/reply`).
3. AIDY la classe : 🟢 `interested`, ❓ `question`, 📅 `meeting`, 🔴 `notInterested`, ⛔ `stop`, met à jour le statut (STOP → liste « ne plus contacter ») et écrit la réponse **avec seulement les infos de la fiche** (rien d'inventé), dans la langue du prospect.
4. `GET /api/dashboard/inbox` liste ceux qui attendent une réponse : rendez-vous, puis questions, puis intéressés.
5. Les montants des clients gardent un **historique** (`dealHistory`).

## Packs (paiement unique, pas d'abonnement)
1 crédit = 1 commerce débloqué avec son message AIDY. Les crédits n'expirent pas, et les commerces débloqués restent visibles même à 0 crédit.

| Pack | Prix | Crédits | Recherches | Assistant de réponse |
|---|---|---|---|---|
| Gratuit (à l'inscription) | 0 $ | 5 | 1 | non |
| Standard | 29 $ | 60 | illimitées | non |
| Premium | 49 $ | 120 | illimitées | oui |
| Recharge | 19 $ | 30 | illimitées | garde la formule actuelle |

- La **Recharge** n'est possible qu'après un premier pack (sinon **400**). Un Premium qui achète une recharge reste Premium.
- Chaque achat est enregistré dans la collection `purchases` (historique affiché dans l'app).
- Le paiement est pour l'instant **de démonstration** (`demo: true`) : les crédits sont ajoutés sans carte bancaire. Le vrai paiement (Stripe) viendra ensuite : il appellera la même logique une fois le paiement validé.

## Anti-abus de l'essai gratuit
Pour éviter qu'une personne crée plein de comptes pour avoir 5 commerces gratuits à chaque fois (`lib/antiAbuse.js`) :
- **Emails jetables refusés** (yopmail, mailinator, temp-mail… ~90 domaines) : **400** à l'inscription.
- **Une seule boîte mail = un seul essai** : `jean+2@gmail.com` et `j.ean@gmail.com` sont la même boîte que `jean@gmail.com` (`emailKey`).
- **2 essais gratuits maximum par connexion internet sur 30 jours** (`FREE_TRIALS_PER_IP` dans le `.env`). L'adresse IP n'est jamais stockée en clair, seulement une empreinte (hash SHA-256).
- Au-delà, le compte est quand même créé mais **sans les 5 crédits** (`trialGiven: false`) : il peut acheter un pack. Une famille ou une école sur la même connexion n'est donc pas bloquée.
- En local (localhost) la limite par IP ne s'applique pas, pour pouvoir tester.

## Mise en ligne (Render, Railway…)
- Commande de démarrage : `node app.js` (les variables viennent de l'hébergeur, pas du fichier `.env`).
- Variables à remplir : `DATABASE_URL`, `JWT_SECRET`, `GOOGLE_PLACES_API_KEY`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`,
  `NODE_ENV=production`, `CLIENT_URL` (adresse de l'app React en ligne ; plusieurs adresses possibles, séparées par des virgules).
- Si l'app et l'API sont sur 2 domaines différents sans proxy : `COOKIE_SAMESITE=none`. Avec le proxy Netlify du client (`public/_redirects`), rien à ajouter.
- MongoDB Atlas → *Network Access* : autoriser l'adresse du serveur (ou `0.0.0.0/0`).
- `trust proxy` est activé en production : l'IP réelle du visiteur est utilisée pour l'anti-abus.
