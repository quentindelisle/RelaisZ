# Zones Relais (RelaisZ) – N'EPS · v4

PWA hors-ligne pour iPad – Académie de Nantes · N'EPS by Quentin Delisle
Échanges entre tablettes : module QR du **Kit N'EPS v1.3.1** (Base45 + compression, série de QR qui défile, lecture native / ZXing / jsQR, secours « Photo du QR », partage en fichier).

## Interface prof / élève
Premier lancement : *Tablette enseignant* ou *Tablette élève*. Bascule 🧒 Élève / 🧑‍🏫 Prof en haut à droite (code enseignant 0000 par défaut, modifiable, transmis aux tablettes).

## Déroulé
0. **Prof – Préparer** : importer la classe (Nom A, Prénom B, Sexe C), régler distance (100 m ; 80 m = extrapolé), Zt 20 m, récupération, **critères observables** (ajouter, renommer, supprimer, ordonner), code enseignant.
1. **Prof → élèves : 📤 Envoyer la séance** (QR). Chaque tablette élève : 📷 Recevoir la séance, choisit ses élèves, chronomètre les 50 m (2 couloirs, 1 départ, 2 arrivées), puis 📤 Envoyer mes résultats.
   **Prof : 📥 Récupérer les 50 m** (caméra allumée, on enchaîne les tablettes ; doublons ignorés).
2. **Prof : 👥 Faire les groupes** (homogènes selon les points de vitesse, hétérogènes, aléatoires, mixité F/G, déplacement manuel) puis 📤 Envoyer les groupes. Chaque tablette élève rescanne et choisit son groupe ; les meilleurs 50 m de toute la classe arrivent avec (cible).
3. **Relais à deux** sur les tablettes élèves (cible, IT, étoiles, Zt, critères bloquants, récupération 3:30), puis 📤 Envoyer → **Prof : 📥 Récupérer les relais** → 📊 Bilan chiffré /12 + export XLSX.

## Barème /12
Vitesse individuelle /3 (meilleur 50 m, F/G) · vitesse collective /3 (meilleur relais ramené à 100 m, F/G) · efficacité technique /6 (étoiles des 4 meilleures courses, extrapolées si 2–3 courses ; niveau dans le degré selon les critères, modifiable ; 6 seulement avec 16 ★ réelles).

Mise à jour : incrémenter `CACHE` dans `sw.js`.
