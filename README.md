# RelaisZ – Évaluation du relais (EPS)

PWA hors-ligne pour iPad : chronométrage et notation du relais (80 m, zone de transmission 20 m).
N'EPS · by Quentin Delisle

## Déploiement (GitHub Pages)
1. Pousser le dossier à la racine du dépôt `RelaisZ`.
2. Settings → Pages → Branch `main` / `root`.
3. Sur l'iPad : ouvrir l'URL dans Safari → Partager → **Sur l'écran d'accueil**.
   Après la première ouverture, l'appli fonctionne sans réseau.

## Utilisation
1. **Classes** : importer un XLSX/CSV (« NOM Prénom » en A, ou Nom en A + Prénom en B).
2. **Passage** : toucher le démarreur puis le relayeur → écran chrono.
3. Chrono : Début → Entrée Zt → Fin Zt → Fin de course (top au toucher).
4. Évaluation : main de transmission (3 pts) → ne se retourne pas (3 pts) → vitesse Zt vs hors Zt calculée (4 / 3 / 0 pts).
5. **Résultats** : note /10 = somme des 4 passages ÷ 4 (passage manquant = 0 ; au-delà de 4, les 4 meilleurs). Export XLSX/CSV.

## Règles de calcul
- V Zt = Zt ÷ temps(Fin Zt − Entrée Zt)
- V hors Zt = (distance − Zt) ÷ (temps total − temps Zt)
- « Égale » si l'écart est dans la tolérance (3 % par défaut, réglable).
- Le score d'un passage est attribué au démarreur et au relayeur.

Mise à jour : incrémenter `CACHE` dans `sw.js` pour forcer le rafraîchissement sur l'iPad.
