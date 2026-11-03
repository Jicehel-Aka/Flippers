# Gamebuino AKA Pinball (Web · PC · Firmware ESP32 AKA)

Suite de **12 flippers d'arcade thématiques** conçue sur mesure pour la console **Gamebuino AKA** tenue **tournée de 90° vers la droite** (`240 × 320 px` en mode portrait), accompagnée d'un **éditeur de tables maison intégré**, d'un simulateur **Web / PC (Windows, Linux, macOS)** et d'un **firmware ESP-IDF pour la console** *(voir « Firmware Gamebuino AKA »)*.

---

## Points clés & Architecture de jeu

- **Orientation verticale native 90° droite (`240 × 320 px`)**
  - Le bandeau gauche de l'écran paysage (`46 px`) devient un **afficheur matriciel supérieur fixe (`240 × 46 px`)** affichant le score, le joueur actif, la bille, la mission en cours et l'état du Multibille.
  - La fenêtre de jeu active (`240 × 274 px`) parcourt un **plateau équilibré de `240 × 520 px`** (~1,9 écran de hauteur), avec une **disposition géométrique sur mesure pour chacune des 12 tables**, dictée par son décor illustré.
- **Étages supérieurs jouables (`layer = 2`) & Décors physiquement interactifs**
  - **4 plateaux à double niveau** (*Gamebuino AKA · ESP32*, *Temple Solaire*, *Far West*, *Halloween*) intègrent un véritable **étage supérieur en surplomb** (mezzanine PCB vitrée, terrasse de jade, balcon de saloon en bois, galerie gothique) accessible par rampe, doté de son propre mini-flipper, de ses bumpers/cibles dédiés et d'un rebord ouvert de retombée au niveau `0`.
  - **Chacune des 12 tables possède son élément de décor interactif central** : processeur ESP32 à recul, anneau gravitationnel de Saturne, réacteur de l'Étoile Noire dans sa tranchée, disque solaire aztèque tournant, roto-cloche 1968, cratère de volcan en éruption, portes battantes de saloon traversables, Roi Citrouille, bonbonnière vitrée kawaii, grande roue sucette, plaque tournante ferroviaire et sarcophage de pierre coulissant.
- **Rampes 3D Catmull-Rom & Conduits aériens 100 % continus (zéro téléportation)**
  - La bille suit physiquement l'abscisse curviligne exacte des rampes moulées et rails tubulaires (capture progressive sans saut de position, ralentissement en montée, retour naturel en arrière si l'élan est trop faible, accélération en descente et sortie tangentielle sur le plateau ou l'étage supérieur).
  - Les éjecteurs spéciaux (Trou de Ver sur *Odyssée Spatiale*, Tube à Sucre sur *Bonbons*) acheminent visiblement la bille dans un **conduit pneumatique courbé 3D** au-dessus du plateau.
- **12 bandes-son originales longues & effets sonores dédiés**
  - Chaque univers possède **sa propre composition originale de 32 mesures** (8 sections de 4 mesures = 512 doubles-croches par cycle, ~60 à 90 s avant rebouclage, enrichie de variations multi-cycles sur plus de 3 minutes) ainsi que des **bruitages spécialisés**.
- **Configuration JSON ouverte (`src/data/tables.config.json`) & Éditeur de tables maison**
  - Toutes les tables (y compris leurs `upperPlayfield` et `interactiveToys`) sont décrites dans `src/data/tables.config.json` et éditables en **glisser-déposer direct** depuis l'onglet **Éditeur**, avec export `.json` et synchronisation C++ AKA.
- **Arrivée en vue d'ensemble, Multibille ×3 & Caméra « Bille la plus basse »**
  - À l'arrivée sur une table, la caméra dézoome (`OVERVIEW_ZOOM`) pour dévoiler **100 % du plateau `240 × 520 px`**, puis zoome progressivement sur le lanceur et les flippers. En **Multibille ×3**, le scrolling suit toujours la bille active la plus basse.
- **Physique déterministe à pas fixe** : 720 Hz sur Web/PC, 360 Hz sur le firmware. Pause automatique hors focus et confirmation en deux appuis (2,5 s) pour *Recommencer* ou *Quitter*.

---

## Les 12 plateaux aux dispositions, étages et décors interactifs uniques

| Plateau | Architecture & éléments spécialisés | Rampes 3D & Conduits continus | Musique originale (32 mes.) |
| :--- | :--- | :--- | :--- |
| **1. Gamebuino AKA · ESP32** | **4 flippers** dont **Mezzanine vitrée JTAG (étage droit)**, socket **ESP32-S3 interactif**, bumpers engrenages/puces à gauche | Rampe diagonale **Bus SPI → Étage** + boucle **Antenne Wi-Fi** | *Cyber-Chiptune* en La Dorien (124 BPM) |
| **2. Odyssée Spatiale** | **3 flippers** (orbital gauche), **vortex gravitationnel de Saturne**, chevron NASA & sas lunaire | Grande **Arche Apollo** + **Fronde de Jupiter** + conduit **Trou de Ver** | *Kosmische Séquenceur* en Ré Lydien (108 BPM) |
| **3. Star Wars · Yavin** | **4 flippers** (double aile droite étagée), tranchée blindée centrale & **réacteur Étoile Noire** | Rampes **Sabre Sith & Sabre Jedi** croisées en **X** | *Marche Space-Opera* en Sol Mineur (120 BPM) |
| **4. Temple Solaire** | **4 flippers** dont **Sanctuaire de Jade (étage gauche)**, **disque solaire aztèque tournant**, marches ziggourat | **Serpent Quetzal → Étage** + rail **Aqueduc d'Or** | *Flûte de Pan & Marimba* en Ré Dorien-Harm. (116 BPM) |
| **5. Flipper Classique** | **2 flippers pur 1968** sans caissons latéraux, couronne royale à 5 cabochons, losanges à plots & **Roto-Cloche** | Couloir chromé gauche + arche ambrée droite vers `1-9-6-8` | *Orgue Hammond Boogie* en Do Mixolydien (130 BPM) |
| **6. Préhistoire** | **3 flippers** (falaise d'os droite), **cratère de volcan en éruption**, nid d'œufs jurassique encaissé à gauche | **Coulée de Magma** diagonale + **Pont de Lianes** | *Flûte d'Os & Tambours* en Mi Pentatonique (112 BPM) |
| **7. Far West** | **3 flippers** dont **Balcon en bois du Saloon (étage droit)**, **portes battantes de saloon** traversables | Chevalement **Rail de la Mine → Balcon** + **Piste Diligence** | *Banjo Ragtime Saloon* en Ré Mixolydien (136 BPM) |
| **8. Halloween** | **3 flippers** dont **Galerie gothique du Manoir (étage gauche)**, **Roi Citrouille** devant les flippers | **Escalier du Manoir → Étage** + **Volute de Brume** | *Toccata d'Orgue Gothique* en Do Min. Harm. (114 BPM) |
| **9. Candy Pop** | **3 flippers** gaufrette, **bonbonnière kawaii tournante**, donuts glacés, macarons, cupcake chantilly, sucres d'orge & 5 bumpers sucrés | **Ruban Coulis de Fraise** + **Toboggan Menthe Glacée** croisés | *Future-Pop Harajuku* en Sol Majeur (138 BPM) |
| **10. Bonbons** | **3 flippers** (spatule haute droite), **grande roue sucette**, slalom de **6 bumpers** acidulés & comptoir vitré | **Serpentin Sucre d'Orge** zig-zag + **Gouttière Caramel** + **Tube à Sucre** | *Gavotte Boîte à Musique* en Fa Majeur (118 BPM) |
| **11. Train Express** | **4 flippers** (double aiguillage médian), **plaque tournante ferroviaire motorisée** & signaux sémaphores | Double viaduc d'acier **Voie 1 & Voie 2** croisé | *Marche Ferroviaire Vapeur* en La Mineur (132 BPM) |
| **12. Crypte** | **3 flippers** (beffroi haut gauche), **croix gothique de 5 bumpers** de givre & **sarcophage coulissant** entre deux piliers | **Arc-Boutant de Givre** + **Galerie des Gargouilles** | *Procession & Glas* en Ré Phrygien Dom. (86 BPM) |

### Spécialités mécaniques & Cibles vivantes

| Plateau | Spécialité interactive |
| :--- | :--- |
| **Gamebuino AKA · ESP32** | **Mezzanine JTAG + Socket ESP32** : étage vitré à mini-flipper droit et puce centrale à recul mécanique |
| **Odyssée Spatiale** | **Gravité de Saturne + Trou de Ver** : déviation orbitale au centre et conduit pneumatique transparent |
| **Star Wars · Yavin** | **Tranchée de l'Étoile Noire** : couloir blindé menant au cœur du réacteur et double flipper d'aile droite |
| **Temple Solaire** | **Sanctuaire de Jade + Disque Solaire** : étage supérieur gauche et roue aztèque tournante |
| **Flipper Classique** | **Roto-Cloche 1968** : cible étoilée tournante centrale et carré d'As `A-K-Q-J` dans une arène 100 % ouverte |
| **Préhistoire** | **Volcan actif + Mammouths** : cratère explosif en haut du plateau et piste mobile à 4 touches (+40 000 pts) |
| **Far West** | **Portes du Saloon + Balcon + WANTED** : portes battantes à double sens, balcon jouable et 5 hors-la-loi (+50 000 pts) |
| **Halloween** | **Galerie Hantée + Roi Citrouille + Fantômes** : étage gothique gauche, citrouille gardienne et 4 esprits (+45 000 pts) |
| **Candy Pop** | **Bonbonnière Kawaii + Bumper sucré ×3** : dôme de dragées tournant au milieu des pâtisseries et bumper doré ×3 rotatif |
| **Bonbons** | **Roue Sucette + Sucettes mobiles** : disque sucette central, tube à sucre aérien et 4 sucettes à croquer (+40 000 pts) |
| **Train Express** | **Plaque Tournante + Locomotive** : pont tournant motorisé central et progression séquentielle sur 5 gares (+45 000 pts) |
| **Crypte** | **Sarcophage Coulissant + Zombies** : dalle runique s'ouvrant sous l'impact et 4 zombies à renvoyer sous terre (+50 000 pts) |

---

## Éditeur de tables maison & Configuration JSON

Les définitions complètes des 12 plateaux résident dans **`src/data/tables.config.json`**. Depuis l'onglet **Éditeur** de l'application Web/PC :

1. **Créer ou modifier un plateau** : déplacez directement à la souris les bumpers (8 couleurs, 24 icônes), points de contrôle des rampes Catmull-Rom (avec option de sortie sur étage supérieur), **décors interactifs** (6 comportements physiques, 12 visuels), **étages supérieurs surélevés** (`upperPlayfield`), cibles, flippers supplémentaires, spinners, puits Multibille et cibles mobiles.
2. **Personnaliser l'ambiance** : associez librement l'un des 12 décors spécialisés, l'une des 12 compositions musicales (avec pré-écoute directe), la gravité, la palette lumineuse et les 3 missions scénarisées.
3. **Tester & Exporter** : cliquez sur **Tester sur la console AKA** pour jouer immédiatement votre création, exportez une table individuelle (`.table.json`) pour la partager, ou exportez **`tables.config.json`** pour mettre à jour le dépôt et régénérer le firmware C++ (`npm run aka:tables` puis `npm run aka:art`).

---

## Commandes (Console tournée à 90° droite & PC)

| Action | Console Gamebuino AKA | Clavier PC (AZERTY / QWERTY) | Manette USB / Bluetooth |
| :--- | :--- | :--- | :--- |
| **Flippers Gauches** | **Bouton A** | `A`, `Q`, `Flèche Gauche`, `Shift Gauche` | `LB` / `LT` / `Croix Gauche` |
| **Flippers Droits** | **Bouton D** | `D`, `Flèche Droite`, `Shift Droit` | `RB` / `RT` / `Bouton Est (B)` |
| **Tendre le ressort (Lanceur)** | **Gâchette R1** *(maintenir puis relâcher)* | `Espace`, `Entrée` ou `R` | `Bouton Sud (A)` |
| **Secousse physique (Nudge)** | **Bouton B** *(attention au TILT)* | `B`, `Z`, `W`, `Flèche Haut` | `Bouton Nord (Y)` / `Ouest (X)` |
| **Menu / Table / Pause** | **Bouton C** | `C`, `P`, `Échap` | `Start` |
| **Musique de fond (On / Off)** | Réglage runtime AKA | `M` | — |
| **Nombre de joueurs (Web / PC)** | — | `N` (+1) ou `Flèche Bas` (−1) au menu | — |
| **Plein écran (PC)** | — | `F11` ou `Alt + Entrée` | — |

---

## Structure du dépôt

```text
.
├── src/
│   ├── audio/
│   │   ├── musicEngine.ts       # 12 compositions procédurales de 32 mesures + variations multi-cycles
│   │   └── soundEngine.ts       # Synthétiseur d'effets sonores spécialisés par thème
│   ├── components/
│   │   ├── GamebuinoConsole.tsx # Châssis interactif Gamebuino AKA tourné à 90°
│   │   ├── CompanionPanels.tsx  # Sélecteur des 12+ tables, scores, règles et aperçu C++
│   │   └── TableEditor.tsx      # Éditeur visuel de tables maison (drag & drop + import/export JSON)
│   ├── data/
│   │   ├── tables.config.json   # Configuration déclarative JSON des 12 plateaux et de leurs éléments
│   │   └── tables.ts            # Chargement, validation, persistance locale & compatibilité AKA
│   ├── engine/
│   │   ├── physicsEngine.ts     # Moteur physique 720 Hz, Multibille ×3, cibles mobiles & caméra
│   │   └── renderer.ts          # Rendu 2D pro, 24 icônes de bumpers, décors illustrés & rampes 3D
├── tests/
│   ├── engine.test.mjs          # Tests headless du moteur physique (stabilité, déterminisme, pause)
│   └── config-and-music.test.mjs# Tests du catalogue JSON, de l'éditeur et des 12 bandes-son
├── desktop/                     # Wrapper Electron autonome (Windows .exe, Linux .AppImage, macOS .zip)
├── firmware/aka_idf/            # Projet ESP-IDF 5.5.1 (ESP32-S3) pour la Gamebuino AKA
│   ├── main/game/               # Cœur C++ 360 Hz, 12 musiques de 512 pas, SFX & tables_data.inc
│   ├── main/ui/                 # Rendu logiciel 240x320 avec décor pré-rendu RGB565 compressé
│   └── test/host/               # Suite de tests C++ native (physique, audio, rendu sans débordement)
└── scripts/
    ├── gen-aka-tables.mjs       # Génère tables_data.inc depuis src/data/tables.ts (--check en CI)
    └── gen-aka-art.mjs          # Génère les décors RGB565 art0.z..art11.z depuis le rendu Web
```

---

## Firmware AKA : ce qui est simulé

Le firmware embarque un **moteur simplifié** : les 12 plateaux (générés depuis `src/data/tables.config.json`) sont rejoués avec leurs bumpers, flippers, rampes suivies sans téléportation, boîtiers, puits Multibille, missions, cibles mobiles (WANTED, fantômes, mammouths, sucettes, locomotive, zombies) et bumper doré ×3. Les **étages supérieurs, cibles fixes, spinners et décors interactifs** ne sont que **dessinés** dans le décor pré-rendu ; seule leur version complète est jouable sur Web/PC. Le décor pré-rendu doit être régénéré (`npm run aka:art`) à chaque modification d'un plateau.

---

## Développement local & Vérifications

```bash
npm ci
npm run dev
```

Vérifications complètes (identiques à la CI) :

```bash
npm run lint                              # Typage TypeScript strict (tsc --noEmit)
npm test                                  # Tests moteur physique + configuration JSON + 12 musiques
npm run aka:tables                        # Régénère firmware/aka_idf/main/game/tables_data.inc
node scripts/gen-aka-tables.mjs --check   # Vérifie la synchronisation tables.config.json <-> firmware
npm run aka:test                          # Compile et exécute les tests C++ natifs du firmware AKA
```

---

## Licence

Distribué sous licence [MIT](./LICENSE).
