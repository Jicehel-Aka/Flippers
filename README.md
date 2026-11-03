# Gamebuino AKA Pinball (Web · PC · Firmware ESP32 AKA)

Jeu de flipper arcade néo-pixel conçu sur mesure pour la console **Gamebuino AKA** tenue **tournée de 90° vers la droite** (`240 × 320 px` en mode portrait), accompagné d'un simulateur interactif **Web / PC (Windows, Linux, macOS)** et d'un **firmware ESP-IDF pour la console** *(voir « Firmware Gamebuino AKA »)*.

---

## Points clés & Architecture de jeu

- **Orientation verticale native 90° droite (`240 × 320 px`)**
  - Le bandeau gauche de l'écran paysage (`46 px`) devient un **afficheur matriciel supérieur fixe (`240 × 46 px`)** affichant le score, le joueur actif, la bille, la mission en cours et l'état du Multibille.
  - La fenêtre de jeu active (`240 × 274 px`) parcourt un **plateau équilibré de `240 × 520 px`** (~1,9 écran de hauteur), sans couloirs piégeurs grâce aux caissons latéraux biseautés à 45° et aux couloirs élargis (`18 px`).
- **Arrivée en vue d'ensemble & Caméra « Bille la plus basse »**
  - À l'arrivée sur une table, la caméra dézoome (`OVERVIEW_ZOOM`) pour dévoiler **100 % du plateau `240 × 520 px`**, puis zoome progressivement sur le lanceur et les flippers.
  - En jeu et durant le **Multibille ×3**, le scrolling suit **systématiquement la bille active la plus basse** afin de garantir la défense aux flippers, tout en affichant des repères radar `▲` en haut d'écran pour les billes situées sur le plateau supérieur.
- **Multibille physique ×3 & Système de Missions**
  - Verrouillez **2 billes** dans le puits `LOCK` pour libérer **3 billes simultanées** sur le plateau.
  - Chaque flipper intègre **3 missions scénarisées** (suivies par le médaillon central à 3 gemmes) menant à la **Finale Maître (`+100 000 pts` + Multibille ×3)**.
- **1 à 4 joueurs en local** au tour par tour *(version Web / PC)*, synthèse audio arcade temps réel (WebAudio sur PC/Web, PWM sur ESP32) et support manette Gamepad API *(Web / PC)*.
- **Physique à pas fixe** : 720 Hz sur Web/PC, 360 Hz sur le firmware. Les trajectoires ne dépendent pas de la fréquence d'affichage.
- **Pause automatique** quand la fenêtre Web/PC perd le focus. *Recommencer* et *Quitter au menu* demandent une **confirmation en deux appuis** (2,5 s).

---

## Les 11 plateaux aux dispositions uniques

| Plateau | Architecture physique | Rampes 3D | Missions dédiées |
| :--- | :--- | :--- | :--- |
| **1. Gamebuino AKA · ESP32** | **4 flippers** (paire basse + 2 mini-flippers cyber-deck symétriques à `y=174`), grappe asymétrique de 3 engrenages en haut à gauche + cœur Wi-Fi central | Rampe moulée bleue **Bus SPI** + rail métallique **Antenne Wi-Fi** | *Init Bus SPI*, *Overclock 240 MHz*, *Flash Firmware OTA* |
| **2. Odyssée Spatiale** | **3 flippers** (paire basse + flipper orbital gauche à mi-hauteur `y=256`), constellation centrale de 5 bumpers en diamant | Grande arche moulée **Apollo** + rail chromé croisé **Anneau de Saturne** | *Allumage Apollo*, *Champ d'Astéroïdes*, *Arrimage Station ISS* |
| **3. Star Wars · Yavin** | **4 flippers** (paire basse + **double assaut étagé à droite** `y=154` & `y=282`), Conduit Thermique gardé par 2 turbolasers, bumpers X-Wing / Faucon Millenium / Y-Wing | Deux grandes rampes **Sabre Sith (rouge) & Sabre Jedi (bleu)** croisées en **X**, saut hyperespace | *Duel de sabres*, *Défense des turbolasers*, *Tranchée de l’Étoile Noire* ; sons de blaster et de sabre laser |
| **4. Temple Solaire** | **4 flippers en terrasses diagonales** (terrasse jade haute-gauche `y=204` + terrasse or basse-droite `y=298`), sanctuaires séparés émeraude / solaire | Rampe sinueuse **Serpent Quetzal** en S + rail doré **Aqueduc Solaire** | *Réveil de Quetzal*, *Offrande Solaire*, *Éclipse d'Or* |
| **6. Préhistoire** | **2 flippers**, volcan fumant, 4 bumpers de roche, empreintes et os croisés | *Rivière de lave* (ambre) + *Pont de lianes* (rail) | *Lave*, *Éruption*, *Chasse* |
| **7. Far West** | **2 flippers**, saloon, étoile de shérif, cactus et fer à cheval | *Rail de la mine* + *Diligence* | *Mine d'or*, *Coups de feu*, *Brigade* |
| **8. Halloween** | **2 flippers**, 5 citrouilles bumpers en étoile, pleine lune, toiles et chauves-souris | *Brume violette* + *Escalier du caveau* (rail) | *Brume*, *Citrouilles*, *Manoir* |
| **9. Candy Pop** | **2 flippers**, univers pastel façon manga girly : cœurs, étoiles et nœud de ruban | *Ruban rose* + *Arc-en-ciel* | *Rubans*, *Cœurs*, *Étoiles* |
| **10. Bonbons** | **2 flippers**, 6 bumpers gourmands, bonbons emballés, sucette spirale et comptoir rayé | *Sucre d'orge* + *Toboggan caramel* | *Sucres*, *Gourmand*, *Bocal* |
| **11. Train** | **2 flippers**, rails et traverses, signal ferroviaire, phare de locomotive et vapeur | *Voie 1* + *Voie 2* (rails chromés) | *Voies*, *Vapeur*, *Express* |
| **5. Flipper Classique** | **2 flippers seulement**, table mécanique d'arcade : triangle de 3 bumpers sous un verrou central, cartouche « FLIPPER » et voyants dorés | Deux **rampes miroir** (ambre à gauche, rail doré à droite) | *Rampes x2*, *Triangle Or*, *Cibles* |

---

## Commandes (Console tournée à 90° droite & PC)

| Action | Console Gamebuino AKA | Clavier PC (AZERTY / QWERTY) | Manette USB / Bluetooth |
| :--- | :--- | :--- | :--- |
| **Flippers Gauches** | **Bouton A** | `A`, `Q`, `Flèche Gauche`, `Shift Gauche` | `LB` / `LT` / `Croix Gauche` |
| **Flippers Droits** | **Bouton D** | `D`, `Flèche Droite`, `Shift Droit` | `RB` / `RT` / `Bouton Est (B)` |
| **Tendre le ressort (Lanceur)** | **Gâchette R1** *(maintenir puis relâcher)* | `Espace`, `Entrée` ou `R` | `Bouton Sud (A)` |
| **Secousse physique (Nudge)** | **Bouton B** *(attention au TILT)* | `B`, `Z`, `W`, `Flèche Haut` | `Bouton Nord (Y)` / `Ouest (X)` |
| **Menu / Table / Pause** | **Bouton C** | `C`, `P`, `Échap` | `Start` |
| **Nombre de joueurs (Web / PC)** | — | `N` (+1) ou `Flèche Bas` (−1) au menu | — |
| **Inverser rotation 180° (AKA)** | **L1 + C** | — | — |
| **Plein écran (PC)** | — | `F11` ou `Alt + Entrée` | — |

---

## Structure du dépôt

```text
.
├── src/                        # Application Web & Simulateur Gamebuino AKA (React 19 + TS + Canvas 720Hz)
│   ├── audio/soundEngine.ts    # Synthétiseur sonore arcade WebAudio sans fichier externe
│   ├── components/             # Châssis interactif Gamebuino AKA 90° + panneaux compagnons
│   ├── data/tables.ts          # Géométrie, rampes, bumpers et missions des 11 plateaux (240x520)
│   ├── engine/physicsEngine.ts # Moteur physique 720Hz, Multibille x3, zoom d'arrivée & caméra
│   └── engine/renderer.ts      # Rendu 2D haute précision, rampes Catmull-Rom & HUD 240x46
├── tests/engine.test.mjs       # Tests headless du moteur (node:test) : stabilité, déterminisme, framerate, pause...
├── desktop/                    # Wrapper Electron autonome (Windows .exe, Linux .AppImage, macOS .zip)
│   ├── main.cjs                # Fenêtre arcade 60 FPS sans latence audio + plein écran F11
│   ├── preload.cjs             # Pont sécurisé Electron
│   └── scripts/sync-web.mjs    # Synchronisation du bundle Vite vers desktop/app
├── firmware/aka_idf/          # Projet ESP-IDF 5.5.1 (ESP32-S3) pour la Gamebuino AKA
│   ├── main/game/              # Coeur de jeu portable : physique 360 Hz, états, sons synthétisés, plateaux générés
│   ├── main/ui/                # Rendu logiciel 240x320 avec clipping + police 8x8
│   ├── main/platform/          # Adaptateurs AKA : écran, boutons, audio, records sur carte SD
│   ├── components/             # gamebuino + aka_runtime (menu système, langues, captures, retour au loader)
│   ├── sdcard_files/           # Dossiers pinball/ (meta.json, screen.bmp, lang) et AKA/lang à copier sur la carte SD
│   └── test/host/              # Tests PC (g++) : physique, états, 168 motifs sonores, rendu sans écriture hors écran
├── scripts/gen-aka-tables.mjs  # Génère les plateaux du firmware depuis src/data/tables.ts (--check en CI)
├── scripts/gen-aka-art.mjs     # Génère les images de décor du firmware depuis le rendu Web (Chromium)
└── .github/workflows/
    ├── build-pc.yml            # CI/CD : Lint + Web (GitHub Pages) + Exécutables PC (Win/Linux/macOS)
    └── build-aka.yml           # CI/CD : tests PC, build ESP-IDF 5.5.1, paquet carte SD & Releases
```

---

## Développement local & Compilation PC

### 1. Lancer la version Web / Simulateur en développement

```bash
npm ci
npm run dev
```

Vérifications (les mêmes qu'en CI) :

```bash
npm run lint   # tsc --noEmit
npm test       # moteur physique (node:test)
npm run aka:test   # coeur de jeu et rendu du firmware compilés sur PC
node scripts/gen-aka-tables.mjs --check   # plateaux du firmware à jour avec tables.ts
```

L'application démarre sur `http://localhost:3000`.

### 2. Générer un exécutable PC autonome (Windows / Linux / macOS)

```bash
npm run desktop:install
npm run desktop:dist
```

Les binaires autonomes (`.exe` portable sous Windows, `.AppImage` / `.tar.gz` sous Linux, `.zip` sous macOS) sont générés dans `desktop/release/`.

---

## Firmware Gamebuino AKA

Le firmware (`firmware/aka_idf`) est un projet **ESP-IDF 5.5.1** pour l'ESP32-S3 de la console, construit sur les composants `gamebuino` et `aka_runtime`. C'est un **moteur simplifié** par rapport au Web/PC : les 11 plateaux (générés depuis `src/data/tables.ts`), bumpers, slingshots, flippers, rampes, puits de verrouillage, Multibille, missions et records sont présents, mais pas les spinners, les cibles ni les rollovers du Web. Les textes en jeu sont en français ; le menu système (MENU) est traduit en fr, en, de, es et it.

- **Graphismes** : le décor de chaque plateau (fond, rampes 3D, bumpers, cadre, cartouches) est **pré-rendu depuis le vrai moteur du jeu Web** (`PinballCanvasRenderer.renderTableArtwork`) et embarqué dans le firmware (`firmware/aka_idf/main/art/art<N>.z`, 240×520 RGB565 compressé en deflate, décompressé en PSRAM au choix du plateau). La console y superpose les éléments animés : flippers, bille, ressort, éclats des bumpers et slingshots, puits Multibille, et les **lampes** (chevrons du couloir lanceur en chenillard, 4 rollovers du haut + 2 retours allumés par la bille, gemmes de mission). Les boutons de flippers décalent les lampes du haut ; 4 couloirs = +10 000, 2 retours = +5 000. Pour régénérer les images après une modification des plateaux ou du rendu web : `node scripts/gen-aka-art.mjs` (Chromium + Playwright requis), puis committer les `.z`.
- **Sons** : effets de flipper synthétisés (bumpers, slingshots, flippers, ressort, rampes, verrouillage, Multibille, tilt, fin de partie…), avec un décor sonore propre à chaque plateau. Aucun échantillon ni musique protégée.
- **Lanceur et protection** : la bille repose sur la tête du ressort (qui descend quand on le tend). Une protection de 20 s après le tir rend la bille si elle tombe directement (une fois par bille), et des boucliers renvoient la bille aux sorties latérales (un coup chacun par bille).
- **Musique de fond** : une composition originale par plateau (circuit, espace, Star Wars, temple), de 8 phrases (A B A C D B C A, plus de 30 s avant de reboucler), synthétisée sur une piste réservée ; elle joue pendant la partie, se coupe dans le menu et s'accélère en Multibille. Son volume suit le réglage musique du runtime AKA.
- **Menu système (MENU)** : reprendre, commandes, langue, crédits, retour au loader. Appui long sur MENU : capture d'écran. RUN + MENU : retour au loader.
- **Commandes** : A / L1 / Gauche = flippers gauches ; D / Droite = flippers droits ; R1 / Bas = ressort ; B / Haut = secousse ; pause = touche MENU uniquement (la partie reprend où elle en était via « Reprendre »).
- **Records** : `/sdcard/pinball/records.bin`.
- **Table Star Wars · Yavin** : univers hommage de fan (libellés, couleurs, sabres laser et sons génériques) sans logo, personnage, image ni musique de Lucasfilm.

> **Limites connues :** le firmware n'a pas encore été validé sur une console réelle (la logique et le rendu sont testés sur PC, la compilation ESP-IDF est vérifiée en CI). Les volumes (effets et musique) suivent les réglages du runtime AKA, qui n'a pas encore de curseur dans son menu : valeurs par défaut.

## Installer sur la console Gamebuino AKA

1. Téléchargez **`AKA-Pinball-sdcard.zip`** depuis les **Releases** (ou l'artefact de l'onglet **Actions**).
2. Copiez les dossiers `pinball` et `AKA` à la racine de la carte SD (le dossier `AKA` est commun à tous les jeux : ne remplacez pas une version plus récente).
3. Lancez *Pinball* depuis le loader, console tournée de 90° vers la droite.

Compiler soi-même (ESP-IDF 5.5.1 installé) : `npm run aka:build`, puis `npm run aka:flash`.

## Workflows GitHub Actions (CI/CD PC & AKA)

Deux workflows automatisés s'exécutent sur GitHub dès chaque `git push` :

1. **`Build & Push PC + Web` (`.github/workflows/build-pc.yml`)**
   - Installe avec `npm ci` (lockfile), vérifie le typage TypeScript (`npm run lint`), lance les tests du moteur (`npm test`) et compile le bundle Web (`npm run build`).
   - Déploie automatiquement la version Web sur **GitHub Pages** (si activé dans *Settings → Pages → Source: GitHub Actions*).
   - Compile en parallèle les exécutables autonomes **Windows x64 (`.exe`)**, **Linux x64 (`.AppImage` & `.tar.gz`)** et **macOS Universal (`.zip`)**.
2. **`Build & Push Gamebuino AKA Firmware` (`.github/workflows/build-aka.yml`)**
   - Vérifie que les plateaux générés sont à jour, lance les tests PC du firmware, puis compile avec **ESP-IDF 5.5.1** (conteneur `espressif/idf`).
   - Produit `AKA-Pinball-sdcard.zip` (dossiers `pinball` et `AKA` prêts pour la carte SD) et `AKA-Pinball-firmware.bin`.

### Publier une Release GitHub complète (PC + AKA) en une commande

Pousser un tag `v*` déclenche automatiquement la création d'une **GitHub Release** regroupant les exécutables Windows/Linux/macOS **et** le paquet carte SD pour la Gamebuino AKA :

```bash
git tag v1.0.0
git push origin v1.0.0
```

Sans pouvoir pousser de tag, lancez **les deux** workflows (`build-pc.yml` et `build-aka.yml`) à la main depuis l'onglet *Actions* avec `publish_release` coché et **le même `release_tag`** (ex. `v1.1.0`) : les exécutables PC et le paquet carte SD arrivent dans une seule Release.

---

## Licence

Distribué sous licence [MIT](./LICENSE).
