# Préparer une équipe pour les arènes

## Sources et observation

Analyse réalisée le **18 octobre 2026** à partir de la [page officielle des arènes](https://minecards.vercel.app/arenes), de son sélecteur d’équipe et des ressources publiques qu’elle charge. La connexion du propriétaire a uniquement servi à lire l’interface ; aucune défense n’a été enregistrée, aucun défi lancé et aucune récompense réclamée. Les [données de l’API publique](https://minecards.vercel.app/developpeurs) complètent cette lecture.

La page des arènes utilise désormais un **combat tactique**. Le guide général contient encore une présentation plus ancienne : les règles du sélecteur et de la page d’arène ont été privilégiées. Additionner les puissances ne suffit plus pour déterminer un résultat.

## Contraintes appliquées

| Élément | Règle observée |
| --- | --- |
| Combattants | Trois créatures différentes |
| Soutiens | Zéro, un ou deux, dans les autres catégories |
| Stock | Cartes disponibles, actives et classées par rareté |
| Budget | 18 points communs aux créatures et soutiens |
| Ordre | La créature n° 1 démarre active ; les autres sont en réserve |
| Soutiens en combat | Un usage par carte, sans perte de l’exemplaire |
| Fin de combat | Limite de 30 tours ; comparaison de la somme des pourcentages de vie restants ; égalité favorable au champion |

Le coût par carte est de 2 / 3 / 4 / 5 / 6 / 7 points pour Charbon / Cuivre / Fer / Or / Diamant / Netherite. Chaque identifiant stable ne peut apparaître qu’une fois dans une composition.

L’éligibilité en arène est distincte de celle du mode classique : le sélecteur tactique officiel écarte les cartes inactives ou sans rareté, même si elles restent présentes dans le catalogue. Une première synchronisation après cette mise à jour est nécessaire pour charger les attributs supplémentaires.

## Statistiques adaptées au combat

Le module `arena-rules.js` est commun au navigateur et à la validation serveur. Il recalcule les statistiques tactiques à partir des attributs officiels de la carte conservés dans `_minecards` ; les anciennes valeurs locales d’attaque et de défense ne sont pas modifiées.

Les attributs officiels d’attaque et de défense sont bornés entre 0 et 160 pour ce calcul. En notant `r = coût − 2` :

- PV : arrondi de `76 + 0,23 × défense + 3 × r`, avec 16 PV supplémentaires pour un protecteur.
- Attaque : arrondi de `22 + 0,11 × attaque + r`, avec 4 points supplémentaires pour un attaquant.
- Armure : arrondi de `2 + 0,035 × défense`, avec 3 points supplémentaires pour un protecteur.

La page répartit les créatures entre attaquant, protecteur, soigneur et perturbateur à partir de leur identité. Le module reproduit cette classification et les catégories d’effets de soutien constatées. Les capacités coûtent 2 énergie et ont 2 tours de récupération. Le Creeper possède une capacité spécifique.

### Postures

| Posture | Dégâts directs infligés | Dégâts directs reçus |
| --- | --- | --- |
| Équilibrée | × 1 | × 1 |
| Agressive | × 1,20 | × 1,15 |
| Prudente | × 0,85 | × 0,80 |

Une posture peut changer à chaque tour sans coût. Ces multiplicateurs ne changent pas les soins, la brûlure ou le recul. L’initiative alterne entre les équipes.

### Terrains

Tous les trois tours, l’Overworld rend 6 PV à la réserve vivante la plus blessée, ou au combattant actif sans réserve. Le Nether brûle pendant deux tours les combattants actifs qui ne viennent pas du Nether (6 dégâts par tour). L’End rend le changement de créature gratuit en énergie pour le tour concerné.

## Propositions et limites

La proposition automatique recherche des trios dans le budget et des soutiens avec les points restants. Son score est une **heuristique propre à cette application**, fondée sur les statistiques adaptées, la complémentarité des rôles, le style choisi et l’effet du terrain. Il ne s’agit pas du moteur de combat officiel, ni d’une estimation de probabilité de victoire. La recherche retient au plus trois représentants par coût / rôle / dimension puis 120 créatures pour limiter le temps de calcul.

Le joueur peut changer toutes les cartes, l’ordre de départ, les soutiens et la posture. L’équipe et ses paramètres sont sauvegardés comme favori. Le serveur reconstruit une nouvelle composition à partir du stock importé et vérifie son budget : les attributs envoyés par le navigateur ne font pas autorité.

L’API v1.1.0 publie les champions et une défense avec ses statistiques enregistrées. Elle ne fournit ni leur posture tactique ni leurs soutiens. La vue adverse affiche donc des **informations de référence** pouvant différer de l’équipe actuelle visible sur le jeu. Les contraintes de conquête, protections, délais de revanche et récompenses ne sont pas supposées disponibles par cette API. Leur statut doit être consulté sur MineCards.

Le préparateur conserve les appels distants en lecture seule. Pour jouer ou installer une défense, la composition peut être copiée puis reproduite dans MineCards. Aucune session navigateur ni donnée personnelle du compte source n’est intégrée au code publié.

Ces règles peuvent évoluer sans changement de version de l’API : réexaminer la page des arènes avant de mettre à jour le module.

## Finitions et rareté Mythique

La finition holographique est cosmétique : elle ne modifie ni la puissance, ni l'attaque, ni la défense, et ne permet pas d'utiliser deux fois la même carte de base. Les cartes Mythiques sont prises en charge dans la collection et les trios de puissance. Leur coût tactique n'étant pas documenté par l'API en lecture seule consultée le 22 octobre 2026, aucun coût n'est inventé pour le préparateur d'arène : les raretés sans coût validé restent exclues de ses recommandations.
