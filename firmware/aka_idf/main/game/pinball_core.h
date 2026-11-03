/*
===============================================================================
  pinball_core.h — Coeur du jeu de flipper, PORTABLE (aucune dependance materielle)
-------------------------------------------------------------------------------
  Physique a pas fixe (360 Hz), 4 plateaux generes depuis src/data/tables.ts,
  missions, rampes, verrou multibille, tilt, records.

  Ce code ne connait ni ESP-IDF, ni gb_graphics, ni FreeRTOS : il est compile tel
  quel par la console (firmware/aka_idf) ET par le test PC (firmware/aka_idf/test).
  La plateforme lui donne l'etat des boutons, l'heure, un stockage de records, et
  recupere les evenements sonores (SfxEvent) pour les jouer.
===============================================================================
*/
#pragma once
#include <stdint.h>

namespace pinball {

constexpr int   SCREEN_W   = 240;            // vue portrait : la console est tournee a 90 degres
constexpr int   SCREEN_H   = 320;
constexpr int   HUD_H      = 46;
constexpr int   VIEW_H     = SCREEN_H - HUD_H;   // 274
constexpr int   WORLD_W    = 240;
constexpr int   WORLD_H    = 520;
constexpr float MAX_CAM_Y     = (float)(WORLD_H - VIEW_H);
constexpr float OVERVIEW_ZOOM = (float)VIEW_H / (float)WORLD_H;
constexpr float BALL_RADIUS   = 5.2f;
constexpr float PLUNGER_TOP_Y = 478.0f;   // sommet du ressort au repos (identique au moteur Web)
constexpr float BALL_SAVE_SEC = 20.0f;    // duree de la protection contre la chute directe, apres la sortie du couloir

constexpr int TABLE_COUNT  = 12;
constexpr int MAX_BALLS    = 3;
constexpr int MAX_BUMPERS  = 6;
constexpr int MAX_WALLS    = 128;
constexpr int MAX_FLIPPERS = 5;           // 2 principaux + 2 supplementaires + 1 de l'etage
constexpr int MAX_TARGETS  = 8;
constexpr int MAX_UP_TARGETS = 3;
constexpr int MAX_BANKS    = 3;           // 2 banques du plateau + 1 banque de l'etage
constexpr int MAX_SPINNERS = 2;
constexpr int MAX_PEGS     = 6;
constexpr int MAX_XWALLS   = 4;
constexpr int MAX_TOYS     = 1;
constexpr int MAX_UP_BUMPERS = 2;
constexpr int MAX_UP_ROLLOVERS = 2;

constexpr float PHYSICS_DT    = 1.0f / 360.0f;   // independant de la cadence d'affichage
constexpr int   MAX_SUBSTEPS  = 16;              // 16 / 360 s = 44 ms > dt maximal (40 ms)
constexpr float MAX_FRAME_DT  = 0.040f;

struct Vec2 { float x, y; };

struct BumperDef {
    float x, y, r;
    uint32_t fill, rim;       // RGB888
    uint16_t points;
    const char* label;
};

struct ExtraFlipperDef {
    bool isLeft;
    float px, py, length;
    float restDeg, activeDeg;
};

struct RampDef {
    Vec2 pts[5];              // entree = pts[0], sortie = pts[4]
    bool wireform;
    bool toUpper;             // la sortie depose la bille sur l'etage superieur (couche 2)
    float entryRadius;
    uint32_t color;
    uint32_t points;
    const char* name;
};

// kind : 0 bumpers, 1 rampes, 2 cibles / verrou
struct MissionDef {
    const char* title;
    uint8_t kind;
    uint8_t goal;
    uint32_t reward;
    uint32_t color;           // couleur de la gemme (RGB888)
};

// Rollover : lampe au sol qui s'allume quand la bille passe dessus. group 0 = 4 couloirs du haut, 1 = retours.
struct RolloverDef {
    float x, y, r;
    char letter;
    uint16_t points;
    uint8_t group;
};
constexpr int MAX_ROLLOVERS = 6;

// Cible fixe (STANDUP) ou escamotable (DROP) ; les cibles d'une meme banque se completent ensemble.
struct TargetDef {
    float x1, y1, x2, y2;
    char letter;
    uint8_t bank;             // indice de banque dans la table (0..MAX_BANKS-1)
    uint8_t role;             // 0 multiplicateur, 1 multibille, 2 boucliers, 3 rampes x2
    bool drop;                // true : s'efface quand elle est touchee, revient quand la banque est complete
    uint16_t points;
    uint32_t color;
};

struct SpinnerDef {
    float x, y, width, angle;
    uint16_t points;          // points par demi-tour
};

struct XWallDef { float x1, y1, x2, y2, bounce; };
struct PegDef { float x, y, r, bounce; };

// Ejecteur (VUK) : la bille est captee, puis voyage dans un conduit aerien jusqu'a la sortie.
struct VukDef {
    bool present;
    float x, y, r;
    Vec2 pts[5];              // conduit : pts[0] = entree, pts[4] = sortie
    float evx, evy;           // vitesse d'ejection
    uint16_t points;
    uint32_t color;
    const char* name;
};

// Elements mecaniques interactifs : kind 0 BASH, 1 SWING_DOORS, 2 TURNTABLE, 3 GRAVITY_WELL, 4 SLIDING_CRYPT, 5 ROTO_TARGET
struct ToyDef {
    bool present;
    uint8_t kind;
    uint8_t visual;           // meme ordre que InteractiveToyVisual (0 ESP32_CHIP ... 11 SARCOPHAGUS)
    float x, y, r;
    uint16_t points;
    uint8_t hitsRequired;
    uint32_t reward;
    uint32_t color;
    const char* name;
};

// Etage superieur (couche 2) : polygone, rebords ouverts, flipper, bumpers, cibles, couloirs
struct UpperDeckDef {
    bool present;
    uint8_t n;                // sommets du polygone
    Vec2 b[6];
    uint8_t openMask;         // bit i : l'arete i -> i+1 est ouverte (la bille retombe sur le plateau)
    uint32_t fill, border;
    const char* name;
    uint8_t bumperCount;
    BumperDef bumpers[MAX_UP_BUMPERS];
    uint8_t targetCount;
    TargetDef targets[MAX_UP_TARGETS];
    uint8_t rolloverCount;
    RolloverDef rollovers[MAX_UP_ROLLOVERS];
    uint8_t flipperCount;
    ExtraFlipperDef flippers[1];
};

struct HousingDef {
    uint8_t n;                // nombre de sommets (polygone ferme)
    Vec2 p[5];
};

struct HuntDef {
    uint8_t kind;             // 0 aucune, 1 WANTED, 2 FANTOME, 3 MAMMOUTH, 4 SUCETTE, 5 LOCOMOTIVE, 6 ZOMBIE
    uint8_t slotCount;
    bool sequential;          // true : la cible suit l'ordre des emplacements
    Vec2 slots[6];
    float radius;
    uint16_t points;
    uint8_t goal;             // touches pour decrocher la prime
    uint32_t reward;
    uint32_t color;
    const char* name;
};

struct TableDef {
    const char* name;
    const char* subName;
    const char* multiballName;
    uint8_t decor;            // 0 circuit, 1 espace, 2 Star Wars, 3 temple, 4 classique, 5 prehistoire, 6 far west, 7 halloween, 8 candy, 9 bonbons, 10 train, 11 crypte
    uint32_t bgTop, bgBot, accent, rail, flipperCol;
    float gravity;
    uint8_t bumperCount;
    BumperDef bumpers[MAX_BUMPERS];
    uint8_t extraFlipperCount;
    ExtraFlipperDef extraFlippers[2];
    RampDef ramps[2];
    VukDef vuk;
    uint8_t targetCount;
    TargetDef targets[MAX_TARGETS];
    uint8_t spinnerCount;
    SpinnerDef spinners[MAX_SPINNERS];
    uint8_t xwallCount;
    XWallDef xwalls[MAX_XWALLS];
    uint8_t pegCount;
    PegDef pegs[MAX_PEGS];
    ToyDef toy;
    UpperDeckDef upper;
    Vec2 lockPos;
    float lockRadius;
    MissionDef missions[3];
    Vec2 missionPos;          // centre du cartouche des 3 gemmes de mission
    RolloverDef rollovers[MAX_ROLLOVERS];
    uint8_t housingCount;     // boitiers biseautes pleins (collision identique au moteur Web)
    HousingDef housings[6];
    HuntDef hunt;
    bool rotateBumper;        // un bumper dore (x3) qui change a chaque touche
};

const TableDef& table(int index);

struct Segment {
    float x1, y1, x2, y2;
    float bounce;
    uint32_t color;
    bool scoring;             // vrai pour les slingshots
};

struct Ball {
    float x, y, vx, vy;
    bool active;
    bool inShooter;
    float rampCool;           // secondes avant de pouvoir reprendre une rampe / le verrou
    float stuckTime;          // secondes quasi immobile (anti-blocage)
    int8_t ramp = -1;         // rampe suivie : 0..1 rampes, 2 conduit du VUK, -1 : bille libre
    float rampDist = 0.0f;    // distance parcourue le long de la rampe (px)
    float rampSpeed = 0.0f;   // vitesse le long de la rampe (px/s)
    uint8_t layer = 0;        // 0 plateau, 2 etage superieur
    bool held = false;        // captee dans l'ejecteur (VUK)
    float holdTimer = 0.0f;
};

struct FlipperRuntime {
    bool isLeft;
    float px, py, length;
    float restRad, activeRad;
    float angleRad, prevAngleRad;
    uint8_t layer = 0;        // 0 plateau, 2 etage superieur
};

// Etat des boutons (maintenu). Les fronts sont calcules par le jeu.
struct Input {
    bool left    = false;     // flippers gauches (+ navigation menu)
    bool right   = false;     // flippers droits  (+ navigation menu)
    bool plunger = false;     // ressort du lance-bille (+ valider)
    bool nudge   = false;     // secousse (+ valider / recommencer)
    bool pause   = false;     // pause / reprise
};

enum class State : uint8_t { Menu, Playing, Paused, GameOver };

enum class Sfx : uint8_t {
    None = 0,
    MenuMove, MenuOk, Pause, Resume, Confirm,
    Flipper, Launch, Bumper, Sling, Ramp, Lock, Multiball,
    Mission, Finale, Nudge, Tilt, Drain, NewBall, GameOver, NewRecord, LockLit,
};

struct SfxEvent {
    Sfx id;
    uint8_t arg;              // Bumper : indice du bumper ; Flipper : 0 gauche / 1 droit ; Mission : numero
};

// Stockage des records (NVS sur la console, memoire dans les tests).
struct HighScoreStore {
    void (*load)(uint32_t out[TABLE_COUNT]) = nullptr;
    void (*save)(const uint32_t in[TABLE_COUNT]) = nullptr;
};

class Game {
public:
    Game();
    void begin(const HighScoreStore& store);
    void update(float dt, const Input& in, uint32_t nowMs);
    void syncInput(const Input& in);   // voir pinball_core.cpp

    bool popSfx(SfxEvent& out);          // vide la file d'evenements sonores

    // --- Etat lisible par le rendu et les tests -------------------------------------
    State state = State::Menu;
    uint8_t tableIdx = 0;
    Ball balls[MAX_BALLS];
    FlipperRuntime flippers[MAX_FLIPPERS];
    uint8_t flipperCount = 2;
    Segment walls[MAX_WALLS];
    uint8_t wallCount = 0;
    Segment upWalls[6];                  // rebords fermes de l'etage superieur
    uint8_t upWallCount = 0;
    float wallFlash[MAX_WALLS] = {};
    float bumperFlash[MAX_BUMPERS] = {};
    uint8_t huntSlot = 0;
    uint16_t huntHits = 0;
    float huntFlash = 0.0f;
    uint8_t litBumper = 0;

    // --- Mecaniques portees du moteur Web (cibles, spinners, jouets, etage) ---------
    uint16_t targetHit = 0;              // bit i : cible i du plateau touchee (les cibles DROP sont alors escamotees)
    uint8_t upTargetHit = 0;
    uint8_t upRolloverLit = 0;
    float dropReset[MAX_BANKS] = {};     // delai avant le retour des cibles escamotables d'une banque complete
    float targetFlash[MAX_TARGETS + MAX_UP_TARGETS] = {};
    float upBumperFlash[MAX_UP_BUMPERS] = {};
    float spinAngle[MAX_SPINNERS] = {};
    float spinVel[MAX_SPINNERS] = {};
    uint8_t spinCount[MAX_SPINNERS] = {};
    struct ToyState { uint16_t hits; float flash, angle, spinVel, openRatio, activeTimer, cooldown; };
    ToyState toyState;
    uint8_t rampBoost = 1;               // banque JACKPOT_BOOST : points des rampes x1..x3
    uint8_t bonusMult = 1;               // banque MULTIPLIER : x1..x8 (bonus de fin de bille)
    float vukFlash = 0.0f;
    float multiDelay = 0.0f;
    uint8_t multiQueue = 0;              // billes de multibille encore a envoyer dans le lanceur

    uint32_t score = 0;
    uint32_t highScores[TABLE_COUNT] = {25000, 25000, 25000, 25000};
    uint8_t ballsRemaining = 3;
    uint8_t lockedBalls = 0;
    bool multiballActive = false;
    bool lockLit = false;                // le puits ne capture que lorsqu'il est allume (5 touches de bumpers)
    uint8_t lockHits = 0;
    uint8_t rolloverLit = 0;             // bit i = rollover i allume (0..3 couloirs du haut, 4..5 retours)
    float rolloverFlash = 0.0f;          // clignotement de bonus quand les 4 couloirs sont completes
    bool ballSaveUsed = false;           // la protection ne sert qu'une fois par bille
    bool kickLeftLit = true, kickRightLit = true;   // boucliers des sorties laterales (un coup chacun, rearmes a chaque bille)
    float ballSaveTimer = 0.0f;          // > 0 : protection active (la bille perdue est rendue)
    uint8_t missionIdx = 0;
    uint8_t missionProgress = 0;
    float plungerCharge = 0.0f;
    float tiltMeter = 0.0f;
    bool isTilted = false;
    bool newRecord = false;
    uint8_t confirmAction = 0;           // 0 aucune, 1 recommencer, 2 menu
    uint32_t confirmUntilMs = 0;

    float cameraY = MAX_CAM_Y;
    float cameraZoom = OVERVIEW_ZOOM;
    float introTimer = 0.0f;
    char bannerText[40] = "";
    float bannerTimer = 0.0f;
    uint32_t hudRevision = 0;            // change des qu'une valeur du HUD change (rendu partiel)
    uint32_t nowMs = 0;

    const TableDef& tbl() const { return table(tableIdx); }

    // Utilises par les tests pour piloter la physique directement
    void startNewGame(uint8_t tableIndex);
    void stepPhysics(float dt, const Input& in);

private:
    HighScoreStore store_;
    float physicsAccum_ = 0.0f;
    uint32_t stateLockUntilMs_ = 0;
    uint32_t recordAtStart_ = 0;
    bool prevLeft_ = false, prevRight_ = false, prevPlunger_ = false, prevNudge_ = false, prevPause_ = false;
    SfxEvent sfxQueue_[24];
    uint8_t sfxHead_ = 0, sfxTail_ = 0;

    void emit(Sfx id, uint8_t arg = 0);
    void showBanner(const char* txt, float sec);
    void bannerf(float sec, const char* fmt, ...);
    void buildStaticWalls();
    void setupFlippers();
    void spawnBallInShooter(int idx);
    void advanceMission(uint8_t kind, bool joker = false);
    void stepUpper(Ball& b, float dt, bool leftHeld, bool rightHeld);
    void stepToy(Ball& b, float dt);
    void onTargetHit(uint8_t idx, bool upper);
    float frand();
    uint32_t rng_ = 12345u;
    void startMultiball();
    bool circleHit(Ball& b, float cx, float cy, float r, float rest, float kick);
    bool collideBallSegment(Ball& b, float x1, float y1, float x2, float y2, float restitution,
                            float extraKick, int wallIndex, float thick = 0.0f);
    void stepSubstep(float dt, bool leftHeld, bool rightHeld);
    void updatePlaying(float dt, const Input& in, bool nudgePressed, bool launchEdgeFlipper);
    void updateCamera(float dt);
    void commitScore();
    void requestConfirm(uint8_t action);
    void touchHud() { hudRevision++; }
};

} // namespace pinball
