# Contribuer

Utiliser Node.js 24.x, cloner le dépôt puis lancer `npm start`. Le serveur crée un stockage local vide ; aucun compte réel ni clé n’est fourni.

Les sources d’interface sont à la racine. `public/` est généré par `npm run build` et ne doit pas être modifié directement.

## Règles du projet

- Conserver l’isolation des comptes et les contrôles serveur des droits.
- Garder les decks à trois cartes distinctes.
- Utiliser `power` pour la puissance officielle des cartes synchronisées.
- Conserver l’attaque et la défense déjà enregistrées lors des synchronisations.
- Lire toute la pagination avant de remplacer la copie distante.
- Ne jamais commiter de compte réel, clé, cookie, `.env`, export Redis ou sauvegarde, ni les joindre à une issue.
- Ne pas écrire des données durables dans les fichiers d’une fonction Vercel.
- Ajouter tout nouvel asset à `scripts/build.js` et à la liste autorisée par `server.js`.

Décrire chaque changement, sa raison, les commandes exécutées et ses limites. Actualiser les documents concernés lorsqu’une route ou une règle métier change.

Le build contrôle la syntaxe et prépare les assets. Aucune suite de tests automatisés n’est fournie ; ne pas présenter le build comme une validation fonctionnelle complète.

Aucune licence de réutilisation n’a été choisie. Clarifier les droits avec le propriétaire avant d’ajouter une licence ou d’intégrer des ressources tierces.
