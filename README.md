# Zones Relais (RelaisZ) – N'EPS · v4

PWA hors-ligne pour iPad – Académie de Nantes · N'EPS by Quentin Delisle
Échanges entre tablettes : module QR du **Kit N'EPS v1.3.1** (Base45 + compression, série de QR qui défile, lecture native / ZXing / jsQR, secours « Photo du QR », partage en fichier).

## Interface prof / élève
Premier lancement : *Tablette enseignant* ou *Tablette élève*. Bascule 🧒 Élève / 🧑‍🏫 Prof en haut à droite (code enseignant 0000 par défaut, modifiable, transmis aux tablettes).

## Déroulé
0. **Prof – Préparer** : importer la classe (Nom A, Prénom B, Sexe D), régler distance (100 m ; 80 m = extrapolé), Zt 20 m, récupération, **critères observables** (ajouter, renommer, supprimer, ordonner), code enseignant.
1. **Prof → élèves : 📤 Envoyer la séance** (QR). Chaque tablette élève : 📷 Recevoir la séance, choisit ses élèves, chronomètre les 50 m (2 couloirs, 1 départ, 2 arrivées), puis 📤 Envoyer mes résultats.
   **Prof : 📥 Récupérer les 50 m** (caméra allumée, on enchaîne les tablettes ; doublons ignorés).
2. **Prof : 👥 Faire les groupes** (homogènes selon les points de vitesse, hétérogènes, aléatoires, mixité F/G, déplacement manuel) puis 📤 Envoyer les groupes. Chaque tablette élève rescanne et choisit son groupe ; les meilleurs 50 m de toute la classe arrivent avec (cible).
3. **Relais à deux** sur les tablettes élèves (cible, IT, étoiles, Zt, critères bloquants, récupération 3:30), puis 📤 Envoyer → **Prof : 📥 Récupérer les relais** → 📊 Bilan chiffré /12 + export XLSX.

## Barème /12
Vitesse individuelle /3 (meilleur 50 m, F/G) · vitesse collective /3 (meilleur relais ramené à 100 m, F/G) · efficacité technique /6 (étoiles des 4 meilleures courses, extrapolées si 2–3 courses ; niveau dans le degré selon les critères, modifiable ; 6 seulement avec 16 ★ réelles).

Mise à jour : incrémenter `CACHE` dans `sw.js`.

## Leçon Travail de groupe (v4.4)
- **Prof** : 🧩 Constituer les groupes (3 ou 4) par cliquer-glisser (ou proposition automatique : niveaux proches / mélangés), puis 📤 Envoyer.
- **Tablette élève** : ③ Travail de groupe → choix du groupe → tous les binômes possibles (6 à 3, 12 à 4), chaque élève démarreur ET relayeur ; binôme conseillé (le moins de passages, les plus reposés).
- Objectifs : battre la cible (50 m D + 50 m R − 0,3 s), maximum d'étoiles, caractéristiques stables.
- À chaque passage : main du donneur, main du receveur, montante / descendante, repère (pieds), moment dans la zone — reprises du passage précédent du binôme, « ⚠ modifié » si changement ; obligatoires.
- Bilan : filtre Leçon, tableau par groupe et par binôme (cible battue, meilleur IT, étoiles, caractéristiques habituelles, constance %), feuille Excel « Travail de groupe ».

## v5.1 – Évaluation : zone de transmission et note EPS
- **Tablette élève : ④ Évaluation** (groupes cochés) → démarreur + relayeur → chrono 4 tops (Début · Entrée Zt · Fin Zt · Fin) ; pas de critères ni de vidéo. Envoi au prof par QR comme d'habitude.
- Prof : saisie tapée / Départ-Arrivée toujours possible (sans temps de zone) + bouton « Chrono avec zone (4 tops) ».
- Points Zt par passage (écart de vitesse dans la zone) : > 0 % = 4 · ≥ −8 % = 3 · ≥ −15 % = 2 · ≥ −20 % = 1 · sinon 0 (raté = 0).
- **Note Bac /12** = barème officiel. **Zt /8** = moyenne des points Zt des 4 passages retenus pour l'IT × 2. **Note EPS /12** = (Bac + Zt) × 12 / 20.

## v5.2 – Couleurs de groupe et fiche PDF
- Chaque groupe a une couleur (Rouge, Bleu, Vert, Jaune…) : touchez la pastille dans « Groupes » pour la changer ; transmise aux tablettes avec la séance.
- Fiche PDF d'évaluation : bandeau et bord de page à la couleur du groupe, cases à cocher par coureur, **tous les binômes possibles** (ordre qui évite d'enchaîner deux passages) avec leur **cible**, colonnes Chrono / 2e essai / Étoiles, quelques lignes libres.

## v5.3 – Accès co-évaluateur
- Nouveau rôle **📋 Co-évaluateur** (écran de départ ou bascule en haut : Élève / Co-éval. / Prof).
- Co-évaluateur : 📷 Recevoir la séance → cocher les groupes évalués → ✍️ Saisir les passages : toucher le démarreur puis le relayeur, taper le temps lu au chronomètre (Entrée = enregistrer, ✗ = raté). Pas de chrono intégré. → 📤 Envoyer mes saisies au prof (QR).
- Prof : Leçon d'évaluation → 📥 Récupérer les saisies (co-évaluateurs, tablettes) ; les passages s'ajoutent aux groupes et aux notes.
- Fiche PDF : avertit si des 50 m manquent (cibles incomplètes) et propose de les saisir avant d'imprimer.

## v5.3.1 – Note Bac protégée
- Les passages d'évaluation chronométrés sur les **tablettes élèves** (4 tops) ne servent qu'à la zone de transmission (Zt /8 → note EPS) dès qu'un élève a des temps relevés par le prof ou un co-évaluateur. La note Bac ne dépend que de ces temps officiels, quel que soit l'ordre d'import.
- Zt : pour chacun des 4 passages retenus, on prend le même passage mesuré par une tablette élève (même binôme, à ±5 min) ; sinon, les 4 meilleurs passages élèves.
- Si un élève n'a QUE des temps de tablettes élèves, ils servent aussi à la note Bac (signalé « temps tablettes élèves »).
