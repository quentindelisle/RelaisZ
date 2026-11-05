# RelaisZ – Observation du relais (EPS)

PWA hors-ligne pour iPad : chronométrage du relais (80 m, zone de transmission 20 m), calcul de l'écart de vitesse dans la Zt et observation de critères qualitatifs. **Aucune note n'est calculée** : l'appli sert au bilan de classe.
N'EPS · by Quentin Delisle

## Déploiement (GitHub Pages)
1. Pousser le dossier à la racine du dépôt `RelaisZ`.
2. Settings → Pages → Branch `main` / `root`.
3. Sur chaque iPad : ouvrir l'URL dans Safari → Partager → **Sur l'écran d'accueil**.

## Utilisation
1. **Réglages** : donner un nom à la tablette (Tablette 1, 2…).
2. **Classes** : importer le fichier XLSX/CSV (Nom en A, Prénom en B) – le même sur chaque tablette.
3. **Groupe** : cocher les élèves qui passent sur cette tablette ; seules leurs tuiles s'affichent.
4. **Passage** : démarreur puis relayeur → chrono (Début, Entrée Zt, Fin Zt, Fin de course) ou **Passage raté**.
5. **Critères** (obligatoires, l'appli bloque tant qu'ils ne sont pas tous renseignés) :
   - Départ à un repère visuel
   - Signal sonore déclenche la transmission
   - Relayeur ne réaccélère pas après la transmission
   - Passage de main optimal
6. **Bilan** : % de Oui par critère, répartition des écarts de vitesse, tableau par élève, historique complet (passages ratés compris), export XLSX.

## Regrouper les tablettes
Chaque tablette : Bilan → *Envoyer mes passages* (AirDrop). Tablette du professeur : *Fusionner des passages reçus*. Les élèves sont reconnus par Nom + Prénom, les doublons sont ignorés.

## Calcul
- V Zt = Zt ÷ temps dans la Zt ; V hors Zt = (distance − Zt) ÷ (temps total − temps Zt)
- Écart = (V Zt − V hors Zt) ÷ V hors Zt

Mise à jour : incrémenter `CACHE` dans `sw.js`.
