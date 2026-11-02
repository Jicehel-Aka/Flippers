#include <Arduino.h>
#include <math.h>
#include "aka_hal.h"

// ============================================================================
// Gamebuino AKA Pinball - Moteur Physique & Graphique Embarqué ESP32
// Écran tourné à 90° droite : 240x320 (HUD supérieur 240x46 + Vue 240x274)
// Plateau équilibré : 240x520 px | 4 Tables | Missions | Multibille x3
// ============================================================================

static constexpr int SCREEN_W  = 240;
static constexpr int SCREEN_H  = 320;
static constexpr int HUD_H     = 46;
static constexpr int VIEW_H    = SCREEN_H - HUD_H; // 274 px
static constexpr int BAND_H    = 137;              // 2 bandes DMA de 137 px = 274 px (< 90 Ko RAM)
static constexpr int WORLD_W   = 240;
static constexpr int WORLD_H   = 520;
static constexpr float MAX_CAM_Y     = (float)(WORLD_H - VIEW_H); // 246.0f
static constexpr float OVERVIEW_ZOOM = (float)VIEW_H / (float)WORLD_H; // ~0.5269f
static constexpr float BALL_RADIUS   = 5.2f;
static constexpr int MAX_BALLS       = 3;

struct Vec2 {
  float x, y;
};

struct Segment {
  float x1, y1, x2, y2;
  float bounce;
  uint16_t color;
};

struct BumperDef {
  float x, y, r;
  uint16_t fillCol, rimCol;
  uint16_t points;
};

struct ExtraFlipperDef {
  bool isLeft;
  float px, py, length;
  float restDeg, activeDeg;
};

struct RampWaypoints {
  Vec2 pts[5];
  bool wireform;
  uint16_t color;
};

struct MissionDef {
  const char* title;
  uint8_t kind; // 0: Bumpers, 1: Rampes, 2: Cibles/Orbites
  uint8_t goal;
  uint32_t reward;
};

struct TableDef {
  const char* name;
  const char* subName;
  uint16_t bgTop, bgBot, accent, railCol, flipperCol;
  BumperDef bumpers[5];
  uint8_t bumperCount;
  ExtraFlipperDef extraFlippers[2];
  uint8_t extraFlipperCount;
  RampWaypoints ramps[2];
  Vec2 lockPos;
  MissionDef missions[3];
};

static uint16_t rgb565(uint8_t r, uint8_t g, uint8_t b) {
  return ((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3);
}

// ============================================================================
// Définition des 4 architectures de plateaux distinctes (240 x 520)
// ============================================================================
static TableDef TABLES[4];

static void initTables() {
  // 1. Gamebuino AKA · ESP32 : 4 flippers symétriques + grappe asymétrique haut-gauche
  TABLES[0] = {
    "AKA ESP32",
    "4 Flippers Cyber-Deck",
    rgb565(7, 24, 52), rgb565(4, 14, 32), rgb565(250, 204, 21), rgb565(56, 189, 248), rgb565(239, 68, 68),
    {
      {64, 114, 13, rgb565(220, 38, 38), rgb565(254, 202, 202), 300},
      {106, 98, 13, rgb565(37, 99, 235), rgb565(191, 219, 254), 300},
      {84, 146, 12, rgb565(234, 179, 8), rgb565(254, 240, 138), 400},
      {122, 238, 15, rgb565(14, 165, 233), rgb565(224, 242, 254), 550},
      {0, 0, 0, 0, 0, 0}
    },
    4,
    {
      {true,  25, 174, 25,  24.0f, -28.0f},
      {false, 191, 174, 25, 156.0f, 208.0f}
    },
    2,
    {
      {{{36, 314}, {26, 238}, {32, 138}, {68, 80}, {108, 92}}, false, rgb565(56, 189, 248)},
      {{{178, 304}, {192, 224}, {178, 128}, {132, 96}, {46, 376}}, true, rgb565(226, 232, 240)}
    },
    {160, 118},
    {
      {"BUS SPI", 1, 2, 15000},
      {"CLOCK 240MHZ", 0, 10, 20000},
      {"OTA FLASH", 2, 4, 30000}
    }
  };

  // 2. Odyssée Spatiale : 3 flippers (fronde orbitale gauche) + constellation diamant
  TABLES[1] = {
    "ODYSSEE SPATIALE",
    "3 Flippers & Constellation",
    rgb565(10, 22, 64), rgb565(5, 12, 38), rgb565(251, 191, 36), rgb565(96, 165, 250), rgb565(249, 115, 22),
    {
      {108, 112, 12, rgb565(239, 68, 68), rgb565(254, 202, 202), 300},
      {72,  154, 13, rgb565(59, 130, 246), rgb565(191, 219, 254), 350},
      {144, 154, 13, rgb565(59, 130, 246), rgb565(191, 219, 254), 350},
      {108, 162, 15, rgb565(245, 158, 11), rgb565(254, 243, 199), 600},
      {108, 206, 12, rgb565(239, 68, 68), rgb565(254, 202, 202), 350}
    },
    5,
    {
      {true, 44, 256, 26, 26.0f, -30.0f},
      {false, 0, 0, 0, 0, 0}
    },
    1,
    {
      {{{36, 336}, {24, 232}, {38, 118}, {108, 66}, {176, 116}}, false, rgb565(96, 165, 250)},
      {{{168, 252}, {188, 178}, {154, 116}, {94, 236}, {46, 376}}, true, rgb565(253, 224, 71)}
    },
    {152, 98},
    {
      {"ALLUMAGE APOLLO", 1, 2, 15000},
      {"CHAMP ASTEROIDES", 0, 12, 22000},
      {"ARRIMAGE ISS", 2, 4, 32000}
    }
  };

  // 3. Galaxie Stellaire : 4 flippers (double assaut droit) + sabres croisés en X
  TABLES[2] = {
    "GALAXIE STELLAIRE",
    "Double Assaut Droit & Sabres X",
    rgb565(8, 10, 26), rgb565(4, 6, 16), rgb565(248, 113, 113), rgb565(96, 165, 250), rgb565(220, 38, 38),
    {
      {64,  112, 14, rgb565(220, 38, 38), rgb565(254, 202, 202), 450},
      {152, 112, 14, rgb565(37, 99, 235), rgb565(191, 219, 254), 450},
      {108, 142, 16, rgb565(71, 85, 105), rgb565(226, 232, 240), 650},
      {0, 0, 0, 0, 0, 0},
      {0, 0, 0, 0, 0, 0}
    },
    3,
    {
      {false, 190, 154, 24, 155.0f, 206.0f},
      {false, 188, 282, 26, 154.0f, 208.0f}
    },
    2,
    {
      {{{38, 330}, {76, 244}, {122, 178}, {168, 108}, {170, 376}}, false, rgb565(239, 68, 68)},
      {{{176, 330}, {138, 244}, {92, 178}, {48, 108}, {46, 376}}, true, rgb565(59, 130, 246)}
    },
    {108, 92},
    {
      {" ESCADRON ROGUE", 1, 3, 18000},
      {"BOUCLIER DEFLECT.", 0, 10, 22000},
      {"COEUR REACTEUR", 2, 5, 35000}
    }
  };

  // 4. Temple Solaire : 4 flippers en terrasses diagonales + Serpent Quetzal en S
  TABLES[3] = {
    "TEMPLE SOLAIRE",
    "Terrasses Maya & Serpent S",
    rgb565(28, 18, 8), rgb565(16, 10, 4), rgb565(250, 204, 21), rgb565(16, 185, 129), rgb565(245, 158, 11),
    {
      {64,  106, 13, rgb565(16, 185, 129), rgb565(167, 243, 208), 400},
      {94,  134, 12, rgb565(16, 185, 129), rgb565(167, 243, 208), 400},
      {152, 224, 14, rgb565(234, 179, 8),  rgb565(254, 240, 138), 450},
      {124, 256, 13, rgb565(217, 119, 6),  rgb565(253, 230, 138), 450},
      {0, 0, 0, 0, 0, 0}
    },
    4,
    {
      {true,  26, 204, 26,  24.0f, -28.0f},
      {false, 186, 298, 25, 156.0f, 208.0f}
    },
    2,
    {
      {{{44, 342}, {104, 268}, {52, 188}, {126, 112}, {170, 376}}, false, rgb565(16, 185, 129)},
      {{{176, 244}, {188, 154}, {148, 86}, {76, 86}, {46, 376}}, true, rgb565(250, 204, 21)}
    },
    {108, 96},
    {
      {"SERPENT QUETZAL", 1, 2, 16000},
      {"OFFRANDE SOLAIRE", 0, 11, 22000},
      {"ECLIPSE D'OR", 2, 4, 34000}
    }
  };
}

// ============================================================================
// État dynamique du moteur de jeu
// ============================================================================
struct Ball {
  float x, y, vx, vy;
  bool active;
  bool inShooter;
  uint8_t rampCool;
};

struct FlipperRuntime {
  bool isLeft;
  float px, py, length;
  float restRad, activeRad;
  float angleRad, prevAngleRad;
};

static AkaHardware hw;
static LGFX_Sprite hudSpr(&hw.lcd);
static LGFX_Sprite bandSpr(&hw.lcd);

static uint8_t currentTableIdx = 0;
static bool inMenuOverlay = true;

static Ball balls[MAX_BALLS];
static FlipperRuntime flippers[4];
static uint8_t flipperCount = 2;

static Segment walls[26];
static uint8_t wallCount = 0;

static uint32_t score = 0;
static uint32_t highScores[4] = {25000, 25000, 25000, 25000};
static uint8_t ballsRemaining = 3;
static uint8_t lockedBalls = 0;
static bool multiballActive = false;

static uint8_t missionIdx = 0;
static uint8_t missionProgress = 0;

static float plungerCharge = 0.0f;
static bool plungerHeldPrev = false;

static float tiltMeter = 0.0f;
static bool isTilted = false;

static float cameraY = MAX_CAM_Y;
static float cameraZoom = OVERVIEW_ZOOM;
static float introTimer = 2.35f;

static const char* bannerText = "";
static float bannerTimer = 0.0f;

static void showBanner(const char* txt, float sec = 1.6f) {
  bannerText = txt;
  bannerTimer = sec;
}

static void buildStaticWalls() {
  wallCount = 0;
  auto addW = [](float x1, float y1, float x2, float y2, float b, uint16_t c) {
    if (wallCount < 26) walls[wallCount++] = {x1, y1, x2, y2, b, c};
  };

  uint16_t steel = rgb565(148, 163, 184);
  uint16_t gold  = rgb565(250, 204, 21);

  // Arche supérieure et murs extérieurs sans piège
  addW(14, 496, 14, 68, 0.55f, steel);
  addW(14, 68, 42, 26, 0.55f, steel);
  addW(42, 26, 108, 14, 0.55f, steel);
  addW(108, 14, 186, 26, 0.55f, steel);
  addW(186, 26, 232, 68, 0.55f, steel);
  addW(232, 68, 232, 496, 0.55f, steel);

  // Couloir du lance-bille (x: 210..232) + clapet anti-retour haut
  addW(210, 108, 210, 496, 0.5f, steel);
  addW(210, 492, 232, 492, 0.2f, gold);

  // Caissons biseautés à 45° (aucun coin plat où coincer la bille)
  addW(14, 278, 28, 294, 0.75f, gold);
  addW(28, 294, 28, 336, 0.85f, gold);
  addW(28, 336, 14, 352, 0.65f, gold);

  addW(210, 278, 196, 294, 0.75f, gold);
  addW(196, 294, 196, 336, 0.85f, gold);
  addW(196, 336, 210, 352, 0.65f, gold);

  // Couloirs inlanes / outlanes larges (18 px de passage franc)
  addW(32, 392, 32, 444, 0.5f, steel);
  addW(32, 444, 62, 464, 0.45f, steel);
  addW(14, 462, 56, 502, 0.4f, steel);

  addW(184, 392, 184, 444, 0.5f, steel);
  addW(184, 444, 154, 464, 0.45f, steel);
  addW(210, 462, 160, 502, 0.4f, steel);

  // Slingshots triangulaires relevés (35 px au-dessus des flippers)
  addW(46, 388, 46, 424, 0.6f, steel);
  addW(46, 424, 68, 434, 0.6f, steel);
  addW(46, 388, 68, 434, 1.35f, rgb565(248, 113, 113));

  addW(170, 388, 170, 424, 0.6f, steel);
  addW(170, 424, 148, 434, 0.6f, steel);
  addW(170, 388, 148, 434, 1.35f, rgb565(248, 113, 113));
}

static void setupFlippersForTable(const TableDef& t) {
  flipperCount = 0;
  // Paire basse principale
  flippers[flipperCount++] = {true,  62.0f,  464.0f, 38.0f,  26.0f * DEG_TO_RAD, -31.0f * DEG_TO_RAD,  26.0f * DEG_TO_RAD,  26.0f * DEG_TO_RAD};
  flippers[flipperCount++] = {false, 154.0f, 464.0f, 38.0f, 154.0f * DEG_TO_RAD, 211.0f * DEG_TO_RAD, 154.0f * DEG_TO_RAD, 154.0f * DEG_TO_RAD};

  for (uint8_t i = 0; i < t.extraFlipperCount; i++) {
    const auto& ef = t.extraFlippers[i];
    if (ef.length <= 1.0f) continue;
    float rRad = ef.restDeg * DEG_TO_RAD;
    float aRad = ef.activeDeg * DEG_TO_RAD;
    flippers[flipperCount++] = {ef.isLeft, ef.px, ef.py, ef.length, rRad, aRad, rRad, rRad};
  }
}

static void spawnBallInShooter(int idx) {
  balls[idx] = {221.0f, 478.0f, 0.0f, 0.0f, true, true, 0};
}

static void advanceMission(uint8_t eventKind) {
  const TableDef& t = TABLES[currentTableIdx];
  const MissionDef& m = t.missions[missionIdx % 3];
  if (m.kind != eventKind) return;

  missionProgress++;
  if (missionProgress >= m.goal) {
    score += m.reward;
    missionProgress = 0;
    missionIdx++;
    hw.playBeep(1320, 90);
    if (missionIdx % 3 == 0) {
      score += 100000;
      showBanner("FINALE MAITRE +100K!", 2.2f);
    } else {
      showBanner("MISSION ACCOMPLIE!", 1.8f);
    }
  }
}

static void startNewGame(uint8_t tableIndex) {
  currentTableIdx = tableIndex % 4;
  buildStaticWalls();
  setupFlippersForTable(TABLES[currentTableIdx]);

  for (int i = 0; i < MAX_BALLS; i++) {
    balls[i] = {0, 0, 0, 0, false, false, 0};
  }
  spawnBallInShooter(0);

  score = 0;
  ballsRemaining = 3;
  lockedBalls = 0;
  multiballActive = false;
  missionIdx = 0;
  missionProgress = 0;
  tiltMeter = 0.0f;
  isTilted = false;

  // Vue d'ensemble intégrale à l'arrivée sur le flipper puis zoom progressif
  cameraZoom = OVERVIEW_ZOOM;
  cameraY = MAX_CAM_Y;
  introTimer = 2.35f;
  inMenuOverlay = false;
  showBanner(TABLES[currentTableIdx].name, 2.0f);
  hw.playBeep(880, 75);
}

static void collideBallSegment(Ball& b, float x1, float y1, float x2, float y2, float restitution, float extraKick = 0.0f) {
  float dx = x2 - x1;
  float dy = y2 - y1;
  float lenSq = dx * dx + dy * dy;
  if (lenSq < 0.001f) return;

  float t = ((b.x - x1) * dx + (b.y - y1) * dy) / lenSq;
  t = constrain(t, 0.0f, 1.0f);
  float cx = x1 + t * dx;
  float cy = y1 + t * dy;

  float nx = b.x - cx;
  float ny = b.y - cy;
  float distSq = nx * nx + ny * ny;
  if (distSq >= BALL_RADIUS * BALL_RADIUS || distSq < 0.0001f) return;

  float dist = sqrtf(distSq);
  nx /= dist;
  ny /= dist;

  float overlap = BALL_RADIUS - dist;
  b.x += nx * overlap;
  b.y += ny * overlap;

  float vn = b.vx * nx + b.vy * ny;
  if (vn < 0.0f) {
    float impulse = -(1.0f + restitution) * vn + extraKick;
    b.vx += nx * impulse;
    b.vy += ny * impulse;
    if (restitution > 1.1f) {
      score += 120;
      advanceMission(2);
      hw.playBeep(740, 28);
    }
  }
}

static void stepPhysicsSubstep(float dt) {
  const TableDef& tbl = TABLES[currentTableIdx];

  bool leftHeld  = !isTilted && hw.btn.a;
  bool rightHeld = !isTilted && hw.btn.d;

  for (uint8_t f = 0; f < flipperCount; f++) {
    FlipperRuntime& fl = flippers[f];
    fl.prevAngleRad = fl.angleRad;
    bool active = fl.isLeft ? leftHeld : rightHeld;
    float target = active ? fl.activeRad : fl.restRad;
    float speed = active ? 26.0f : 16.0f;
    float diff = target - fl.angleRad;
    float maxStep = speed * dt;
    if (fabsf(diff) <= maxStep) fl.angleRad = target;
    else fl.angleRad += (diff > 0 ? maxStep : -maxStep);
  }

  for (int i = 0; i < MAX_BALLS; i++) {
    Ball& b = balls[i];
    if (!b.active) continue;

    b.vy += 310.0f * dt; // Gravité arcade fluide
    b.x  += b.vx * dt;
    b.y  += b.vy * dt;

    b.inShooter = (b.x > 210.0f && b.y > 120.0f);

    // Clapet anti-retour en haut du couloir lanceur
    if (!b.inShooter && b.x > 204.0f && b.y < 115.0f && b.vy > 0.0f) {
      b.vx = -fabsf(b.vx) - 45.0f;
    }

    // Murs et slingshots
    for (uint8_t w = 0; w < wallCount; w++) {
      collideBallSegment(b, walls[w].x1, walls[w].y1, walls[w].x2, walls[w].y2, walls[w].bounce);
    }

    // Flippers dynamiques
    for (uint8_t f = 0; f < flipperCount; f++) {
      const FlipperRuntime& fl = flippers[f];
      float ex = fl.px + cosf(fl.angleRad) * fl.length;
      float ey = fl.py + sinf(fl.angleRad) * fl.length;
      float angVel = fabsf(fl.angleRad - fl.prevAngleRad) / dt;
      float kick = (angVel > 1.5f) ? 235.0f : 0.0f;
      collideBallSegment(b, fl.px, fl.py, ex, ey, 0.58f, kick);
    }

    // Bumpers
    for (uint8_t k = 0; k < tbl.bumperCount; k++) {
      const BumperDef& bmp = tbl.bumpers[k];
      float dx = b.x - bmp.x;
      float dy = b.y - bmp.y;
      float minD = BALL_RADIUS + bmp.r;
      float d2 = dx * dx + dy * dy;
      if (d2 < minD * minD && d2 > 0.001f) {
        float d = sqrtf(d2);
        dx /= d;
        dy /= d;
        b.x = bmp.x + dx * minD;
        b.y = bmp.y + dy * minD;
        b.vx = dx * 235.0f;
        b.vy = dy * 235.0f;
        score += bmp.points;
        advanceMission(0);
        hw.playBeep(980 + k * 90, 26);
      }
    }

    // Entrées de rampes 3D (propulsion guidée vers la sortie)
    if (b.rampCool == 0 && b.vy < -55.0f) {
      for (uint8_t r = 0; r < 2; r++) {
        Vec2 entry = tbl.ramps[r].pts[0];
        Vec2 exitP = tbl.ramps[r].pts[4];
        float dx = b.x - entry.x;
        float dy = b.y - entry.y;
        if (dx * dx + dy * dy < 16.0f * 16.0f) {
          b.x = exitP.x;
          b.y = exitP.y;
          b.vx = 0.0f;
          b.vy = 95.0f;
          b.rampCool = 45;
          score += 2500;
          advanceMission(1);
          showBanner("RAMPE +2500!", 1.1f);
          hw.playBeep(1480, 60);
          break;
        }
      }
    }

    // Puits de capture Multibille x3 (2 verrous -> 3 billes simultanées)
    if (!multiballActive && b.rampCool == 0) {
      float dx = b.x - tbl.lockPos.x;
      float dy = b.y - tbl.lockPos.y;
      if (dx * dx + dy * dy < 11.5f * 11.5f) {
        lockedBalls++;
        score += 5000;
        if (lockedBalls >= 2) {
          lockedBalls = 0;
          multiballActive = true;
          b.vx = -110.0f;
          b.vy = -130.0f;
          b.rampCool = 50;
          balls[1] = {tbl.lockPos.x - 10.0f, tbl.lockPos.y + 8.0f, -95.0f, 70.0f, true, false, 40};
          balls[2] = {tbl.lockPos.x + 10.0f, tbl.lockPos.y + 8.0f,  95.0f, 80.0f, true, false, 40};
          showBanner("MULTIBILLE X3!", 2.2f);
          hw.playBeep(1660, 120);
        } else {
          showBanner("BILLE VERROUILLEE 1/2", 1.6f);
          spawnBallInShooter(i);
          hw.playBeep(1180, 80);
        }
      }
    }

    // Perte de bille en bas (y > 516)
    if (b.y > WORLD_H - 4.0f) {
      b.active = false;
    }

    float spd = sqrtf(b.vx * b.vx + b.vy * b.vy);
    if (spd > 560.0f) {
      b.vx = (b.vx / spd) * 560.0f;
      b.vy = (b.vy / spd) * 560.0f;
    }
  }
}

static void updateGameFrame(float dt) {
  if (bannerTimer > 0.0f) bannerTimer = max(0.0f, bannerTimer - dt);
  if (score > highScores[currentTableIdx]) highScores[currentTableIdx] = score;

  // Gestion du ressort R1
  bool anyInShooter = false;
  for (int i = 0; i < MAX_BALLS; i++) {
    if (balls[i].active && balls[i].inShooter) anyInShooter = true;
    if (balls[i].active && balls[i].rampCool > 0) balls[i].rampCool--;
  }

  if (hw.btn.r1 && anyInShooter) {
    plungerCharge = min(1.0f, plungerCharge + dt * 1.15f);
  } else if (plungerHeldPrev && !hw.btn.r1 && anyInShooter) {
    float launchVy = -(360.0f + plungerCharge * 220.0f);
    for (int i = 0; i < MAX_BALLS; i++) {
      if (balls[i].active && balls[i].inShooter) {
        balls[i].vy = launchVy;
        balls[i].vx = -18.0f;
      }
    }
    plungerCharge = 0.0f;
    introTimer = 0.0f; // Passe immédiatement en zoom jeu au tir
    hw.playBeep(520, 55);
  } else {
    plungerCharge = max(0.0f, plungerCharge - dt * 3.0f);
  }
  plungerHeldPrev = hw.btn.r1;

  // Secousse physique (Bouton B) & jauge de TILT
  tiltMeter = max(0.0f, tiltMeter - dt * 0.55f);
  if (hw.btn.bPressed && !isTilted) {
    tiltMeter += 1.05f;
    for (int i = 0; i < MAX_BALLS; i++) {
      if (balls[i].active && !balls[i].inShooter) {
        balls[i].vx += (balls[i].x < 112.0f) ? 55.0f : -55.0f;
        balls[i].vy -= 42.0f;
      }
    }
    hw.playBeep(260, 35);
    if (tiltMeter >= 2.85f) {
      isTilted = true;
      showBanner("TILT! FLIPPERS BLOQUES", 2.0f);
    }
  }

  // 6 sous-pas physiques par frame (360 Hz sur ESP32)
  const int substeps = 6;
  for (int s = 0; s < substeps; s++) {
    stepPhysicsSubstep(dt / (float)substeps);
  }

  // Compte des billes actives & relance
  int activeCount = 0;
  for (int i = 0; i < MAX_BALLS; i++) {
    if (balls[i].active) activeCount++;
  }
  if (multiballActive && activeCount <= 1) {
    multiballActive = false;
  }
  if (activeCount == 0) {
    isTilted = false;
    tiltMeter = 0.0f;
    if (ballsRemaining > 1) {
      ballsRemaining--;
      spawnBallInShooter(0);
      showBanner("NOUVELLE BILLE", 1.4f);
    } else {
      showBanner("FIN DE PARTIE!", 2.2f);
      inMenuOverlay = true;
    }
  }

  // Zoom progressif d'arrivée (vue d'ensemble -> mode jeu 1.0x)
  if (introTimer > 0.0f) {
    introTimer = max(0.0f, introTimer - dt);
    float progress = 1.0f - (introTimer / 2.35f);
    if (progress < 0.34f) {
      cameraZoom = OVERVIEW_ZOOM;
    } else {
      float u = constrain((progress - 0.34f) / 0.66f, 0.0f, 1.0f);
      float ease = u * u * (3.0f - 2.0f * u);
      cameraZoom = OVERVIEW_ZOOM + (1.0f - OVERVIEW_ZOOM) * ease;
    }
  } else {
    cameraZoom = 1.0f;
  }

  // Caméra intelligente : suit TOUJOURS la bille active la plus basse (plus grand Y)
  int lowestIdx = -1;
  for (int i = 0; i < MAX_BALLS; i++) {
    if (!balls[i].active) continue;
    if (lowestIdx < 0) {
      lowestIdx = i;
    } else {
      bool curPlay = !balls[lowestIdx].inShooter;
      bool candPlay = !balls[i].inShooter;
      if (candPlay && !curPlay) lowestIdx = i;
      else if (candPlay == curPlay && balls[i].y > balls[lowestIdx].y) lowestIdx = i;
    }
  }

  if (lowestIdx >= 0) {
    const Ball& lb = balls[lowestIdx];
    float visibleWorldH = VIEW_H / cameraZoom;
    float maxCamForZoom = max(0.0f, (float)WORLD_H - visibleWorldH);
    float targetCam = constrain(lb.y - visibleWorldH * 0.56f, 0.0f, maxCamForZoom);
    if (lb.y > 350.0f) targetCam = maxCamForZoom;
    cameraY += (targetCam - cameraY) * min(1.0f, dt * 14.0f);
    float hardFloor = min(maxCamForZoom, lb.y - (visibleWorldH - 42.0f));
    if (cameraY < hardFloor) cameraY = hardFloor;
    cameraY = constrain(cameraY, 0.0f, maxCamForZoom);
  }
}

// ============================================================================
// Rendu 60 FPS sans scintillement (HUD 240x46 + 2 bandes 240x137 DMA)
// ============================================================================
static void renderHud() {
  const TableDef& tbl = TABLES[currentTableIdx];
  hudSpr.fillSprite(rgb565(9, 13, 22));
  hudSpr.drawFastHLine(0, HUD_H - 1, SCREEN_W, tbl.accent);

  hudSpr.setTextColor(tbl.accent);
  hudSpr.setTextSize(1);
  hudSpr.setCursor(6, 5);
  hudSpr.printf("%s", tbl.name);

  hudSpr.setTextColor(TFT_WHITE);
  hudSpr.setCursor(164, 5);
  hudSpr.printf("BILLE %u/3", ballsRemaining);

  hudSpr.setTextSize(2);
  hudSpr.setTextColor(TFT_WHITE);
  hudSpr.setCursor(6, 17);
  hudSpr.printf("%07lu", (unsigned long)score);

  hudSpr.setTextSize(1);
  const MissionDef& m = tbl.missions[missionIdx % 3];
  hudSpr.setTextColor(multiballActive ? rgb565(52, 211, 153) : rgb565(148, 163, 184));
  hudSpr.setCursor(108, 20);
  if (multiballActive) {
    hudSpr.printf("MULTIBILLE X3!");
  } else {
    hudSpr.printf("M%u:%u/%u L:%u/2", (missionIdx % 3) + 1, missionProgress, m.goal, lockedBalls);
  }

  hudSpr.setTextColor(rgb565(250, 204, 21));
  hudSpr.setCursor(108, 32);
  hudSpr.printf("%s", m.title);

  hudSpr.pushSprite(0, 0);
}

static void renderPlayfieldBand(int bandIndex) {
  const TableDef& tbl = TABLES[currentTableIdx];
  int screenBandY = bandIndex * BAND_H; // 0 ou 137 dans la fenêtre de 274 px

  float zoom = cameraZoom;
  float xPad = (SCREEN_W - WORLD_W * zoom) * 0.5f;

  auto wx = [&](float x) -> int { return (int)roundf(xPad + x * zoom); };
  auto wy = [&](float y) -> int { return (int)roundf((y - cameraY) * zoom) - screenBandY; };
  auto wr = [&](float r) -> int { return max(1, (int)roundf(r * zoom)); };

  bandSpr.fillSprite(bandIndex == 0 ? tbl.bgTop : tbl.bgBot);

  // Grille subtile du plateau
  uint16_t gridCol = rgb565(18, 32, 58);
  for (int gy = 40; gy < WORLD_H; gy += 48) {
    int sy = wy((float)gy);
    if (sy >= 0 && sy < BAND_H) {
      bandSpr.drawFastHLine(wx(16), sy, max(1, (int)(208 * zoom)), gridCol);
    }
  }

  // Rampes 3D (double rail + traverses)
  for (uint8_t r = 0; r < 2; r++) {
    const auto& rmp = tbl.ramps[r];
    for (int s = 0; s < 4; s++) {
      int x1 = wx(rmp.pts[s].x),     y1 = wy(rmp.pts[s].y);
      int x2 = wx(rmp.pts[s + 1].x), y2 = wy(rmp.pts[s + 1].y);
      int hwRail = max(2, wr(rmp.wireform ? 4.5f : 6.5f));
      bandSpr.drawLine(x1 - hwRail, y1, x2 - hwRail, y2, rmp.color);
      bandSpr.drawLine(x1 + hwRail, y1, x2 + hwRail, y2, rmp.color);
      if (!rmp.wireform) {
        bandSpr.drawLine(x1, y1, x2, y2, rgb565(30, 64, 115));
      }
    }
    // Anneau d'entrée de rampe
    bandSpr.drawCircle(wx(rmp.pts[0].x), wy(rmp.pts[0].y), wr(9.0f), tbl.accent);
  }

  // Puits Multibille Lock
  int lx = wx(tbl.lockPos.x), ly = wy(tbl.lockPos.y);
  bandSpr.fillCircle(lx, ly, wr(9.5f), rgb565(6, 78, 59));
  bandSpr.drawCircle(lx, ly, wr(10.5f), rgb565(52, 211, 153));

  // Murs & Slingshots
  for (uint8_t w = 0; w < wallCount; w++) {
    bandSpr.drawLine(wx(walls[w].x1), wy(walls[w].y1), wx(walls[w].x2), wy(walls[w].y2), walls[w].color);
  }

  // Ressort du lanceur (R1)
  int springTop = wy(488.0f - (1.0f - plungerCharge) * 14.0f);
  int springBot = wy(492.0f);
  bandSpr.fillRect(wx(214.0f), min(springTop, springBot), max(2, wr(14.0f)), max(3, abs(springBot - springTop)), rgb565(239, 68, 68));

  // Bumpers
  for (uint8_t k = 0; k < tbl.bumperCount; k++) {
    const auto& bmp = tbl.bumpers[k];
    int bx = wx(bmp.x), by = wy(bmp.y), br = wr(bmp.r);
    if (by + br < 0 || by - br >= BAND_H) continue;
    bandSpr.fillCircle(bx, by, br, bmp.fillCol);
    bandSpr.drawCircle(bx, by, br, bmp.rimCol);
    bandSpr.fillCircle(bx, by, max(1, br / 3), TFT_WHITE);
  }

  // Médaillon des 3 missions au-dessus des flippers
  int crestY = wy(430.0f);
  if (crestY >= -10 && crestY < BAND_H + 10) {
    for (int m = 0; m < 3; m++) {
      int mx = wx(92.0f + m * 16.0f);
      bool done = m < (missionIdx % 3);
      bool curr = m == (missionIdx % 3);
      uint16_t c = done ? rgb565(52, 211, 153) : (curr ? tbl.accent : rgb565(51, 65, 85));
      bandSpr.fillCircle(mx, crestY, wr(4.5f), c);
      bandSpr.drawCircle(mx, crestY, wr(4.5f), TFT_WHITE);
    }
  }

  // Flippers
  for (uint8_t f = 0; f < flipperCount; f++) {
    const auto& fl = flippers[f];
    int x1 = wx(fl.px), y1 = wy(fl.py);
    int x2 = wx(fl.px + cosf(fl.angleRad) * fl.length);
    int y2 = wy(fl.py + sinf(fl.angleRad) * fl.length);
    bandSpr.drawLine(x1, y1 - 1, x2, y2 - 1, TFT_WHITE);
    bandSpr.drawLine(x1, y1,     x2, y2,     tbl.flipperCol);
    bandSpr.drawLine(x1, y1 + 1, x2, y2 + 1, tbl.flipperCol);
    bandSpr.fillCircle(x1, y1, max(2, wr(3.5f)), tbl.accent);
  }

  // Billes chromées + indicateurs radar ▲ en haut pour le Multibille
  for (int i = 0; i < MAX_BALLS; i++) {
    if (!balls[i].active) continue;
    int bx = wx(balls[i].x);
    int by = wy(balls[i].y);
    int br = max(2, wr(BALL_RADIUS));
    if (by + br >= 0 && by - br < BAND_H) {
      bandSpr.fillCircle(bx, by, br, rgb565(226, 232, 240));
      bandSpr.fillCircle(bx - 1, by - 1, max(1, br / 3), TFT_WHITE);
    } else if (bandIndex == 0 && (balls[i].y < cameraY)) {
      bandSpr.fillTriangle(bx, 3, bx - 4, 10, bx + 4, 10, tbl.accent);
    }
  }

  // Bandeau d'annonce ou menu de sélection de plateau
  if (inMenuOverlay && bandIndex == 0) {
    bandSpr.fillRoundRect(18, 18, 204, 106, 6, rgb565(12, 18, 30));
    bandSpr.drawRoundRect(18, 18, 204, 106, 6, tbl.accent);
    bandSpr.setTextColor(tbl.accent);
    bandSpr.setTextSize(1);
    bandSpr.setCursor(30, 28);
    bandSpr.print("GAMEBUINO AKA PINBALL");
    bandSpr.setTextColor(TFT_WHITE);
    bandSpr.setCursor(30, 46);
    bandSpr.printf("< %u/4 : %s >", currentTableIdx + 1, tbl.name);
    bandSpr.setTextColor(rgb565(148, 163, 184));
    bandSpr.setCursor(30, 62);
    bandSpr.printf("%s", tbl.subName);
    bandSpr.setCursor(30, 80);
    bandSpr.printf("Record: %lu pts", (unsigned long)highScores[currentTableIdx]);
    bandSpr.setTextColor(rgb565(52, 211, 153));
    bandSpr.setCursor(30, 100);
    bandSpr.print("A/D: Table | R1 ou B: JOUER");
  } else if (bannerTimer > 0.0f && bandIndex == 0) {
    bandSpr.fillRoundRect(24, 8, 192, 22, 4, rgb565(15, 23, 42));
    bandSpr.drawRoundRect(24, 8, 192, 22, 4, tbl.accent);
    bandSpr.setTextColor(TFT_WHITE);
    bandSpr.setTextSize(1);
    bandSpr.setCursor(34, 15);
    bandSpr.print(bannerText);
  }

  bandSpr.pushSprite(0, HUD_H + screenBandY);
}

static uint32_t lastFrameUs = 0;

void setup() {
  Serial.begin(115200);
  initTables();
  hw.begin();

  hudSpr.setColorDepth(16);
  hudSpr.createSprite(SCREEN_W, HUD_H);

  bandSpr.setColorDepth(16);
  bandSpr.createSprite(SCREEN_W, BAND_H);

  startNewGame(0);
  inMenuOverlay = true;
  lastFrameUs = micros();
}

void loop() {
  uint32_t nowUs = micros();
  uint32_t elapsedUs = nowUs - lastFrameUs;
  if (elapsedUs < 16666) return; // Cadence 60 FPS régulière
  lastFrameUs = nowUs;

  float dt = min(0.033f, elapsedUs * 1e-6f);
  hw.updateInputs();

  if (hw.btn.cPressed) {
    inMenuOverlay = !inMenuOverlay;
    hw.playBeep(660, 45);
  }

  if (inMenuOverlay) {
    static uint32_t navCooldownMs = 0;
    if (millis() > navCooldownMs) {
      if (hw.btn.a || hw.btn.upPressed) {
        currentTableIdx = (currentTableIdx + 3) % 4;
        setupFlippersForTable(TABLES[currentTableIdx]);
        navCooldownMs = millis() + 200;
        hw.playBeep(540, 35);
      } else if (hw.btn.d || hw.btn.downPressed) {
        currentTableIdx = (currentTableIdx + 1) % 4;
        setupFlippersForTable(TABLES[currentTableIdx]);
        navCooldownMs = millis() + 200;
        hw.playBeep(640, 35);
      } else if (hw.btn.r1 || hw.btn.bPressed) {
        startNewGame(currentTableIdx);
      }
    }
  } else {
    updateGameFrame(dt);
  }

  renderHud();
  renderPlayfieldBand(0);
  renderPlayfieldBand(1);
}
