# Gamebuino AKA Pinball (Web · PC · Firmware ESP32 AKA)

Jeu de flipper arcade néo-pixel conçu sur mesure pour la console **Gamebuino AKA** tenue **tournée de 90° vers la droite** (`240 × 320 px` en mode portrait), accompagné d'un simulateur interactif **Web / PC (Windows, Linux, macOS)** et d'un **firmware embarqué C++17 ESP32** *(expérimental : voir « Firmware : état actuel »)*.

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

## Les 4 plateaux aux dispositions uniques

| Plateau | Architecture physique | Rampes 3D | Missions dédiées |
| :--- | :--- | :--- | :--- |
| **1. Gamebuino AKA · ESP32** | **4 flippers** (paire basse + 2 mini-flippers cyber-deck symétriques à `y=174`), grappe asymétrique de 3 engrenages en haut à gauche + cœur Wi-Fi central | Rampe moulée bleue **Bus SPI** + rail métallique **Antenne Wi-Fi** | *Init Bus SPI*, *Overclock 240 MHz*, *Flash Firmware OTA* |
| **2. Odyssée Spatiale** | **3 flippers** (paire basse + flipper orbital gauche à mi-hauteur `y=256`), constellation centrale de 5 bumpers en diamant | Grande arche moulée **Apollo** + rail chromé croisé **Anneau de Saturne** | *Allumage Apollo*, *Champ d'Astéroïdes*, *Arrimage Station ISS* |
| **3. Galaxie Stellaire** | **4 flippers** (paire basse + **double assaut étagé à droite** `y=154` & `y=282`), réacteur blindé gardé par 2 tourelles | Deux grandes rampes **Sabres Laser Rouge & Bleu** croisées en **X** | *Escadron Rogue*, *Bouclier Déflecteur*, *Cœur du Réacteur* |
| **4. Temple Solaire** | **4 flippers en terrasses diagonales** (terrasse jade haute-gauche `y=204` + terrasse or basse-droite `y=298`), sanctuaires séparés émeraude / solaire | Rampe sinueuse **Serpent Quetzal** en S + rail doré **Aqueduc Solaire** | *Réveil de Quetzal*, *Offrande Solaire*, *Éclipse d'Or* |

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
│   ├── data/tables.ts          # Géométrie, rampes, bumpers et missions des 4 plateaux (240x520)
│   ├── engine/physicsEngine.ts # Moteur physique 720Hz, Multibille x3, zoom d'arrivée & caméra
│   └── engine/renderer.ts      # Rendu 2D haute précision, rampes Catmull-Rom & HUD 240x46
├── tests/engine.test.mjs       # Tests headless du moteur (node:test) : stabilité, déterminisme, framerate, pause...
├── desktop/                    # Wrapper Electron autonome (Windows .exe, Linux .AppImage, macOS .zip)
│   ├── main.cjs                # Fenêtre arcade 60 FPS sans latence audio + plein écran F11
│   ├── preload.cjs             # Pont sécurisé Electron
│   └── scripts/sync-web.mjs    # Synchronisation du bundle Vite vers desktop/app
├── firmware/gamebuino_aka/     # Projet PlatformIO C++17 complet pour l'ESP32 de la Gamebuino AKA
│   ├── platformio.ini          # Cible ESP32 240MHz + LovyanGFX SPI DMA + export post-build
│   ├── include/aka_hal.h       # HAL écran ILI9341 240x320, boutons GPIO & audio PWM
│   ├── src/main.cpp            # Moteur embarqué 4 tables, missions, Multibille x3 & caméra
│   ├── scripts/export_aka_bin.py # Génère PINBALL.BIN (MicroSD) et l'image flash USB complète (0x0)
│   └── test/host/              # Test hôte : compile main.cpp sur PC avec des mocks Arduino/LovyanGFX et le joue
├── scripts/
│   ├── push-to-aka.sh          # Déploiement local USB ou MicroSD sous Linux / macOS
│   └── push-to-aka.ps1         # Déploiement local USB ou MicroSD sous Windows PowerShell
└── .github/workflows/
    ├── build-pc.yml            # CI/CD : Lint + Web (GitHub Pages) + Exécutables PC (Win/Linux/macOS)
    └── build-aka.yml           # CI/CD : Compilation ESP32 PlatformIO + Artefacts PINBALL.BIN & Releases
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
bash firmware/gamebuino_aka/test/host/run.sh   # firmware compilé sur PC avec des mocks
```

L'application démarre sur `http://localhost:3000`.

### 2. Générer un exécutable PC autonome (Windows / Linux / macOS)

```bash
npm run desktop:install
npm run desktop:dist
```

Les binaires autonomes (`.exe` portable sous Windows, `.AppImage` / `.tar.gz` sous Linux, `.zip` sous macOS) sont générés dans `desktop/release/`.

---

## Firmware : état actuel

Le firmware (`firmware/gamebuino_aka`) est une **version simplifiée** du jeu, distincte du moteur Web/PC :
1 joueur, 4 plateaux, bumpers, rampes, verrou Multibille, missions, tilt, records sauvegardés en NVS. Il n'a **pas** les cibles,
spinners, couloirs, skill shot, combos ni le multijoueur de la version Web/PC.

> **À vérifier avant de flasher** : il cible un `esp32dev` générique (Arduino + LovyanGFX) avec un brochage **indicatif**. Il n'a pas été
> validé sur la console AKA réelle (ESP32-S3, bibliothèque `components/gamebuino` sous ESP-IDF), et le format de `PINBALL.BIN`
> n'est pas celui d'un chargeur AKA. Le portage en composant ESP-IDF, avec les tables générées depuis `tables.ts`, reste à faire.

Côté affichage, un écran complet (153 600 octets) prend ~31 ms en SPI à 40 MHz : comptez **25 à 30 images/s**, pas 60.

## Compiler & Pousser sur la console Gamebuino AKA

Prérequis local : [PlatformIO Core (`pio`)](https://platformio.org/install/cli) (`pip install platformio`).

### Option A — Copier `PINBALL.BIN` sur la carte MicroSD de l'AKA (Recommandé)

1. Téléchargez l'artefact **`Gamebuino-AKA-Pinball-Firmware`** depuis l'onglet **Actions** ou **Releases** de GitHub (ou compilez localement avec `npm run aka:build`).
2. Copiez `PINBALL.BIN` à la racine (ou dans `/GAMES/`) de la carte MicroSD FAT32 de votre Gamebuino AKA :

```bash
# Linux / macOS
./scripts/push-to-aka.sh sd /media/$USER/AKA_SD

# Windows PowerShell
.\scripts\push-to-aka.ps1 -Mode sd -Target E:\
```

### Option B — Flasher directement en USB-C

```bash
# Via le script fourni (Linux / macOS)
./scripts/push-to-aka.sh usb

# Ou sous Windows PowerShell
.\scripts\push-to-aka.ps1 -Mode usb -Target COM5

# Ou directement depuis une Release GitHub avec esptool.py :
esptool.py --chip esp32 --baud 921600 write_flash 0x0 gamebuino-aka-pinball-full-flash-0x0.bin
```

> **Personnalisation du brochage PCB AKA :** Si votre révision matérielle de Gamebuino AKA utilise des broches GPIO spécifiques pour l'écran SPI ou les boutons, surchargez simplement les constantes `-DAKA_PIN_...` dans `firmware/gamebuino_aka/platformio.ini` (toutes documentées dans `firmware/gamebuino_aka/include/aka_hal.h`).

---

## Workflows GitHub Actions (CI/CD PC & AKA)

Deux workflows automatisés s'exécutent sur GitHub dès chaque `git push` :

1. **`Build & Push PC + Web` (`.github/workflows/build-pc.yml`)**
   - Installe avec `npm ci` (lockfile), vérifie le typage TypeScript (`npm run lint`), lance les tests du moteur (`npm test`) et compile le bundle Web (`npm run build`).
   - Déploie automatiquement la version Web sur **GitHub Pages** (si activé dans *Settings → Pages → Source: GitHub Actions*).
   - Compile en parallèle les exécutables autonomes **Windows x64 (`.exe`)**, **Linux x64 (`.AppImage` & `.tar.gz`)** et **macOS Universal (`.zip`)**.
2. **`Build & Push Gamebuino AKA Firmware` (`.github/workflows/build-aka.yml`)**
   - Lance le test hôte du firmware (g++ + mocks), puis compile le firmware ESP32 C++17 via **PlatformIO**.
   - Produit et archive `PINBALL.BIN` (prêt pour MicroSD) ainsi que `gamebuino-aka-pinball-full-flash-0x0.bin` (flash complet USB-C).

### Publier une Release GitHub complète (PC + AKA) en une commande

Pousser un tag `v*` déclenche automatiquement la création d'une **GitHub Release** regroupant les exécutables Windows/Linux/macOS **et** les binaires `PINBALL.BIN` pour la Gamebuino AKA :

```bash
git tag v1.0.0
git push origin v1.0.0
```

---

## Licence

Distribué sous licence [MIT](./LICENSE).
