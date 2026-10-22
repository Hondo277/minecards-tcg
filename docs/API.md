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
| GET | `/api/sessions` | Sessions actives du compte : identifiant public, navigateur déclaré, dates et session courante |
| POST | `/api/sessions/revoke` | Révoquer une autre session avec `{ "id": "UUID" }` ou toutes les autres avec `{ "others": true }` |
| GET | `/api/export` | Export personnel JSON : profil public, données fusionnées et carnet |

`PATCH /api/profile` attend `displayName`, `bio`, `avatar` et `accent`. Champs optionnels : `avatarImage`, `bannerImage`, `featuredDeckId`. Une chaîne vide retire une image ou le choix explicite d’un deck ; un champ optionnel absent conserve sa valeur. Le serveur valide les images et l’appartenance du deck.

Les identifiants publics des sessions sont distincts des empreintes utilisées pour l'authentification. La révocation ne permet pas de fermer sa propre session courante ; utiliser `/api/logout`. Le navigateur affiché est le `User-Agent` déclaré lors de la connexion, sans garantie d'identité de l'appareil. Les anciennes sessions sans date ou navigateur restent révocables. Une suspension de compte révoque ses sessions et interdit l'accès même avec un ancien cookie.

`/api/export` exclut les clés MineCards, sels, empreintes de mots de passe, jetons et empreintes de session. Cet export de consultation n'est pas un fichier de restauration complet du serveur.

## Collection

| Méthode | Route | Fonction |
| --- | --- | --- |
| GET | `/api/data` | Collection fusionnée et favoris du compte courant |
| PUT | `/api/data` | Enregistrer `{ "revision": 0, "data": { "cards": [], "favoriteDecks": [] } }` |

Une carte utilise `id`, `nom`, `rarete`, `valeur`, `attaque`, `defense`, `image`. `valeur` désigne la puissance. Les cartes importées exposent `_minecards.cardId`, `_minecards.quantity` et, après synchronisation, `_minecards.power` (puissance officielle). Les favoris peuvent enregistrer le mode du créateur : `closest`, `ceiling` ou `strongest`.

La synchronisation conserve aussi dans `_minecards` les attributs officiels `category`, `dimension`, `attack`, `defense`, `active`, `rarity` et `nameEn`. Le préparateur tactique utilise ces attributs sans écraser `attaque` et `defense` historiques.

Un favori `mode: "arena"` contient trois entrées `cards`, de zéro à deux entrées `supports`, `arenaId` (`overworld`, `nether`, `end`), `tactic` (`balanced`, `aggressive`, `defensive`) et `teamCost`. `totalPower` est un repère de collection pour les trois créatures ; `targetPower` vaut `null`. Les nouvelles compositions et changements d’équipe sont validés côté serveur avec le stock réellement synchronisé : catégories, activité, raretés, unicité et coût total ≤ 18. Les instantanés des anciens favoris restent consultables si une carte quitte la collection. Une composition refusée renvoie `409` avec la raison.

La sauvegarde filtre les cartes importées pour ne pas les transformer en cartes locales. Les favoris gardent leurs instantanés. Limites : 1 000 cartes locales et 500 decks par compte.

`GET /api/data` renvoie aussi `revision`. La sauvegarde doit transmettre cette dernière valeur et reçoit la nouvelle révision confirmée. Une révision absente ou dépassée renvoie `409` avec `staleData: true`, sans écriture : recharger les données avant de réappliquer la modification. Les sauvegardes locales / favoris et suppressions admin avancent cette révision. Les mises à jour de métadonnées depuis MineCards conservent la révision ; elles sont réappliquées côté serveur lors d'une sauvegarde. L'état MineCards expose `dataRevision` pour appliquer correctement la copie finale.

### Carnet privé

| Méthode | Route | Fonction |
| --- | --- | --- |
| GET | `/api/notebook` | `{ "entries": { "mc:card_id": { "favorite": true, "note": "…", "updatedAt": "ISO 8601" } } }` |
| PATCH | `/api/notebook` | Enregistrer une entrée avec `key`, `favorite` (booléen) et `note` (chaîne) |

Clés stables : `mc:<cardId>` ou `local:<id>`. Une nouvelle entrée doit correspondre à une carte possédée. Limites : 600 caractères par note et 2 000 entrées par compte. Une note vide avec `favorite: false` efface l'entrée. Les entrées existantes peuvent être retirées même si la carte a quitté la collection. Le carnet est séparé de `PUT /api/data` et de la synchronisation API ; il n'est pas inclus dans les fiches admin des autres profils.

## Informations du site

`GET /api/site` est public et renvoie uniquement `message`, `tone` (`info`, `warning`, `success`) et `registrationsOpen`. Les inscriptions sont autorisées par défaut. Une fermeture renvoie `403` lors de l'inscription ; les connexions des comptes existants restent possibles.

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

Pagination : `page` de 1 à 1 000 et `limit` de 1 à 100, sauf boosters. Filtres : `q`, `rarity`, `category`, `dimension` pour catalogue et collection ; `q` pour profils ; `status` et `rarity` (dont `MYTHIQUE`) pour enchères. Les paramètres non pris en charge sont refusés.

Le même protocole s'applique en local et sur Vercel. `/sync` répond rapidement `202` avec l'état courant. Le navigateur appelle ensuite `/sync/step` pour chaque `job.nextPage`. Chaque étape répond `200` avec l'état confirmé ; la dernière contient aussi `data` (collection fusionnée et favoris). `/status` permet de retrouver l'étape après une interruption. Aucun travail ne continue en arrière-plan après une réponse.

L'état expose `syncProtocol: 2`, `autoSyncMs: 30000` et un `job` avec `id`, `running`, `phase`, `pages`, `received`, `nextPage`, dates et éventuellement `retryAt`, `error`, `durationMs`. `nextPollMs` indique le délai avant de redemander une étape en cours. `received` compte les entrées différentes avec une quantité positive, pas les exemplaires. Le client attend `retryAt` avant de reprendre. Une étape répétée ou ancienne ne peut pas ajouter deux fois la même page. La collection précédente reste active jusqu'à `phase: "complete"`.

La reprise expire 15 minutes après le début de l'import ; une nouvelle synchronisation est alors nécessaire. Une clé remplacée ou déconnectée invalide les pages déjà lues. Les pages provisoires et l'empreinte de connexion sont privées ; aucune clé, empreinte ou donnée de compte sensible n'est renvoyée par l'état.

### Contrat MineCards consulté le 22 octobre 2026

La [documentation officielle](https://minecards.vercel.app/developpeurs) et son [schéma OpenAPI](https://minecards.vercel.app/openapi.json) indiquent toujours la version **1.1.0**, avec les nouveaux champs de finition, cartes secrètes et booster Éclipse. Toutes les routes disponibles sont intégrées ; aucune route d'écriture, de solde de recyclage ou d'historique de recyclage n'est proposée par cette API.

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
| GET | `/api/admin/overview` | Profils enrichis, statistiques cumulées, stockage utilisé et réglages du site |
| PATCH | `/api/admin/users/:userId/access` | Suspendre / réactiver un membre : `{ "suspended": true, "reason": "motif" }` |
| POST | `/api/admin/users/:userId/sessions/revoke` | Déconnecter toutes les sessions d'un membre |
| POST | `/api/admin/users/:userId/bulk-delete` | Supprimer une sélection : `{ "kind": "cards", "ids": ["1", "2"] }` ; `kind` vaut `cards` ou `decks` |
| GET | `/api/admin/audit` | Les 400 dernières actions admin enregistrées, de la plus récente à la plus ancienne |
| PATCH | `/api/admin/settings` | Réglages : `message` (300 caractères maximum), `tone`, `registrationsOpen` (booléen) |

Aucune suppression n’est envoyée à MineCards. Le serveur protège le compte administrateur courant, les autres comptes administrateurs et les opérations réservées aux données des autres profils.

Les nouvelles actions d'accès, de révocation et de suppression groupée sont réservées aux comptes membres d'autres utilisateurs. La suppression groupée exige de 1 à 100 identifiants distincts existants, refuse les cartes importées et ne supprime rien si la sélection est devenue incohérente (`409`). Une suppression de favori retire son éventuelle mise en avant du profil.

Les résumés de compte exposent `displayName`, `suspended`, `suspensionReason`, `lastLoginAt`, `cardCount`, `copyCount`, `duplicateCount`, `favoriteDeckCount`, `sessionCount`, `connected`, `lastSync` et un état de synchronisation limité. Aucune clé, page provisoire ou empreinte de connexion n'est incluse. Les cartes uniques sont cumulées par profil, pas dédupliquées entre comptes.

Le journal contient date, action, administrateur, compte ciblé et détail limité à 300 caractères. Il couvre les mutations du panneau depuis cette version, sans reconstituer les actions historiques. Ce journal borné dans la même base n'est pas un registre immuable.

## Codes usuels

`400` données invalides · `401` connexion requise ou clé distante refusée · `403` droits / origine refusés · `404` absence · `409` conflit · `413` requête trop volumineuse · `429` limitation · `502` erreur distante · `503` stockage indisponible / occupé.

## Finitions et recycleur — mise à jour du 22 octobre 2026

La synchronisation conserve dans `_minecards` les champs standardQuantity, holographicQuantity et isSecret. quantity reste le stock total disponible, égal à la somme des deux finitions, hors réservations. La répartition est validée avant tout remplacement. Les finitions ne changent ni l'identifiant de base, ni la rareté, ni les statistiques. Les favoris correspondants reçoivent aussi ces métadonnées, sans modifier leurs anciennes attaques / défenses.

MYTHIQUE est une rareté acceptée pour le catalogue, la collection et les enchères. Les cartes secrètes sont absentes du catalogue et de ses détails, même pour leur propriétaire ; elles sont lisibles dans la collection personnelle ou une autre ressource autorisée. Elles sont toujours holographiques. Aucun paramètre distant finish non documenté n'est envoyé : les filtres de finition s'appliquent localement.

Les anciennes copies sans répartition sont inconnues et exclues des projections jusqu'à leur synchronisation. Le format privé des travaux passe à la version 3 pour ne pas réutiliser de pages anciennes sans finitions ; le protocole HTTP par étapes reste syncProtocol: 2.

L'état MineCards et les résumés admin renvoient editions : standardCopies, holographicCopies, holographicCards, recyclableCopies, potentialPoints, unknownCards, knownCards et mythicCards. Les totaux de finitions et potentiels comptent les seules lignes connues. Les doublons généraux restent max(quantity - 1, 0) ; les standard recyclables sont max(standardQuantity - 1, 0) pour une rareté éligible. potentialPoints n'est jamais un solde. L'overview admin comprend aussi les éditions cumulées dans editions.

Le modèle Boosters ajoute specialAvailable, specialNextAt et specialIntervalSeconds pour Éclipse. giftedStandard regroupe les boosters classiques bonus, dont ceux du recycleur, sans isoler leur origine. Les cartes de vitrine et d'enchères peuvent porter finish: STANDARD ou HOLOGRAPHIC ; ce champ est absent des cartes de base du catalogue et de la collection agrégée.

### Préparateur local

Barème lu sur le [recycleur officiel](https://minecards.vercel.app/recycleur) le 22 octobre 2026 : Charbon 1, Cuivre 2, Fer 5, Or 10, Diamant 25, Netherite 50 points ; 50 points donnent un booster classique de cinq cartes. Un original standard et toutes les holographiques sont conservés. Les cartes locales, secrètes ou sans finitions connues sont exclues.

Le plan est temporaire, limité à 100 cartes de base différentes, ajusté au stock et aux protections puis vidé au changement de compte. Le solde manuel facultatif est sauvegardé par compte via GET/PUT /api/recycler/wallet. GET renvoie {wallet:null} si inconnu, sinon {wallet:{balance,source:'manual',updatedAt}}. PUT reçoit {balance:entier} de 0 à 1 000 000 000 ou {balance:null} pour effacer ; la date est attribuée par le serveur. La route exige la session du propriétaire et ne transmet rien à MineCards. Le champ recyclerWallet est inclus dans /api/export. Le compteur utilise le solde enregistré ; une saisie non enregistrée ne change que la simulation. Les compteurs totaux précèdent les filtres et protections du plan : floor(potentialPoints/50) boosters, et floor((balance+potentialPoints)/50) avec le solde renseigné. Aucun appel de mutation, aucune suppression locale, aucun crédit réel de points ou booster n'est effectué. Le lien officiel permet de réaliser l'opération sur MineCards.
