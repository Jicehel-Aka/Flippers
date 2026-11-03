/*
===============================================================================
  pinball_core.h — Coeur du jeu de flipper, PORTABLE (aucune dependance materielle)
-------------------------------------------------------------------------------
  Physique a pas fixe (360 Hz), 12 plateaux distincts generes depuis
  src/data/tables.config.json : etages superieurs jouables (layer = 2), rampes
  Catmull-Rom 9 points sans teleportation, conduits aeriens continus (VUK),
  decors interactifs propres a chaque table, cibles tombantes/fixes, spinners,
  missions, verrou multibille, tilt, records.

  Ce code ne connait ni ESP-IDF, ni gb_graphics, ni FreeRTOS : il est compile tel
  quel par la console (firmware/aka_idf) ET par le test PC (firmware/aka_idf/test).
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

constexpr int TABLE_COUNT     = 12;
constexpr int MAX_BALLS       = 3;
constexpr int MAX_BUMPERS     = 6;
constexpr int MAX_WALLS       = 128;
constexpr int MAX_PEGS        = 36;
constexpr int MAX_FLIPPERS    = 4;
constexpr int RAMP_PTS        = 9;
constexpr int VUK_PTS         = 7;
constexpr int MAX_TARGETS     = 12;
constexpr int MAX_SPINNERS    = 3;
constexpr int MAX_EXTRA_WALLS = 8;
constexpr int MAX_EXTRA_PEGS  = 8;
constexpr int MAX_TOYS        = 2;
constexpr int MAX_UPPER_VERTS = 6;
constexpr int MAX_UPPER_BMPS  = 3;
constexpr int MAX_UPPER_TGTS  = 4;
constexpr int MAX_UPPER_ROLLS = 3;

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
    uint8_t layer;            // 0 : plateau principal ; 2 : etage superieur
};

struct RampDef {
    Vec2 pts[RAMP_PTS];       // entree = pts[0], sortie = pts[RAMP_PTS - 1]
    Vec2 entryDir;
    bool wireform;
    bool allowSideEntry;
    bool exitsToUpper;        // true : depose la bille sur l'etage superieur (layer = 2)
    float entryRadius;
    uint32_t color;
    uint32_t points;
    const char* name;
};

struct VukDef {
    bool active;
    float x, y, r;
    Vec2 pts[VUK_PTS];        // conduit aerien continu du puits jusqu'a la sortie
    Vec2 ejectVel;
    bool exitsToUpper;
    uint32_t points;
    uint32_t color;
    const char* name;
};

struct TargetDef {
    float x1, y1, x2, y2;
    uint8_t kind;             // 0 = DROP (tombante), 1 = STANDUP (fixe)
    uint8_t bankId;           // 0..3 : indice de banque sur la table
    uint8_t bankRole;         // 0 = MULTIPLIER, 1 = MULTIBALL, 2 = KICKBACK, 3 = JACKPOT_BOOST
    char letter;
    uint32_t color;
    uint16_t points;
};

struct SpinnerDef {
    float x, y, width, angle;
    uint16_t points;
};

struct ExtraWallDef {
    float x1, y1, x2, y2, bounce;
};

struct PegDef {
    float x, y, r;
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

// Etage superieur jouable (layer = 2) surplombant le plateau principal
struct UpperDeckDef {
    bool active;
    uint8_t n;
    Vec2 bounds[MAX_UPPER_VERTS];
    uint8_t openEdgeMask;     // bit i = arete i -> (i+1)%n ouverte (redescente au niveau 0)
    uint32_t fillCol;
    uint32_t borderCol;
    uint8_t bumperCount;
    BumperDef bumpers[MAX_UPPER_BMPS];
    uint8_t targetCount;
    TargetDef targets[MAX_UPPER_TGTS];
    uint8_t rolloverCount;
    RolloverDef rollovers[MAX_UPPER_ROLLS];
};

// Decor mecanique interactif propre au theme de la table
// kind   : 0 aucun, 1 BASH_TOY, 2 SWING_DOORS, 3 TURNTABLE, 4 GRAVITY_WELL, 5 SLIDING_CRYPT, 6 ROTO_TARGET
// visual : 0 ESP32_CHIP, 1 SATURN_RING, 2 DEATH_STAR_CORE, 3 SUN_WHEEL, 4 EM_ROTO_BELL, 5 VOLCANO,
//          6 SALOON_DOORS, 7 PUMPKIN_KING, 8 RIBBON_VORTEX, 9 LOLLIPOP_WHEEL, 10 RAIL_TURNTABLE, 11 SARCOPHAGUS
struct ToyDef {
    uint8_t kind;
    uint8_t visual;
    float x, y, r;
    uint16_t points;
    uint8_t hitsReq;
    uint32_t reward;
    uint32_t color;
    const char* name;
};

struct TableDef {
    const char* name;
    const char* subName;
    const char* multiballName;
    uint8_t decor;            // 0..11 : identifiant de decor et de theme musical
    uint32_t bgTop, bgBot, accent, rail, flipperCol;
    float gravity;
    uint8_t bumperCount;
    BumperDef bumpers[MAX_BUMPERS];
    uint8_t extraFlipperCount;
    ExtraFlipperDef extraFlippers[2];
    RampDef ramps[2];
    VukDef vuk;
    Vec2 lockPos;
    float lockRadius;
    MissionDef missions[3];
    Vec2 missionPos;          // centre du cartouche des 3 gemmes de mission
    RolloverDef rollovers[MAX_ROLLOVERS];
    uint8_t housingCount;     // boitiers biseautes pleins (collision identique au moteur Web)
    HousingDef housings[6];
    uint8_t targetCount;
    TargetDef targets[MAX_TARGETS];
    uint8_t spinnerCount;
    SpinnerDef spinners[MAX_SPINNERS];
    uint8_t extraWallCount;
    ExtraWallDef extraWalls[MAX_EXTRA_WALLS];
    uint8_t extraPegCount;
    PegDef extraPegs[MAX_EXTRA_PEGS];
    UpperDeckDef upper;
    uint8_t toyCount;
    ToyDef toys[MAX_TOYS];
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
    int8_t ramp = -1;         // indice de la rampe suivie (-1 : hors rampe)
    float rampDist = 0.0f;    // distance parcourue le long de la rampe ou du conduit (px)
    float rampSpeed = 0.0f;   // vitesse le long de la rampe (px/s)
    uint8_t layer = 0;        // 0 = plateau bas, 1 = rampe/conduit aerien, 2 = etage superieur
    int8_t inVuk = -1;        // >= 0 : dans le conduit aerien VUK continu
    float vukHold = 0.0f;     // centrage bref au fond du puits avant l'ascension dans le tube
    bool rampWeak = false;    // tir trop faible : ralentit en cote puis redescend naturellement
    float entryOffX = 0.0f;   // decalage initial lisse sur les premiers pixels de rampe (0 saut)
    float entryOffY = 0.0f;
};

struct FlipperRuntime {
    bool isLeft;
    float px, py, length;
    float restRad, activeRad;
    float angleRad, prevAngleRad;
    uint8_t layer = 0;
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
    PegDef pegs[MAX_PEGS];
    uint8_t pegCount = 0;
    float wallFlash[MAX_WALLS] = {};
    float bumperFlash[MAX_BUMPERS] = {};
    float upperBumperFlash[MAX_UPPER_BMPS] = {};
    uint16_t targetDownMask = 0;         // bit k = cible tombante k abattue
    uint16_t targetLitMask = 0;          // bit k = lampe de la cible k allumee
    float bankResetTimer[4] = {};        // remontee differee des banques de cibles DROP
    uint8_t upperTargetLitMask = 0;
    uint8_t upperRollLit = 0;
    float spinnerAngle[MAX_SPINNERS] = {};
    float spinnerVel[MAX_SPINNERS] = {};
    float vukFlash = 0.0f;

    float toyAngle[MAX_TOYS] = {};
    float toySpin[MAX_TOYS] = {};
    float toyOpen[MAX_TOYS] = {};
    float toyFlash[MAX_TOYS] = {};
    float toyActive[MAX_TOYS] = {};
    float toyCool[MAX_TOYS] = {};
    uint8_t toyHits[MAX_TOYS] = {};

    uint8_t huntSlot = 0;
    uint16_t huntHits = 0;
    float huntFlash = 0.0f;
    uint8_t litBumper = 0;
    uint8_t bonusMult = 1;

    uint32_t score = 0;
    uint32_t highScores[TABLE_COUNT] = {
        25000, 25000, 25000, 25000, 25000, 25000,
        25000, 25000, 25000, 25000, 25000, 25000
    };
    uint8_t ballsRemaining = 3;
    uint8_t lockedBalls = 0;
    bool multiballActive = false;
    bool lockLit = false;                // le puits ne capture que lorsqu'il est allume (5 touches de bumpers ou banque MULTIBALL)
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
    void triggerMultiball(Ball* triggerBall);
    void advanceMission(uint8_t kind);
    void collideBallSegment(Ball& b, float x1, float y1, float x2, float y2, float restitution,
                            float extraKick, int wallIndex, float thick = 0.0f);
    void collideBallPeg(Ball& b, float px, float py, float pr, float restitution);
    void stepUpperBall(Ball& b, float dt, bool leftHeld, bool rightHeld);
    void stepSubstep(float dt, bool leftHeld, bool rightHeld);
    void updatePlaying(float dt, const Input& in, bool nudgePressed, bool launchEdgeFlipper);
    void updateCamera(float dt);
    void commitScore();
    void requestConfirm(uint8_t action);
    void touchHud() { hudRevision++; }
};

} // namespace pinball
