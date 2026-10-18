# API interne du serveur

Cette API est celle de l’application, sur la même origine que l’interface. Elle est distincte de l’API publique MineCards. Réponses JSON ; erreurs sous la forme `{ "error": "message" }`.

## Comptes et profil

Le navigateur conserve un cookie de session `HttpOnly`. Les appels authentifiés doivent transmettre ce cookie. Le nom de connexion est normalisé en minuscules ; aucun email n’est demandé.

| Méthode | Route | Fonction |
| --- | --- | --- |
| POST | `/api/register` | Créer un compte vide : `username`, `password` |
| POST | `/api/login` | Se connecter : `username`, `password` |
| GET | `/api/me` | Lire le compte et son profil |
| POST | `/api/logout` | Fermer la session courante |
| PATCH | `/api/profile` | Modifier identité, images et deck mis en avant |
| PUT | `/api/password` | Modifier le mot de passe : `currentPassword`, `newPassword`, `confirmPassword` |

`PATCH /api/profile` attend `displayName`, `bio`, `avatar` et `accent`. Champs optionnels : `avatarImage`, `bannerImage`, `featuredDeckId`. Une chaîne vide retire une image ou le choix explicite d’un deck ; un champ optionnel absent conserve sa valeur. Le serveur valide les images et l’appartenance du deck.

## Collection

| Méthode | Route | Fonction |
| --- | --- | --- |
| GET | `/api/data` | Collection fusionnée et favoris du compte courant |
| PUT | `/api/data` | Enregistrer `{ "data": { "cards": [], "favoriteDecks": [] } }` |

Une carte utilise `id`, `nom`, `rarete`, `valeur`, `attaque`, `defense`, `image`. `valeur` désigne la puissance. Les cartes importées exposent `_minecards.cardId`, `_minecards.quantity` et, après synchronisation, `_minecards.power` (puissance officielle). Les favoris peuvent enregistrer le mode du créateur : `closest`, `ceiling` ou `strongest`.

La synchronisation conserve aussi dans `_minecards` les attributs officiels `category`, `dimension`, `attack`, `defense`, `active`, `rarity` et `nameEn`. Le préparateur tactique utilise ces attributs sans écraser `attaque` et `defense` historiques.

Un favori `mode: "arena"` contient trois entrées `cards`, de zéro à deux entrées `supports`, `arenaId` (`overworld`, `nether`, `end`), `tactic` (`balanced`, `aggressive`, `defensive`) et `teamCost`. `totalPower` est un repère de collection pour les trois créatures ; `targetPower` vaut `null`. Les nouvelles compositions et changements d’équipe sont validés côté serveur avec le stock réellement synchronisé : catégories, activité, raretés, unicité et coût total ≤ 18. Les instantanés des anciens favoris restent consultables si une carte quitte la collection. Une composition refusée renvoie `409` avec la raison.

La sauvegarde filtre les cartes importées pour ne pas les transformer en cartes locales. Les favoris gardent leurs instantanés. Limites : 1 000 cartes locales et 500 decks par compte.

## MineCards

| Méthode | Route | Fonction |
| --- | --- | --- |
| GET | `/api/minecards/status` | Configuration, version, dernier import, quantités, avancement |
| POST | `/api/minecards/connect` | Valider puis conserver la clé privée : `{ "key": "CLE_PERSONNELLE" }` |
| POST | `/api/minecards/disconnect` | Retirer la clé, conserver la collection importée |
| POST | `/api/minecards/sync` | Démarrer ou reprendre un import complet, réponse `202` |
| POST | `/api/minecards/sync/step` | Lire et valider la prochaine page : `{ "jobId": "UUID", "page": 1 }` |
| GET | `/api/minecards/explore/:resource` | Explorer une ressource autorisée |
| GET | `/api/minecards/explore/:resource/:id` | Lire un détail pris en charge |

Ressources : `cards`, `collection`, `boosters`, `profiles`, `arenas`, `auctions`, `leaderboard`. Détails pour `cards`, `profiles`, `arenas` et `auctions`.

Pagination : `page` de 1 à 1 000 et `limit` de 1 à 100, sauf boosters. Filtres : `q`, `rarity`, `category`, `dimension` pour catalogue et collection ; `q` pour profils ; `status` pour enchères. Les paramètres non pris en charge sont refusés.

Le même protocole s'applique en local et sur Vercel. `/sync` répond rapidement `202` avec l'état courant. Le navigateur appelle ensuite `/sync/step` pour chaque `job.nextPage`. Chaque étape répond `200` avec l'état confirmé ; la dernière contient aussi `data` (collection fusionnée et favoris). `/status` permet de retrouver l'étape après une interruption. Aucun travail ne continue en arrière-plan après une réponse.

L'état expose `syncProtocol: 2`, `autoSyncMs: 30000` et un `job` avec `id`, `running`, `phase`, `pages`, `received`, `nextPage`, dates et éventuellement `retryAt`, `error`, `durationMs`. `nextPollMs` indique le délai avant de redemander une étape en cours. `received` compte les entrées différentes avec une quantité positive, pas les exemplaires. Le client attend `retryAt` avant de reprendre. Une étape répétée ou ancienne ne peut pas ajouter deux fois la même page. La collection précédente reste active jusqu'à `phase: "complete"`.

La reprise expire 15 minutes après le début de l'import ; une nouvelle synchronisation est alors nécessaire. Une clé remplacée ou déconnectée invalide les pages déjà lues. Les pages provisoires et l'empreinte de connexion sont privées ; aucune clé, empreinte ou donnée de compte sensible n'est renvoyée par l'état.

### Contrat MineCards consulté le 18 octobre 2026

La [documentation officielle](https://minecards.vercel.app/developpeurs) et son [schéma OpenAPI](https://minecards.vercel.app/openapi.json) indiquent toujours la version **1.1.0**. Toutes les routes disponibles sont intégrées ; aucune route d’écriture n’est proposée par le fournisseur.

Les lectures distantes ne sont pas mises en cache. Les filtres vides, répétés, inconnus, les raretés / statuts hors liste et les identifiants de détail invalides sont refusés avant d’utiliser le quota distant. Les listes suivent `nextPage` et la limite de navigation de 1 000 pages. Une synchronisation incomplète ou incohérente conserve la collection précédente.

Les lectures ordinaires refusées par le quota répondent avec `{ "error": "message", "retryAfter": 60 }` et un en-tête `Retry-After` exprimé en secondes ; la durée réelle vient de la réponse distante. Pour `/sync/step`, un quota ou une panne temporaire apparaît dans `job.error`, avec `phase: "waiting"` et `job.retryAt` (ISO 8601) tant qu'une reprise est possible. Les erreurs distantes temporaires autorisent deux nouvelles tentatives par page ; au-delà, `running` passe à `false` et `phase` à `"error"`. Les puissances utilisent toujours `power`, sans modifier l'attaque et la défense déjà importées.

## Administration

Toutes ces routes exigent le rôle `admin`.

| Méthode | Route | Fonction |
| --- | --- | --- |
| GET | `/api/admin/users` | Comptes et compteurs de collection / favoris |
| GET | `/api/admin/users/:userId` | Profil, collection fusionnée et favoris |
| DELETE | `/api/admin/users/:userId` | Supprimer un compte membre éligible |
| DELETE | `/api/admin/users/:userId/cards/:cardId` | Supprimer une carte locale d’un autre compte |
| DELETE | `/api/admin/users/:userId/decks/:deckId` | Supprimer un favori d’un autre compte |

Aucune suppression n’est envoyée à MineCards. Le serveur protège le compte administrateur courant, les autres comptes administrateurs et les opérations réservées aux données des autres profils.

## Codes usuels

`400` données invalides · `401` connexion requise ou clé distante refusée · `403` droits / origine refusés · `404` absence · `409` conflit · `413` requête trop volumineuse · `429` limitation · `502` erreur distante · `503` stockage indisponible / occupé.
