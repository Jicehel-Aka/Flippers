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

constexpr int TABLE_COUNT  = 4;
constexpr int MAX_BALLS    = 3;
constexpr int MAX_BUMPERS  = 6;
constexpr int MAX_WALLS    = 32;
constexpr int MAX_FLIPPERS = 4;

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

struct TableDef {
    const char* name;
    const char* subName;
    const char* multiballName;
    uint8_t decor;            // 0 circuit, 1 espace, 2 Star Wars, 3 temple
    uint32_t bgTop, bgBot, accent, rail, flipperCol;
    float gravity;
    uint8_t bumperCount;
    BumperDef bumpers[MAX_BUMPERS];
    uint8_t extraFlipperCount;
    ExtraFlipperDef extraFlippers[2];
    RampDef ramps[2];
    Vec2 lockPos;
    float lockRadius;
    MissionDef missions[3];
    Vec2 missionPos;          // centre du cartouche des 3 gemmes de mission
    RolloverDef rollovers[MAX_ROLLOVERS];
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
};

struct FlipperRuntime {
    bool isLeft;
    float px, py, length;
    float restRad, activeRad;
    float angleRad, prevAngleRad;
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
    float wallFlash[MAX_WALLS] = {};
    float bumperFlash[MAX_BUMPERS] = {};

    uint32_t score = 0;
    uint32_t highScores[TABLE_COUNT] = {25000, 25000, 25000, 25000};
    uint8_t ballsRemaining = 3;
    uint8_t lockedBalls = 0;
    bool multiballActive = false;
    bool lockLit = false;                // le puits ne capture que lorsqu'il est allume (5 touches de bumpers)
    uint8_t lockHits = 0;
    uint8_t rolloverLit = 0;             // bit i = rollover i allume (0..3 couloirs du haut, 4..5 retours)
    float rolloverFlash = 0.0f;          // clignotement de bonus quand les 4 couloirs sont completes
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
    void advanceMission(uint8_t kind);
    void collideBallSegment(Ball& b, float x1, float y1, float x2, float y2, float restitution,
                            float extraKick, int wallIndex);
    void stepSubstep(float dt, bool leftHeld, bool rightHeld);
    void updatePlaying(float dt, const Input& in, bool nudgePressed, bool launchEdgeFlipper);
    void updateCamera(float dt);
    void commitScore();
    void requestConfirm(uint8_t action);
    void touchHud() { hudRevision++; }
};

} // namespace pinball
