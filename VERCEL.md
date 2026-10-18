# Déployer MineCards sur Vercel

## 1. Stockage persistant

Créer une base **Upstash Redis** dans le Marketplace du projet Vercel et récupérer ses variables privées :

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- Ajouter `MINECARDS_STORAGE_PREFIX=minecards:production` en Production.

L’intégration Marketplace peut fournir `KV_REST_API_URL` et `KV_REST_API_TOKEN` à la place : ces noms sont également acceptés par le serveur et la migration.

Pour Preview, utiliser une autre base ou `MINECARDS_STORAGE_PREFIX=minecards:preview`. Chaque préfixe doit être initialisé séparément. Ne jamais partager les données de production avec un déploiement de test accessible publiquement.

Ces valeurs restent côté serveur. Ne pas ajouter de préfixe `NEXT_PUBLIC_` et ne pas envoyer les fichiers `.env` ou `data/` sur GitHub ou Vercel. Une configuration absente ou une base non initialisée renvoie une erreur explicite ; le site ne crée pas de base temporaire qui perdrait les comptes.

## 2. Transférer les comptes actuels

Fermer temporairement le site local pendant le transfert pour figer sa copie. La sauvegarde et les données locales restent dans `data/`.

Sur le PC, copier `.env.example` vers `.env.vercel.local` et renseigner les trois variables de Production. Puis, avec Node.js 24 :

```powershell
npm run migrate:vercel
```

Le transfert inclut les identifiants, les mots de passe déjà hachés, les rôles (dont l’administrateur existant), les profils, les cartes, les favoris, la collection synchronisée et les clés MineCards privées. Il n’affiche aucun secret et refuse d’écraser une base distante existante. Les sessions ne sont pas transférées : se reconnecter après le déploiement. Les deux installations ont ensuite des sauvegardes indépendantes ; les changements locaux ultérieurs ne sont pas transférés automatiquement.

## 3. Déployer

Importer le dépôt dans Vercel (ou déployer le dossier avec Vercel CLI).

- Framework : **Other**.
- Node.js : **24.x**.
- Build : `npm run build`.
- Output : `public`.
- Les routes et la durée de fonction sont configurées dans `vercel.json`.

Le dossier public contient uniquement `index.html`, `theme.css`, `minecards-ui.js`, `profile-media.js`, `profile-showcase.js`, `arena-rules.js` et `arena-builder.js`. La fonction `api/index.js` traite les routes `/api/*`. Les fichiers `data/` sont exclus du déploiement. Les sessions sont persistantes et les cookies utilisent HTTPS en production.

## Fonctionnement et limites

Les données privées sont stockées dans un document Redis. Les requêtes sont sérialisées par un verrou distribué ; la validation atomique du document précède toute réponse de réussite. Ce modèle convient à cette application personnelle et évite les écrasements entre instances. Lors d’une longue synchronisation, une autre opération peut demander de réessayer quelques secondes plus tard. Pour un site avec beaucoup d’utilisateurs simultanés, migrer vers des enregistrements individuels dans une base relationnelle.

Sur Vercel, la synchronisation MineCards est attendue dans la requête HTTP, au lieu de lancer une tâche en mémoire après la réponse. Le budget applicatif est de 200 secondes pour la lecture paginée, avec un délai réseau maximum de 20 secondes par appel ; la fonction dispose de 240 secondes. Une lecture incomplète conserve la collection précédente.

Le corps des requêtes de l’application est limité à 4 Mio pour rester sous la limite de transport Vercel. Les quotas et limites de taille du stockage Upstash choisi s’appliquent aussi. Configurer les sauvegardes du fournisseur pour protéger la copie distante.

Le lancement local reste `npm start` avec le stockage privé dans `data/`. Les variables de migration sont chargées uniquement par la commande de migration.

Références : [Vercel Functions](https://vercel.com/docs/functions), [API REST Upstash](https://upstash.com/docs/redis/features/restapi).
