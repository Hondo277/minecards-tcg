# Administration et sauvegardes

## Premier administrateur sur une installation neuve

Le dépôt ne contient aucun compte réel. L’inscription attribue le rôle `user`.

Pour une installation **locale dont tu es propriétaire** :

1. Démarrer avec `npm start` et créer son compte dans l’interface.
2. Arrêter le serveur.
3. Faire une copie privée de `data/accounts.json`.
4. Retrouver son compte par `username` dans ce fichier, puis remplacer uniquement sa valeur `"role": "user"` par `"role": "admin"`.
5. Enregistrer, relancer et se reconnecter.

Ne pas publier ce fichier dans Git ni modifier le sel ou l’empreinte du mot de passe. Une migration initiale vers Vercel conserve les rôles. Modifier la copie locale ne change pas un compte déjà hébergé dans Redis.

## Panneau admin

Le panneau consulte les profils, leur collection complète et leurs favoris. Il permet la recherche et la gestion des cartes locales / favoris des autres profils. Le compte courant et les autres administrateurs sont protégés contre la suppression de compte. Ces règles sont appliquées par le serveur.

Les cartes importées sont consultables mais gérées sur MineCards. Aucune suppression locale n’est envoyée au service distant.

## Sauvegarde locale

Arrêter le serveur puis sauvegarder `data/` dans un emplacement privé. Le dossier contient comptes, empreintes de mots de passe, profils, cartes, favoris, clés MineCards et éventuelles copies de récupération.

Pour restaurer : arrêter le serveur, conserver une copie de l’état actuel, remettre la sauvegarde dans `data/`, puis relancer. La sauvegarde doit correspondre au format attendu par le code.

## Sauvegarde Vercel / Upstash

La production conserve les données dans Redis, et non dans les fichiers de la fonction Vercel. Utiliser les outils de sauvegarde et d’export du fournisseur. Redéployer du code ne restaure ni ne remplace la base.

`npm run migrate:vercel` initialise seulement une base vide. Il utilise `SET ... NX` et refuse d’écraser une base existante ; ce n’est ni une commande de restauration ni une synchronisation continue entre installations.

## Dépannage

| Symptôme | Action |
| --- | --- |
| Nouveau compte sans carte | Connecter sa propre clé MineCards puis synchroniser |
| Administration absente | Vérifier le rôle et se reconnecter ; voir l’initialisation locale |
| Clé refusée | Vérifier la clé chez le fournisseur, puis la remplacer dans Gérer la connexion |
| `429` ou quota atteint | Attendre le délai indiqué et éviter les synchronisations concurrentes |
| `503` pendant une synchronisation | Réessayer lorsque l’opération en cours est terminée |
| Vercel demande le stockage | Vérifier les variables privées et redéployer après configuration |
| Vercel demande l’import des comptes | Initialiser la base selon VERCEL.md |
| Comptes locaux différents du site en ligne | Les stockages sont indépendants après le transfert initial |
| Interface ancienne | Actualiser complètement la page et vérifier la version déployée |
