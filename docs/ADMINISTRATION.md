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

### Tableau de bord et recherches

Les huit indicateurs affichent profils, cartes uniques cumulées, exemplaires, doublons hors originaux, favoris, comptes connectés à MineCards, sessions actives et comptes suspendus. La date affichée indique l'instant de cette lecture ; le bouton **Actualiser le panneau** recharge les informations. Une carte détenue par deux profils compte une fois dans chacun des profils.

Les profils se filtrent par rôle, statut ou connexion MineCards, puis se trient par identifiant, nombre de cartes, doublons ou création. Le CSV des profils exporte les indicateurs de tous les comptes, sans clés API ni données d'authentification.

La collection d'un profil se parcourt par pages de 40 cartes et se filtre par recherche, origine et présence de doublons. Le CSV de collection utilise tous les résultats filtrés, pas seulement la page affichée. La recherche des decks porte sur le nom et les cartes du trio.

### Accès aux comptes membres

- **Suspendre** : indiquer un motif optionnel, confirmer ; toutes les sessions du membre sont révoquées et les nouvelles connexions sont bloquées. La collection et le mot de passe sont conservés.
- **Réactiver** : autorise une nouvelle connexion avec le mot de passe existant.
- **Déconnecter ses sessions** : ferme les sessions du membre sans suspendre son compte.
- Le compte courant et les comptes administrateurs sont protégés contre ces nouvelles actions.

La date de dernière connexion est renseignée à partir des connexions effectuées avec cette version. Les connexions historiques inconnues restent affichées comme inconnues.

### Suppressions groupées

Pour un compte membre, sélectionner les cartes locales ou les decks voulus, puis utiliser **Supprimer la sélection** et confirmer le nombre d'éléments. La sélection peut traverser plusieurs pages, avec une limite de 100 éléments. **Sélectionner les locales visibles** concerne uniquement la page affichée ; un second clic désélectionne cette même page.

Le serveur contrôle toute la sélection avant suppression. Les cartes MineCards sont protégées. Un changement de collection qui rend la sélection invalide annule l'opération. Supprimer un deck mis en avant retire aussi cette sélection du profil.

Lorsqu'une ancienne carte locale correspond aussi à une carte MineCards, retirer sa copie locale conserve l'entrée distante : elle reste visible comme carte gérée par MineCards.

### Journal et annonce du site

Le journal conserve les **400 dernières actions du panneau**, avec date, auteur, cible et détail. La recherche et le filtre d'action s'appliquent aussi à son export CSV. L'écran montre jusqu'à 100 résultats à la fois ; l'export comprend tous les résultats filtrés. Les actions antérieures à cette version ne sont pas disponibles. Le journal est conservé dans la même base et n'est pas immuable.

Le formulaire **Réglages du site** permet de publier une annonce de 300 caractères au maximum et d'ouvrir ou fermer les inscriptions. Une annonce vide la retire. Les utilisateurs connectés relisent l'annonce à leur chargement, au retour sur la fenêtre et chaque minute lorsqu'elle est visible. Fermer les inscriptions n'empêche pas les comptes existants de se connecter. Ces réglages sont partagés entre instances Vercel grâce au stockage Redis.

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
