# L'atlas des soins

La carte des établissements de santé, sociaux et médico-sociaux de France, avec une fiche pour chacun : identité, autorisations, activité, certification, satisfaction des patients.

Tout vient de données publiques. Le site est fait de fichiers statiques : pas de serveur, pas de compte, pas de cookie.

## Ce qu'on y trouve

- **La carte** : environ 105 000 établissements en activité, Hexagone et outre-mer. De loin, un compteur par département ; de près, un point par établissement, coloré selon sa famille (hôpitaux publics, cliniques, psychiatrie, centres de santé, laboratoires, pharmacies, personnes âgées, handicap, social).
- **La recherche** : un hôpital ou une clinique par son nom ou sa commune, dans toute la France.
- **La fiche** : adresse, téléphone, entité juridique, groupement hospitalier de territoire, activités de soins exercées, chaque autorisation avec ce qu'elle couvre et sa période, structures rattachées, établissements de soins voisins.
- **L'activité et la qualité**, pour les établissements de soins : lits, places et séjours, maternité, décision de certification, notes de satisfaction des patients et indicateurs de qualité, comparés à la moyenne nationale.
- **Un lien par établissement** : l'adresse de la page change quand une fiche s'ouvre, et se partage telle quelle.

## D'où viennent les données

| Donnée | Source | Licence |
|---|---|---|
| Établissements, autorisations, positions | Répertoire FINESS, Agence du numérique en santé, converti chaque mois par [referentiels-sante](https://github.com/Irreductix/referentiels-sante) | Licence Ouverte 2.0 |
| Activité, certification, satisfaction, indicateurs | Base sur la qualité et la sécurité des soins, Haute Autorité de santé | Licence Ouverte 2.0 |
| Fond de carte | Plan IGN, Institut national de l'information géographique et forestière | Licence Ouverte 2.0 |

L'atlas recopie ces sources sans les corriger. Une erreur vue sur une fiche vient presque toujours du répertoire : c'est à l'établissement ou à son agence régionale de santé de la faire rectifier.

## Limites connues

- Environ 200 établissements n'ont aucune position dans le répertoire : ils n'apparaissent pas sur la carte.
- Quand le répertoire ne donne que des coordonnées planes, la latitude et la longitude sont calculées ; la fiche le signale.
- La Polynésie française et la Nouvelle-Calédonie ne figurent pas dans FINESS.
- Les noms sont écrits en capitales sans accents dans le répertoire ; l'atlas remet les minuscules mais pas les accents.
- La recherche nationale porte sur les établissements de soins. Les pharmacies, laboratoires et structures sociales se cherchent une fois leur département affiché.
- Les indicateurs retenus sont un choix parmi ceux de la Haute Autorité de santé. Une note ne résume pas un établissement.

## Faire tourner l'atlas chez soi

Il faut Node.js 22 ou plus récent. Aucune dépendance à installer.

```
npx referentiels-sante finess --mensuel --activites --sans-jsonl --sans-historique --sortie sources/finess
curl -L -o sources/valeurs.csv https://minio.data.has-sante.fr/bqss/prod/valeurs.csv
node scripts/construire.mjs --finess sources/finess --has sources/valeurs.csv --sortie site/donnees
```

La construction prend environ une minute et écrit `site/donnees/`. Il reste à servir le dossier `site/` avec n'importe quel serveur de fichiers, par exemple `npx serve site`. L'option `--has` est facultative : sans elle, les fiches n'ont pas la rubrique d'activité et de qualité.

```
npm test
```

## Comment c'est fait

```
scripts/construire.mjs   lit les sources et écrit les fichiers de données
src/finess.mjs           établissements, activités de soins, autorisations
src/has.mjs              certification, satisfaction, indicateurs, activité
src/familles.mjs         familles d'établissements affichées sur la carte
site/                    la page : index.html, atlas.js, outils.js, style.css
site/vendor/leaflet/     la bibliothèque de cartographie Leaflet (licence BSD)
tests/                   tests de la construction et des fonctions de la page
```

Les données sont découpées pour que le navigateur ne charge que ce qu'il regarde :

- `france.json` : les départements, leur emprise et leurs compteurs ;
- `departements/<code>.json` : les établissements d'un département, chargé quand il entre dans la vue ;
- `fiches/<code>/<finess>.json` : le détail d'un établissement, chargé à l'ouverture de sa fiche ;
- `recherche.json` : les établissements de soins de toute la France, chargé à la première recherche.

Le site est reconstruit et publié par GitHub Actions à chaque modification et le 3 de chaque mois.

## Participer

Une donnée mal présentée, une rubrique qui manque, un indicateur à ajouter : ouvrez un ticket ou écrivez à contact@irreductix.fr. Les familles d'établissements (`src/familles.mjs`) et le choix des indicateurs (`src/has.mjs`) sont les deux endroits les plus simples pour commencer.

## Licence

Code sous licence MIT. Les données restent celles de leurs producteurs, sous leurs licences.

Un outil libre du collectif [Irréductix](https://irreductix.fr).
