# MineCards TCG

Gestionnaire de collection Minecraft TCG avec comptes privés, synchronisation MineCards, création de decks et profils personnalisés.

**[Ouvrir le site](https://minecards-tcg.vercel.app)** · **[Déploiement Vercel](VERCEL.md)** · **[Architecture](docs/ARCHITECTURE.md)** · **[API du serveur](docs/API.md)**

## Présentation

MineCards TCG permet de retrouver sa collection, composer un trio adapté à une puissance cible et mettre en valeur ses meilleurs decks. L’application fonctionne sur un serveur local Node.js ou sur Vercel avec Upstash Redis.

Ce dépôt contient le code et la documentation. Les comptes réels, mots de passe hachés, collections privées, clés API et sauvegardes ne sont pas publiés.

## Fonctionnalités

### Collection

- Affichage en grille ou en liste, recherche, filtres de rareté et classements.
- Puissance, attaque, défense et image de chaque carte.
- Quantité disponible pour les cartes synchronisées depuis MineCards.
- Fusion des cartes locales historiques et des cartes importées, sans compter deux fois les correspondances reconnues.
- Un nouveau compte démarre sans carte ni deck favori.

### Créateur de decks

- Recherche d’un trio dont la puissance totale est la plus proche de la cible saisie.
- Exactement **trois cartes différentes** : aucun doublon dans un deck, même si plusieurs exemplaires sont possédés.
- Affichage de la puissance obtenue et de l’écart avec la cible.
- Enregistrement, consultation et suppression des decks favoris.
- Ouverture du trio le plus puissant dans l’atelier depuis le profil.

### Profil du collectionneur

- Connexion par **identifiant et mot de passe, sans email**.
- Nom affiché, présentation, huit avatars et quatre couleurs au choix.
- Photo de profil et bannière JPG, PNG ou WebP, recadrées et compressées dans le navigateur puis validées par le serveur.
- Statistiques : cartes uniques, exemplaires, doublons, favoris, raretés et puissance maximale d’un trio.
- Deck favori à mettre en avant, cartes les plus rares et répartition par rareté.
- Modification du mot de passe avec vérification de l’ancien, renouvellement de la session et déconnexion des autres sessions.

### Administration

- Accès réservé aux comptes ayant le rôle `admin`.
- Liste des profils et compteurs incluant les cartes synchronisées.
- Consultation des collections et favoris, recherche par nom, rareté ou puissance.
- Suppression des cartes locales et favoris des autres profils, et suppression d’un compte membre après confirmation.
- Protection du compte courant et des autres administrateurs contre la suppression depuis le panneau.
- Les cartes importées restent gérées sur MineCards : l’API distante est en lecture seule.

### Interface

- Thème bleu nuit, corail et lavande, adapté aux petits écrans.
- Barre latérale complète ou réduite aux icônes, avec choix mémorisé dans le navigateur.
- Accès au profil en haut à droite.
- Animation de la barre par masquage progressif et déplacement des éléments visibles ; noms des onglets accessibles par infobulle.

## Démarrer en local

Prérequis : **Node.js 24.x** et Git pour cloner le dépôt. Le serveur n’a aucune dépendance npm à installer.

```bash
git clone https://github.com/Hondo277/minecards-tcg.git
cd minecards-tcg
npm start
```

Ouvrir **http://127.0.0.1:3000**. Sous Windows, `Lancer.cmd` démarre aussi le serveur et ouvre le navigateur.

1. Créer un compte depuis l’écran de connexion.
2. Choisir un identifiant de 3 à 24 caractères : lettres sans accent, chiffres et `_`.
3. Choisir un mot de passe de 10 à 128 caractères.
4. Ouvrir **MineCards connecté → Gérer la connexion**, puis renseigner sa propre clé API.
5. Lancer la synchronisation pour importer sa collection.

Le serveur local écoute uniquement sur `127.0.0.1`. Le port est `3000` par défaut et peut être configuré avec `PORT`.

Pour configurer le premier administrateur sur une installation neuve, voir [Administration](docs/ADMINISTRATION.md).

## Intégration MineCards

L’intégration implémente le schéma **1.1.0** et utilise les routes `/api/v1/` du service : [documentation du fournisseur](https://minecards.vercel.app/developpeurs), [OpenAPI](https://minecards.vercel.app/openapi.json).

La synchronisation va de **MineCards vers cette application**. Les achats, échanges, ouvertures de boosters et modifications du compte distant ne sont pas envoyés par cette API.

- Toutes les pages sont lues avant de remplacer la copie distante ; un échec conserve la précédente.
- La puissance vient du champ officiel `power`. L’attaque et la défense déjà enregistrées sont conservées.
- Les images et puissances des cartes correspondantes dans les favoris sont actualisées, puis les totaux recalculés.
- Les quantités correspondent aux exemplaires disponibles retournés par l’API, hors exemplaires réservés.
- Actualisation automatique proposée toutes les deux minutes lorsque la page est visible et hors saisie ou édition.
- Lectures espacées de 1,1 seconde, sans cache de réponse conformément à `no-store`. Respect de `Retry-After` et du quota restant / instant de réinitialisation communiqués par MineCards.
- La déconnexion de la clé conserve la dernière collection importée.

L’explorateur consulte le catalogue, sa collection, les boosters, les profils publics, les arènes, les enchères et le classement, avec filtres, pagination et JSON complet. Les arènes montrent les statistiques enregistrées de leur défense, qui peuvent différer du catalogue actuel.

## Stockage et comptes

| Environnement | Comptes et collections | Sessions | Connexions MineCards |
| --- | --- | --- | --- |
| Local | `data/accounts.json` | Mémoire du serveur | `data/minecards-connections.json` |
| Vercel | Document privé Upstash Redis | Stockage persistant | Même document privé Redis |

Les mots de passe sont hachés avec `scrypt` et un sel individuel. Les cookies sont `HttpOnly`, `SameSite=Strict` et `Secure` sur Vercel. Les routes vérifient le compte connecté et les droits administrateur.

En local, redémarrer le serveur termine les sessions. Sur Vercel, elles persistent dans Redis, avec une durée maximale de sept jours. Sans email associé, il n’existe pas de récupération automatique de mot de passe.

Les images du profil sont conservées dans le compte sous forme de données encodées. Le fichier d’entrée est limité à 10 Mio ; après compression, la photo est limitée à 80 Kio et la bannière à 180 Kio. Voir [Architecture](docs/ARCHITECTURE.md).

## Déployer sur Vercel

Suivre [VERCEL.md](VERCEL.md) pour créer un stockage Upstash, configurer les variables privées, transférer une base locale et publier.

| Réglage | Valeur |
| --- | --- |
| Framework | Other |
| Node.js | 24.x |
| Build | `npm run build` |
| Sortie | `public` |
| Point d’entrée API | `api/index.js` |
| Durée maximale de fonction | 240 secondes |

Variables serveur :

```dotenv
UPSTASH_REDIS_REST_URL=https://YOUR-DATABASE.upstash.io
UPSTASH_REDIS_REST_TOKEN=YOUR-PRIVATE-TOKEN
MINECARDS_STORAGE_PREFIX=minecards:production
```

Les noms `KV_REST_API_URL` et `KV_REST_API_TOKEN` injectés par le Marketplace sont aussi acceptés. [`.env.example`](.env.example) ne contient aucune valeur réelle. Les copies locale et Vercel sont indépendantes : publier du code ne transfère pas les comptes.

**GitHub Pages seul ne peut pas exécuter le site complet** : les comptes, sessions et synchronisations nécessitent Node.js ou la fonction Vercel. Le site hébergé reste accessible sur Vercel.

## Fichiers du projet

```text
api/index.js                  Point d’entrée Vercel
index.html                    Interface, collection, atelier, favoris, administration
theme.css                     Thème, responsive et barre latérale
server.js                     Serveur HTTP, comptes, profils, routes admin
storage.js                    Stockage et transactions Redis
minecards.js                  Passerelle privée et synchronisation
minecards-ui.js               Connexion et explorateur MineCards
profile-media.js              Import, compression et aperçu des images
profile-showcase.js           Statistiques et vitrine du profil
scripts/build.js              Préparation des seuls fichiers publics
scripts/migrate-vercel.js     Import initial privé vers Redis, sans écrasement
docs/                         Documentation technique et guides
VERCEL.md                     Déploiement et migration
```

Le serveur crée `data/` au premier démarrage local. `public/` est généré par le build ; ces dossiers ne font pas partie du code publié.

## Commandes

| Commande | Usage |
| --- | --- |
| `npm start` | Démarrer le serveur local |
| `npm run build` | Contrôler la syntaxe JS et préparer les cinq fichiers publics |
| `npm run migrate:vercel` | Importer les comptes locaux dans Redis vide, avec `.env.vercel.local` |

Le build contrôle la syntaxe des scripts externes et embarqués ; ce n’est pas une suite de tests fonctionnels. Aucune suite automatisée n’est actuellement fournie.

## Documentation

- [Architecture et limites](docs/ARCHITECTURE.md)
- [Routes du serveur](docs/API.md)
- [Administrateur et sauvegardes](docs/ADMINISTRATION.md)
- [Déploiement Vercel](VERCEL.md)
- [Contribuer](CONTRIBUTING.md)

Le serveur utilise HTTP natif Node.js. Tailwind CSS, Font Awesome et les polices Google sont chargés depuis leurs CDN. Les images de cartes viennent de l’API ou des données des utilisateurs ; le dépôt n’inclut pas les données des comptes réels.

## Licence

Aucune licence de réutilisation du code n’a été choisie pour le moment. Les services et ressources tiers restent soumis à leurs propres conditions.
