#include "pinball_core.h"
#include <math.h>
#include <stdarg.h>
#include <stdio.h>
#include <string.h>

namespace pinball {

#include "tables_data.inc"

const TableDef& table(int index) { return TABLES[((index % TABLE_COUNT) + TABLE_COUNT) % TABLE_COUNT]; }

static constexpr float DEG_TO_RAD_F = 0.017453292519943295f;
static inline float clampf(float v, float lo, float hi) { return v < lo ? lo : (v > hi ? hi : v); }
static inline float maxf(float a, float b) { return a > b ? a : b; }
static inline float minf(float a, float b) { return a < b ? a : b; }

static constexpr uint32_t STEEL = 0x94A3B8;
static constexpr uint32_t GOLD  = 0xFACC15;
static constexpr uint32_t SLING = 0xF87171;

Game::Game() {
    for (int i = 0; i < MAX_BALLS; i++) balls[i] = {0, 0, 0, 0, false, false, 0.0f, 0.0f};
}

void Game::begin(const HighScoreStore& store) {
    store_ = store;
    if (store_.load) store_.load(highScores);
    tableIdx = 0;
    startNewGame(0);
    state = State::Menu;   // on arrive sur la selection de table
    touchHud();
}

bool Game::popSfx(SfxEvent& out) {
    if (sfxHead_ == sfxTail_) return false;
    out = sfxQueue_[sfxTail_];
    sfxTail_ = (uint8_t)((sfxTail_ + 1) % 24);
    return true;
}

void Game::emit(Sfx id, uint8_t arg) {
    uint8_t next = (uint8_t)((sfxHead_ + 1) % 24);
    if (next == sfxTail_) return;   // file pleine : on perd le son, jamais le jeu
    sfxQueue_[sfxHead_] = {id, arg};
    sfxHead_ = next;
}

void Game::showBanner(const char* txt, float sec) {
    size_t i = 0;
    for (; txt[i] && i < sizeof(bannerText) - 1; i++) bannerText[i] = txt[i];
    bannerText[i] = 0;
    bannerTimer = sec;
}

void Game::bannerf(float sec, const char* fmt, ...) {
    va_list ap;
    va_start(ap, fmt);
    vsnprintf(bannerText, sizeof(bannerText), fmt, ap);
    va_end(ap);
    bannerTimer = sec;
}

void Game::buildStaticWalls() {
    wallCount = 0;
    auto addSeg = [this](float x1, float y1, float x2, float y2, float b, uint32_t c, bool scoring) {
        if (wallCount < MAX_WALLS) walls[wallCount++] = {x1, y1, x2, y2, b, c, scoring};
    };
    auto addW = [&](float x1, float y1, float x2, float y2, float b, uint32_t c) { addSeg(x1, y1, x2, y2, b, c, false); };

    // Geometrie identique au moteur Web (monde 240x520) : les bords collisionnent exactement la ou le decor les dessine.
    // Arche elliptique (9,72) -> (233,72), centre (121,72), rayons 112 x 58
    {
        const int N = 28;
        float px = 121.0f + 112.0f * cosf(3.14159265f), py = 72.0f - 58.0f * sinf(3.14159265f);
        for (int i = 1; i <= N; i++) {
            const float th = 3.14159265f - ((float)i / (float)N) * 3.14159265f;
            const float x = 121.0f + 112.0f * cosf(th), y = 72.0f - 58.0f * sinf(th);
            addW(px, py, x, y, 0.45f, STEEL);
            px = x; py = y;
        }
    }
    // separateurs des couloirs du haut
    addW(83, 41, 83, 59, 0.45f, STEEL);
    addW(113, 41, 113, 59, 0.45f, STEEL);
    addW(143, 41, 143, 59, 0.45f, STEEL);

    // murs exterieurs, couloir du lance-bille (x: 217..233) ; le clapet haut est gere dans stepSubstep
    addW(9, 72, 9, 452, 0.48f, STEEL);
    addW(233, 72, 233, 514, 0.4f, STEEL);
    addW(217, 514, 233, 514, 0.2f, GOLD);
    addW(217, 86, 217, 516, 0.48f, STEEL);

    // tabliers de drain et couloirs inlanes / outlanes
    addW(9, 452, 89, 504, 0.35f, STEEL);
    addW(217, 452, 137, 504, 0.35f, STEEL);
    addW(27, 384, 27, 438, 0.45f, STEEL);
    addW(27, 438, 72, 468, 0.28f, STEEL);
    addW(199, 384, 199, 438, 0.45f, STEEL);
    addW(199, 438, 154, 468, 0.28f, STEEL);

    // slingshots triangulaires
    addW(45, 376, 45, 416, 0.5f, STEEL);
    addW(45, 416, 70, 431, 0.5f, STEEL);
    addSeg(45, 376, 70, 431, 1.35f, SLING, true);
    addW(181, 376, 181, 416, 0.5f, STEEL);
    addW(181, 416, 156, 431, 0.5f, STEEL);
    addSeg(181, 376, 156, 431, 1.35f, SLING, true);

    // boitiers biseautes de la table (polygones du decor) : meme exclusion des aretes collees aux parois que le Web
    const TableDef& td = tbl();
    for (uint8_t h = 0; h < td.housingCount; h++) {
        const HousingDef& hd = td.housings[h];
        for (uint8_t i = 0; i < hd.n; i++) {
            const Vec2 a = hd.p[i], c = hd.p[(i + 1) % hd.n];
            const bool flushL = fabsf(a.x - 9.0f) < 0.2f && fabsf(c.x - 9.0f) < 0.2f;
            const bool flushR = fabsf(a.x - 217.0f) < 0.2f && fabsf(c.x - 217.0f) < 0.2f;
            if (!flushL && !flushR) addW(a.x, a.y, c.x, c.y, 0.44f, GOLD);
        }
    }
    // murs supplementaires du plateau (editeur / JSON)
    for (uint8_t k = 0; k < td.xwallCount; k++) {
        const XWallDef& xw = td.xwalls[k];
        addW(xw.x1, xw.y1, xw.x2, xw.y2, xw.bounce, STEEL);
    }
    // rebords fermes de l'etage superieur (les aretes ouvertes laissent retomber la bille)
    upWallCount = 0;
    if (td.upper.present) {
        const UpperDeckDef& ud = td.upper;
        for (uint8_t i = 0; i < ud.n && upWallCount < 6; i++) {
            if (ud.openMask & (1u << i)) continue;
            const Vec2 a = ud.b[i], c = ud.b[(i + 1) % ud.n];
            upWalls[upWallCount++] = {a.x, a.y, c.x, c.y, 0.46f, ud.border, false};
        }
    }
    for (int i = 0; i < MAX_WALLS; i++) wallFlash[i] = 0.0f;
}

void Game::setupFlippers() {
    flipperCount = 0;
    flippers[flipperCount++] = {true,  72.0f,  468.0f, 34.0f,  25.2f * DEG_TO_RAD_F, -28.6f * DEG_TO_RAD_F,  25.2f * DEG_TO_RAD_F,  25.2f * DEG_TO_RAD_F};
    flippers[flipperCount++] = {false, 154.0f, 468.0f, 34.0f, 154.8f * DEG_TO_RAD_F, 208.6f * DEG_TO_RAD_F, 154.8f * DEG_TO_RAD_F, 154.8f * DEG_TO_RAD_F};
    const TableDef& t = tbl();
    for (uint8_t i = 0; i < t.extraFlipperCount; i++) {
        const ExtraFlipperDef& ef = t.extraFlippers[i];
        if (ef.length <= 1.0f) continue;
        float r = ef.restDeg * DEG_TO_RAD_F;
        float a = ef.activeDeg * DEG_TO_RAD_F;
        flippers[flipperCount++] = {ef.isLeft, ef.px, ef.py, ef.length, r, a, r, r, 0};
    }
    for (uint8_t i = 0; i < t.upper.flipperCount && t.upper.present; i++) {   // flipper de l'etage (couche 2)
        const ExtraFlipperDef& ef = t.upper.flippers[i];
        float r = ef.restDeg * DEG_TO_RAD_F;
        float a = ef.activeDeg * DEG_TO_RAD_F;
        flippers[flipperCount++] = {ef.isLeft, ef.px, ef.py, ef.length, r, a, r, r, 2};
    }
}

float Game::frand() {
    rng_ = rng_ * 1664525u + 1013904223u;
    return (float)((rng_ >> 8) & 0xFFFFu) / 65536.0f;
}

void Game::spawnBallInShooter(int idx) {
    // pose sur la tete du ressort (comme le moteur Web : x = 225, sommet du ressort a y = 478, bille de rayon 5,2)
    balls[idx] = {225.0f, PLUNGER_TOP_Y - BALL_RADIUS, 0.0f, 0.0f, true, true, 0.0f, 0.0f};
}

void Game::advanceMission(uint8_t kind, bool joker) {
    const MissionDef& m = tbl().missions[missionIdx % 3];
    if (!joker && m.kind != kind) return;
    missionProgress++;
    touchHud();
    if (missionProgress >= m.goal) {
        score += m.reward;
        missionProgress = 0;
        missionIdx++;
        if (missionIdx % 3 == 0) {
            score += 100000;
            showBanner("FINALE MAITRE +100K!", 2.2f);
            emit(Sfx::Finale);
        } else {
            showBanner("MISSION ACCOMPLIE!", 1.8f);
            emit(Sfx::Mission, (uint8_t)(missionIdx % 3));
        }
    }
}

void Game::startNewGame(uint8_t tableIndex) {
    tableIdx = tableIndex % TABLE_COUNT;
    buildStaticWalls();
    setupFlippers();
    for (int i = 0; i < MAX_BALLS; i++) balls[i] = {0, 0, 0, 0, false, false, 0.0f, 0.0f};
    spawnBallInShooter(0);
    for (int i = 0; i < MAX_BUMPERS; i++) bumperFlash[i] = 0.0f;
    huntSlot = 0; huntHits = 0; huntFlash = 0.0f; litBumper = 0;
    targetHit = 0; upTargetHit = 0; upRolloverLit = 0;
    for (int i = 0; i < MAX_BANKS; i++) dropReset[i] = 0.0f;
    for (int i = 0; i < MAX_TARGETS + MAX_UP_TARGETS; i++) targetFlash[i] = 0.0f;
    for (int i = 0; i < MAX_UP_BUMPERS; i++) upBumperFlash[i] = 0.0f;
    for (int i = 0; i < MAX_SPINNERS; i++) { spinAngle[i] = 0.0f; spinVel[i] = 0.0f; spinCount[i] = 0; }
    toyState = ToyState{0, 0.0f, 0.0f, 0.0f, 0.0f, 0.0f, 0.0f};
    rampBoost = 1; bonusMult = 1; vukFlash = 0.0f; multiQueue = 0; multiDelay = 0.0f;
    rng_ = 12345u + tableIdx;
    score = 0;
    ballsRemaining = 3;
    lockedBalls = 0;
    multiballActive = false;
    lockLit = false;
    lockHits = 0;
    rolloverLit = 0;
    rolloverFlash = 0.0f;
    ballSaveTimer = 0.0f;
    ballSaveUsed = false;
    kickLeftLit = kickRightLit = true;
    missionIdx = 0;
    missionProgress = 0;
    tiltMeter = 0.0f;
    isTilted = false;
    plungerCharge = 0.0f;
    recordAtStart_ = highScores[tableIdx];
    newRecord = false;
    physicsAccum_ = 0.0f;
    confirmAction = 0;
    cameraZoom = OVERVIEW_ZOOM;
    cameraY = 0.0f;          // vue d'ensemble : toute la table tient dans la fenetre au zoom d'arrivee
    introTimer = 2.35f;
    state = State::Playing;
    showBanner(tbl().name, 2.0f);
    emit(Sfx::MenuOk);
    touchHud();
}

bool Game::collideBallSegment(Ball& b, float x1, float y1, float x2, float y2, float restitution,
                              float extraKick, int wallIndex, float thick) {
    float dx = x2 - x1;
    float dy = y2 - y1;
    float lenSq = dx * dx + dy * dy;
    if (lenSq < 0.001f) return false;

    float t = ((b.x - x1) * dx + (b.y - y1) * dy) / lenSq;
    t = clampf(t, 0.0f, 1.0f);
    float cx = x1 + t * dx;
    float cy = y1 + t * dy;

    float nx = b.x - cx;
    float ny = b.y - cy;
    float distSq = nx * nx + ny * ny;
    const float reach = BALL_RADIUS + thick;
    if (distSq >= reach * reach || distSq < 0.0001f) return false;

    float dist = sqrtf(distSq);
    nx /= dist;
    ny /= dist;

    float overlap = reach - dist;
    b.x += nx * overlap;
    b.y += ny * overlap;

    float vn = b.vx * nx + b.vy * ny;
    if (vn < 0.0f) {
        float impulse = -(1.0f + restitution) * vn + extraKick;
        b.vx += nx * impulse;
        b.vy += ny * impulse;
        if (wallIndex >= 0 && walls[wallIndex].scoring) {
            score += 500;
            wallFlash[wallIndex] = 0.12f;
            advanceMission(2);
            emit(Sfx::Sling);
            touchHud();
        }
        return true;
    }
    return false;
}

static bool pointInPoly(float x, float y, const Vec2* p, int n) {
    bool inside = false;
    for (int i = 0, j = n - 1; i < n; j = i++) {
        const bool cross = ((p[i].y > y) != (p[j].y > y)) &&
                           (x < (p[j].x - p[i].x) * (y - p[i].y) / (p[j].y - p[i].y) + p[i].x);
        if (cross) inside = !inside;
    }
    return inside;
}

// Contact bille / disque plein (meme loi que le moteur Web) : renvoie vrai au contact ; `kick` impose une vitesse de sortie minimale.
bool Game::circleHit(Ball& b, float cx, float cy, float r, float rest, float kick) {
    float dx = b.x - cx, dy = b.y - cy;
    const float minD = BALL_RADIUS + r;
    const float d2 = dx * dx + dy * dy;
    if (d2 >= minD * minD || d2 < 1e-6f) return false;
    const float d = sqrtf(d2);
    const float nx = dx / d, ny = dy / d;
    b.x = cx + nx * minD;
    b.y = cy + ny * minD;
    const float vn = b.vx * nx + b.vy * ny;
    if (vn < 0.0f || kick > 0.0f) {
        if (vn < 0.0f) { b.vx -= (1.0f + rest) * vn * nx; b.vy -= (1.0f + rest) * vn * ny; }
        if (kick > 0.0f) {
            const float cur = b.vx * nx + b.vy * ny;
            const float boost = maxf(kick, cur);
            b.vx += (boost - cur) * nx;
            b.vy += (boost - cur) * ny;
        }
        return true;
    }
    return false;
}

void Game::startMultiball() {
    score += 40000;
    multiballActive = true;
    lockedBalls = 0;
    ballSaveTimer = maxf(ballSaveTimer, 16.0f);
    int act = 0;
    for (int i = 0; i < MAX_BALLS; i++) if (balls[i].active) act++;
    const int need = act >= 3 ? 0 : 3 - act;
    multiQueue = (uint8_t)(multiQueue + need > 2 ? 2 : multiQueue + need);
    multiDelay = 0.2f;
    showBanner(tbl().multiballName, 2.2f);
    emit(Sfx::Multiball);
    touchHud();
}

// Cible touchee (plateau ou etage) : points, banque, recompenses selon le role de la banque.
void Game::onTargetHit(uint8_t idx, bool upper) {
    const TableDef& t = tbl();
    const TargetDef* list = upper ? t.upper.targets : t.targets;
    const uint8_t count = upper ? t.upper.targetCount : t.targetCount;
    const TargetDef& tg = list[idx];
    uint16_t m = upper ? (uint16_t)upTargetHit : targetHit;
    const bool already = (m >> idx) & 1u;
    m = (uint16_t)(m | (1u << idx));
    targetFlash[idx + (upper ? MAX_TARGETS : 0)] = 0.3f;
    if (!already) advanceMission(2);
    bool complete = true;
    for (uint8_t j = 0; j < count; j++) if (list[j].bank == tg.bank && !((m >> j) & 1u)) complete = false;
    if (complete) {
        if (tg.drop) {
            dropReset[tg.bank] = upper ? 0.65f : 0.6f;     // les cibles escamotees remontent apres un court delai
        } else {
            for (uint8_t j = 0; j < count; j++) if (list[j].bank == tg.bank) m = (uint16_t)(m & ~(1u << j));
        }
        if (upper) {
            score += 28000;
            bannerf(1.6f, "%s COMPLET !", t.upper.name);
            emit(Sfx::Mission, 1);
        } else if (tg.role == 0) {
            if (bonusMult < 8) bonusMult++;
            score += 20000;
            bannerf(1.6f, "BANQUE COMPLETE BONUS X%u", (unsigned)bonusMult);
            emit(Sfx::Mission, 1);
        } else if (tg.role == 1) {
            startMultiball();
        } else if (tg.role == 2) {
            kickLeftLit = kickRightLit = true;
            score += 18000;
            showBanner("DOUBLES BOUCLIERS ACTIFS !", 1.6f);
            emit(Sfx::Mission, 1);
        } else {
            if (rampBoost < 3) rampBoost++;
            score += 20000;
            bannerf(1.6f, "RAMPES X%u !", (unsigned)rampBoost);
            emit(Sfx::Mission, 1);
        }
    } else {
        score += upper ? (uint32_t)tg.points * 2u : (already ? tg.points / 2u : tg.points);
        emit(Sfx::Bumper, (uint8_t)(1 + idx));
    }
    if (upper) upTargetHit = (uint8_t)m; else targetHit = m;
    touchHud();
}

// Jouet interactif : une bille contre le jouet (les minuteries avancent une fois par pas, dans stepSubstep).
void Game::stepToy(Ball& b, float dt) {
    const ToyDef& toy = tbl().toy;
    ToyState& st = toyState;
    const uint8_t req = toy.hitsRequired ? toy.hitsRequired : 1;
    switch (toy.kind) {
    case 0: {   // BASH : bumper geant, suractive tous les `req` coups
        const float kick = isTilted ? 0.0f : (st.activeTimer > 0.0f ? 335.0f : 255.0f);
        if (circleHit(b, toy.x, toy.y, toy.r, 0.84f, kick) && !isTilted && st.cooldown <= 0.0f) {
            st.cooldown = 0.12f; st.hits++; st.flash = 0.35f; st.openRatio = 1.0f;
            emit(Sfx::Bumper, 0);
            advanceMission(2);
            if (st.hits % req == 0) {
                st.activeTimer = 4.0f;
                score += toy.reward;
                bannerf(1.8f, "%s SURACTIVE !", toy.name);
                emit(Sfx::Mission, 2);
            } else {
                score += toy.points;
            }
            touchHud();
        }
        break;
    }
    case 1: {   // portes battantes : deux montants, passage traversable
        circleHit(b, toy.x - toy.r - 2.0f, toy.y, 2.5f, 0.55f, 0.0f);
        circleHit(b, toy.x + toy.r + 2.0f, toy.y, 2.5f, 0.55f, 0.0f);
        if (!isTilted && st.cooldown <= 0.0f && fabsf(b.x - toy.x) <= toy.r && fabsf(b.y - toy.y) <= 6.5f && fabsf(b.vy) > 35.0f) {
            st.cooldown = 0.3f; st.hits++; st.flash = 0.35f;
            const float dir = b.vy < 0.0f ? 1.0f : -1.0f;
            st.openRatio = dir * 0.95f;
            st.spinVel = dir * 13.0f;
            b.vx *= 0.95f; b.vy *= 0.92f;
            emit(Sfx::Bumper, 1);
            advanceMission(1);
            if (st.hits % req == 0) { score += toy.reward; bannerf(1.6f, "%s ENTREE FRACASSANTE", toy.name); emit(Sfx::Mission, 2); }
            else score += toy.points;
            touchHud();
        }
        break;
    }
    case 2: {   // plateau tournant : entraine la bille, ejection centrifuge tous les `req` passages
        const float dx = b.x - toy.x, dy = b.y - toy.y;
        const float dist = sqrtf(dx * dx + dy * dy);
        if (dist < toy.r + BALL_RADIUS && dist > 0.5f) {
            const float nx = dx / dist, ny = dy / dist;
            const float sign = st.spinVel >= 0.0f ? 1.0f : -1.0f;
            const float swirl = 210.0f + minf(220.0f, fabsf(st.spinVel) * 18.0f);
            b.vx += -ny * sign * swirl * dt;
            b.vy += nx * sign * swirl * dt;
            if (!isTilted && st.cooldown <= 0.0f && dist < toy.r) {
                st.cooldown = 0.28f; st.hits++; st.flash = 0.3f;
                const float cross = dx * b.vy - dy * b.vx;
                st.spinVel = (cross >= 0.0f ? 1.0f : -1.0f) * 15.0f;
                emit(Sfx::MenuMove, 2);
                advanceMission(0);
                if (st.hits % req == 0) {
                    b.vx += nx * 165.0f; b.vy += ny * 165.0f;
                    score += toy.reward;
                    bannerf(1.6f, "TURBO %s !", toy.name);
                    emit(Sfx::Mission, 2);
                } else {
                    score += toy.points;
                }
                touchHud();
            }
        }
        break;
    }
    case 3: {   // puits gravitationnel : aspire, puis fronde la bille
        const float dx = toy.x - b.x, dy = toy.y - b.y;
        const float dist = sqrtf(dx * dx + dy * dy);
        const float reach = toy.r * 1.55f;
        if (dist < reach && dist > 2.0f) {
            const float ux = dx / dist, uy = dy / dist;
            const float pull = 195.0f * (1.0f - dist / reach);
            b.vx += (ux * pull - uy * 125.0f) * dt;
            b.vy += (uy * pull + ux * 125.0f) * dt;
            const float cur = sqrtf(b.vx * b.vx + b.vy * b.vy);
            if (cur < 135.0f) { b.vx += -uy * 95.0f * dt; b.vy += ux * 95.0f * dt; }
            if (!isTilted && st.cooldown <= 0.0f && dist < toy.r * 0.72f) {
                st.cooldown = 0.68f; st.hits++; st.flash = 0.38f; st.spinVel = 16.0f;
                const float sp = maxf(295.0f, cur * 1.18f);
                const float ang = atan2f(-uy, -ux) + 0.45f;
                b.vx = cosf(ang) * sp;
                b.vy = sinf(ang) * sp;
                emit(Sfx::Ramp, 2);
                advanceMission(1);
                if (st.hits % req == 0) { score += toy.reward; bannerf(1.6f, "FRONDE %s !", toy.name); emit(Sfx::Mission, 2); }
                else score += toy.points;
                touchHud();
            }
        }
        break;
    }
    case 4: {   // sarcophage coulissant : scelle, puis ouvert (la bille y est tiree vers le haut)
        if (st.activeTimer > 0.0f) {
            const float dx = b.x - toy.x, dy = b.y - toy.y;
            const float rr = toy.r * 0.9f;
            if (!isTilted && st.cooldown <= 0.0f && dx * dx + dy * dy <= rr * rr) {
                st.cooldown = 0.45f; st.flash = 0.45f;
                b.vx = (frand() - 0.5f) * 90.0f;
                b.vy = -430.0f;
                advanceMission(2, true);
                score += toy.reward;
                bannerf(1.8f, "TRESOR %s !", toy.name);
                emit(Sfx::Multiball);
                touchHud();
            }
        } else if (circleHit(b, toy.x, toy.y, toy.r, 0.78f, isTilted ? 0.0f : 225.0f) && !isTilted && st.cooldown <= 0.0f) {
            st.cooldown = 0.15f; st.hits++; st.flash = 0.35f;
            const uint8_t step = (uint8_t)(st.hits % req);
            if (step == 0) {
                st.activeTimer = 7.5f; st.openRatio = 1.0f;
                score += (uint32_t)toy.points * 2u;
                bannerf(1.8f, "%s OUVERT ! TIREZ DEDANS !", toy.name);
                emit(Sfx::Mission, 1);
            } else {
                st.openRatio = (float)step / (float)req;
                score += toy.points;
                bannerf(1.0f, "SCEAU %u/%u", (unsigned)step, (unsigned)req);
                emit(Sfx::Bumper, 2);
            }
            advanceMission(2);
            touchHud();
        }
        break;
    }
    default: {  // ROTO-CIBLE : points x1..x3, prime tous les `req` coups
        if (circleHit(b, toy.x, toy.y, toy.r, 0.82f, isTilted ? 0.0f : 240.0f) && !isTilted && st.cooldown <= 0.0f) {
            st.cooldown = 0.14f; st.hits++; st.flash = 0.35f; st.spinVel = 22.0f;
            const uint32_t mult = 1u + (st.hits % 3u);
            advanceMission(2);
            if (st.hits % req == 0) { score += toy.reward; bannerf(1.6f, "ROTO SPECIAL +%luK !", (unsigned long)(toy.reward / 1000)); emit(Sfx::Mission, 2); }
            else { score += toy.points * mult; emit(Sfx::Bumper, 3); }
            touchHud();
        }
        break;
    }
    }
}

// Bille sur l'etage superieur (couche 2) : rebords fermes, plots, bumpers, cibles, couloirs et flipper de l'etage.
void Game::stepUpper(Ball& b, float dt, bool leftHeld, bool rightHeld) {
    const TableDef& t = tbl();
    const UpperDeckDef& up = t.upper;
    b.vy += t.gravity * dt;
    b.vx *= 1.0f - 0.05f * dt;
    b.vy *= 1.0f - 0.03f * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;

    for (uint8_t k = 0; k < upWallCount; k++)
        collideBallSegment(b, upWalls[k].x1, upWalls[k].y1, upWalls[k].x2, upWalls[k].y2, upWalls[k].bounce, 0.0f, -1);
    // garde-fou contre les parois du meuble
    if (b.x - BALL_RADIUS < 10.0f) { b.x = 10.0f + BALL_RADIUS; if (b.vx < 0.0f) b.vx = -b.vx * 0.48f; }
    else if (b.x + BALL_RADIUS > 215.0f) { b.x = 215.0f - BALL_RADIUS; if (b.vx > 0.0f) b.vx = -b.vx * 0.48f; }
    if (b.y - BALL_RADIUS < 22.0f) { b.y = 22.0f + BALL_RADIUS; if (b.vy < 0.0f) b.vy = -b.vy * 0.48f; }
    for (uint8_t k = 0; k < up.n; k++) circleHit(b, up.b[k].x, up.b[k].y, 2.2f, 0.52f, 0.0f);

    for (uint8_t k = 0; k < up.targetCount; k++) {
        const TargetDef& tg = up.targets[k];
        if (tg.drop && ((upTargetHit >> k) & 1u)) continue;
        if (collideBallSegment(b, tg.x1, tg.y1, tg.x2, tg.y2, 0.72f, 0.0f, -1) && !isTilted) onTargetHit(k, true);
    }
    for (uint8_t k = 0; k < up.bumperCount; k++) {
        const BumperDef& bm = up.bumpers[k];
        if (circleHit(b, bm.x, bm.y, bm.r, 0.86f, isTilted ? 0.0f : 250.0f) && !isTilted) {
            upBumperFlash[k] = 0.2f;
            score += (uint32_t)bm.points * 2u;
            advanceMission(0);
            emit(Sfx::Bumper, (uint8_t)(4 + k));
            touchHud();
        }
    }
    if (!isTilted) {
        for (uint8_t k = 0; k < up.rolloverCount; k++) {
            const RolloverDef& ro = up.rollovers[k];
            if (upRolloverLit & (1u << k)) continue;
            const float dx = b.x - ro.x, dy = b.y - ro.y, rr = ro.r + 1.5f;
            if (dx * dx + dy * dy >= rr * rr) continue;
            upRolloverLit |= (uint8_t)(1u << k);
            score += (uint32_t)ro.points * 2u;
            emit(Sfx::MenuMove, 1);
            if (upRolloverLit == (uint8_t)((1u << up.rolloverCount) - 1u)) {
                upRolloverLit = 0;
                score += 6000;
                showBanner("PASSAGES ETAGE +6000", 1.4f);
                emit(Sfx::Mission, 0);
            }
            touchHud();
        }
    }
    for (uint8_t f = 0; f < flipperCount; f++) {
        const FlipperRuntime& fl = flippers[f];
        if (fl.layer != 2) continue;
        const float ex = fl.px + cosf(fl.angleRad) * fl.length;
        const float ey = fl.py + sinf(fl.angleRad) * fl.length;
        const float angVel = fabsf(fl.angleRad - fl.prevAngleRad) / dt;
        collideBallSegment(b, fl.px, fl.py, ex, ey, 0.58f, angVel > 1.5f ? 235.0f : 0.0f, -1, 3.8f);
    }
    // la bille franchit un rebord ouvert : elle retombe sur le plateau
    if (!pointInPoly(b.x, b.y, up.b, up.n)) {
        b.layer = 0;
        b.rampCool = 0.22f;
        b.stuckTime = 0.0f;
        return;
    }
    bool cradled = false;
    for (uint8_t f = 0; f < flipperCount; f++) {
        if (flippers[f].layer != 2) continue;
        const bool active = flippers[f].isLeft ? leftHeld : rightHeld;
        const float cdx = b.x - flippers[f].px, cdy = b.y - flippers[f].py, reach = flippers[f].length + 12.0f;
        if (active && cdx * cdx + cdy * cdy < reach * reach) cradled = true;
    }
    if (!cradled && b.vx * b.vx + b.vy * b.vy < 900.0f) {
        b.stuckTime += dt;
        if (b.stuckTime > 0.22f) {   // bille posee sur un rebord : petit saut en direction du rebord ouvert (ou du centre)
            float tx = 113.0f, ty = 200.0f;
            for (uint8_t i = 0; i < up.n; i++) {
                if (!(up.openMask & (1u << i))) continue;
                tx = (up.b[i].x + up.b[(i + 1) % up.n].x) * 0.5f;
                ty = (up.b[i].y + up.b[(i + 1) % up.n].y) * 0.5f;
                break;
            }
            float dx = tx - b.x, dy = ty - b.y;
            const float dl = maxf(1.0f, sqrtf(dx * dx + dy * dy));
            b.vx = dx / dl * 130.0f;
            b.vy = dy / dl * 130.0f - 70.0f;
            b.stuckTime = 0.0f;
        }
    } else {
        b.stuckTime = 0.0f;
    }
    const float spd = sqrtf(b.vx * b.vx + b.vy * b.vy);
    if (spd > 560.0f) { b.vx = b.vx / spd * 560.0f; b.vy = b.vy / spd * 560.0f; }
}

void Game::stepSubstep(float dt, bool leftHeld, bool rightHeld) {
    const TableDef& t = tbl();

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

    // --- minuteries des mecaniques (une fois par pas) -----------------------------------
    for (int k = 0; k < MAX_TARGETS + MAX_UP_TARGETS; k++) if (targetFlash[k] > 0.0f) targetFlash[k] = maxf(0.0f, targetFlash[k] - dt);
    for (int k = 0; k < MAX_UP_BUMPERS; k++) if (upBumperFlash[k] > 0.0f) upBumperFlash[k] = maxf(0.0f, upBumperFlash[k] - dt);
    if (vukFlash > 0.0f) vukFlash = maxf(0.0f, vukFlash - dt);
    for (int bk = 0; bk < MAX_BANKS; bk++) {   // les cibles escamotables d'une banque complete remontent
        if (dropReset[bk] <= 0.0f) continue;
        dropReset[bk] -= dt;
        if (dropReset[bk] > 0.0f) continue;
        dropReset[bk] = 0.0f;
        if (bk == 2) {
            for (uint8_t j = 0; j < t.upper.targetCount; j++) if (t.upper.targets[j].bank == 2) upTargetHit = (uint8_t)(upTargetHit & ~(1u << j));
        } else {
            for (uint8_t j = 0; j < t.targetCount; j++) if (t.targets[j].bank == bk) targetHit = (uint16_t)(targetHit & ~(1u << j));
        }
    }
    for (uint8_t k = 0; k < t.spinnerCount; k++) {   // spinners : chaque demi-tour rapporte des points
        if (fabsf(spinVel[k]) > 0.5f) {
            spinAngle[k] += fabsf(spinVel[k]) * dt;
            spinVel[k] *= expf(-1.6094379f * dt);
            while (spinAngle[k] >= 3.14159265f) {
                spinAngle[k] -= 3.14159265f;
                score += t.spinners[k].points;
                if ((++spinCount[k] & 3u) == 0u) advanceMission(0);
                emit(Sfx::MenuMove, 3);
                touchHud();
            }
        } else {
            spinVel[k] = 0.0f;
        }
    }
    if (t.toy.present) {
        ToyState& ts = toyState;
        if (ts.flash > 0.0f) ts.flash = maxf(0.0f, ts.flash - dt);
        if (ts.cooldown > 0.0f) ts.cooldown = maxf(0.0f, ts.cooldown - dt);
        if (ts.activeTimer > 0.0f) {
            ts.activeTimer = maxf(0.0f, ts.activeTimer - dt);
            if (ts.activeTimer == 0.0f && t.toy.kind == 4) ts.openRatio = 0.0f;
        }
        if (t.toy.kind == 2 || t.toy.kind == 5) {
            ts.angle = fmodf(ts.angle + ((t.toy.kind == 2 ? 1.1f : 0.0f) + ts.spinVel) * dt, 6.2831853f);
            ts.spinVel *= expf(-2.2f * dt);
        } else if (t.toy.kind == 3) {
            ts.angle = fmodf(ts.angle + (2.4f + ts.spinVel) * dt, 6.2831853f);
            ts.spinVel *= expf(-2.5f * dt);
        } else if (t.toy.kind == 1) {
            ts.openRatio += ts.spinVel * dt;
            ts.spinVel += (-18.0f * ts.openRatio - 5.5f * ts.spinVel) * dt;
            ts.openRatio = clampf(ts.openRatio, -1.25f, 1.25f);
        } else if (t.toy.kind == 0) {
            ts.openRatio *= expf(-10.0f * dt);
        }
    }
    if (multiQueue > 0) {   // multibille declenchee par une banque : les billes sortent une par une dans le lanceur
        multiDelay -= dt;
        if (multiDelay <= 0.0f) {
            bool busy = false;
            int freeSlot = -1;
            for (int k = 0; k < MAX_BALLS; k++) {
                if (balls[k].active && balls[k].inShooter) busy = true;
                if (!balls[k].active && freeSlot < 0) freeSlot = k;
            }
            if (!busy && freeSlot >= 0) {
                spawnBallInShooter(freeSlot);
                multiQueue--;
                multiDelay = 0.55f;
            } else if (freeSlot < 0) {
                multiQueue = 0;
            }
        }
    }

    for (int i = 0; i < MAX_BALLS; i++) {
        Ball& b = balls[i];
        if (!b.active) continue;

        if (b.held) {   // captee dans l'ejecteur : attiree vers le centre, puis envoyee dans le conduit
            b.x += (t.vuk.x - b.x) * (1.0f - expf(-28.0f * dt));
            b.y += (t.vuk.y - b.y) * (1.0f - expf(-28.0f * dt));
            b.holdTimer -= dt;
            if (b.holdTimer <= 0.0f) {
                b.held = false;
                b.ramp = 2; b.rampDist = 0.0f; b.rampSpeed = 335.0f;
                b.vx = 0.0f; b.vy = 0.0f;
            }
            continue;
        }

        if (b.ramp >= 0) {   // sur une rampe ou dans le conduit du VUK : trajectoire guidee le long des 5 points
            const int rampIdx = b.ramp;
            const bool tube = (rampIdx == 2);
            const Vec2* P = tube ? t.vuk.pts : t.ramps[b.ramp].pts;
            float total = 0.0f, segLen[RAMP_PTS - 1];
            for (int k = 0; k < RAMP_PTS - 1; k++) {
                const float sx = P[k + 1].x - P[k].x, sy = P[k + 1].y - P[k].y;
                segLen[k] = sqrtf(sx * sx + sy * sy);
                total += segLen[k];
            }
            if (!tube) b.rampSpeed = maxf(120.0f, b.rampSpeed - 40.0f * dt);   // la bille ralentit un peu en montant
            b.rampDist += b.rampSpeed * dt;
            if (b.rampDist >= total) {
                const Vec2 a = P[RAMP_PTS - 2], e = P[RAMP_PTS - 1];
                float ddx = e.x - a.x, ddy = e.y - a.y;
                const float dl = maxf(1.0f, sqrtf(ddx * ddx + ddy * ddy));
                b.x = e.x; b.y = e.y;
                b.ramp = -1;
                b.stuckTime = 0.0f;
                if (tube) {                                   // sortie du conduit : ejection a la vitesse du VUK
                    b.vx = t.vuk.evx; b.vy = t.vuk.evy;
                    b.rampCool = 0.22f;
                    vukFlash = 0.3f;
                } else if (t.ramps[rampIdx].toUpper) {   // la rampe depose la bille sur l'etage
                    const float sp = clampf(b.rampSpeed * 0.78f, 155.0f, 340.0f);
                    b.layer = 2;
                    b.vx = ddx / dl * sp; b.vy = ddy / dl * sp;
                    b.rampCool = 0.24f;
                    bannerf(1.4f, "ETAGE : %s", t.upper.name);
                    emit(Sfx::Lock);
                } else {
                    b.vx = ddx / dl * 90.0f;
                    if (fabsf(b.vx) < 25.0f) b.vx = (e.x < 112.0f) ? 35.0f : -35.0f;   // jamais vx = 0 (voir plus haut)
                    b.vy = maxf(85.0f, ddy / dl * 140.0f);
                    b.rampCool = 0.75f;
                }
                continue;
            }
            float d = b.rampDist;
            for (int k = 0; k < RAMP_PTS - 1; k++) {
                if (d <= segLen[k] || k == RAMP_PTS - 2) {
                    const float u = segLen[k] > 0.0f ? d / segLen[k] : 0.0f;
                    b.x = P[k].x + (P[k + 1].x - P[k].x) * u;
                    b.y = P[k].y + (P[k + 1].y - P[k].y) * u;
                    break;
                }
                d -= segLen[k];
            }
            continue;
        }

        if (b.layer == 2) {   // etage superieur : physique propre, ne touche pas au plateau
            stepUpper(b, dt, leftHeld, rightHeld);
            continue;
        }

        b.vy += t.gravity * dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;

        const bool wasInShooter = b.inShooter;
        b.inShooter = (b.x > 217.0f && b.y > 90.0f);
        if (wasInShooter && !b.inShooter && ballSaveTimer <= 0.0f && !ballSaveUsed && !multiballActive && !isTilted) {
            ballSaveTimer = BALL_SAVE_SEC;   // protection contre la chute directe : la bille est rendue si elle tombe tout de suite
        }
        // boucliers des sorties laterales : renvoient la bille vers le haut (une fois chacun par bille)
        if (!isTilted && !b.inShooter && b.y > 438.0f && b.y < 462.0f && b.vy > 0.0f) {
            if (kickLeftLit && b.x < 27.0f) {
                kickLeftLit = false; b.vy = -720.0f; b.vx = 28.0f;
                score += 12000; showBanner("KICKBACK GAUCHE !", 1.2f); emit(Sfx::Sling); touchHud();
            } else if (kickRightLit && b.x > 199.0f && b.x < 217.0f) {
                kickRightLit = false; b.vy = -720.0f; b.vx = -28.0f;
                score += 12000; showBanner("BOUCLIER DROIT !", 1.2f); emit(Sfx::Sling); touchHud();
            }
        }
        // La tete du ressort sert de sol dans le couloir : elle s'abaisse quand on tend le ressort
        if (b.inShooter) {
            const float floorY = PLUNGER_TOP_Y + plungerCharge * 22.0f;
            if (b.y + BALL_RADIUS > floorY) {
                b.y = floorY - BALL_RADIUS;
                if (b.vy > 0.0f) b.vy = 0.0f;
            }
        }

        // Clapet anti-retour en haut du couloir lanceur
        if (!b.inShooter && b.x > 212.0f && b.y < 100.0f && b.vy > 0.0f) {
            b.vx = -fabsf(b.vx) - 45.0f;
        }

        for (uint8_t w = 0; w < wallCount; w++) {
            collideBallSegment(b, walls[w].x1, walls[w].y1, walls[w].x2, walls[w].y2, walls[w].bounce, 0.0f, w);
        }

        for (uint8_t f = 0; f < flipperCount; f++) {
            const FlipperRuntime& fl = flippers[f];
            if (fl.layer != 0) continue;
            float ex = fl.px + cosf(fl.angleRad) * fl.length;
            float ey = fl.py + sinf(fl.angleRad) * fl.length;
            float angVel = fabsf(fl.angleRad - fl.prevAngleRad) / dt;
            float kick = (angVel > 1.5f) ? 235.0f : 0.0f;
            collideBallSegment(b, fl.px, fl.py, ex, ey, 0.58f, kick, -1, f < 2 ? 4.2f : 3.7f);
        }

        // Plots (coins des boitiers + plots supplementaires), cibles, spinners
        for (uint8_t h = 0; h < t.housingCount; h++) {
            const HousingDef& hd = t.housings[h];
            for (uint8_t i = 0; i < hd.n; i++)
                if (hd.p[i].x > 10.5f && hd.p[i].x < 215.5f) circleHit(b, hd.p[i].x, hd.p[i].y, 2.0f, 0.5f, 0.0f);
        }
        for (uint8_t k = 0; k < t.pegCount; k++) circleHit(b, t.pegs[k].x, t.pegs[k].y, t.pegs[k].r, t.pegs[k].bounce, 0.0f);
        if (!b.inShooter) {
            for (uint8_t k = 0; k < t.targetCount; k++) {
                const TargetDef& tg = t.targets[k];
                if (tg.drop && ((targetHit >> k) & 1u)) continue;   // cible escamotee
                if (collideBallSegment(b, tg.x1, tg.y1, tg.x2, tg.y2, 0.68f, 0.0f, -1) && !isTilted) onTargetHit(k, false);
            }
            if (!isTilted) {
                for (uint8_t k = 0; k < t.spinnerCount; k++) {
                    const SpinnerDef& sp = t.spinners[k];
                    const float dx = b.x - sp.x, dy = b.y - sp.y, rr = sp.width * 0.65f;
                    if (dx * dx + dy * dy >= rr * rr) continue;
                    const float spd = sqrtf(b.vx * b.vx + b.vy * b.vy);
                    if (spd > 65.0f) spinVel[k] = maxf(spinVel[k], spd * 0.15f) * (1.0f + dt);
                }
            }
            if (t.toy.present) stepToy(b, dt);
        }

        // Bumpers
        for (uint8_t k = 0; k < t.bumperCount; k++) {
            const BumperDef& bmp = t.bumpers[k];
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
                bool golden = t.rotateBumper && k == litBumper % t.bumperCount;
                score += golden ? bmp.points * 3 : bmp.points;
                if (golden) litBumper = (uint8_t)((litBumper + 1 + (huntHits++ % 2)) % t.bumperCount);
                bumperFlash[k] = 0.14f;
                if (!lockLit && !multiballActive && ++lockHits >= 5) {
                    lockLit = true;
                    showBanner("PUITS ALLUME !", 1.6f);
                    emit(Sfx::LockLit);
                }
                advanceMission(0);
                emit(Sfx::Bumper, k);
                touchHud();
            }
        }

        // Cible mobile (WANTED, fantome...) : change d'emplacement a chaque touche
        if (t.hunt.kind && !b.inShooter) {
            const HuntDef& hd = t.hunt;
            const Vec2& sp = hd.slots[huntSlot % hd.slotCount];
            float dx = b.x - sp.x;
            float dy = b.y - sp.y;
            float minD = BALL_RADIUS + hd.radius;
            float d2 = dx * dx + dy * dy;
            if (d2 < minD * minD && d2 > 0.001f) {
                float d = sqrtf(d2);
                dx /= d;
                dy /= d;
                b.x = sp.x + dx * minD;
                b.y = sp.y + dy * minD;
                b.vx = dx * 190.0f;
                b.vy = dy * 190.0f;
                huntHits++;
                huntFlash = 0.35f;
                score += hd.points;
                uint8_t n = hd.slotCount;
                huntSlot = hd.sequential
                    ? (uint8_t)((huntSlot + 1) % n)
                    : (uint8_t)((huntSlot + 1 + ((huntHits * 7) % (n > 1 ? n - 1 : 1))) % n);
                if (huntHits % hd.goal == 0) {
                    score += hd.reward;
                    bannerf(1.8f, "%s ! +%luK", hd.name, (unsigned long)(hd.reward / 1000));
                    emit(Sfx::Mission, 1);
                } else {
                    emit(Sfx::Bumper, 0);
                }
                advanceMission(2);
                touchHud();
            }
        }

        // Rollovers : la lampe s'allume quand la bille roule dessus ; groupe complet = bonus
        if (!b.inShooter) {
            for (uint8_t k = 0; k < MAX_ROLLOVERS; k++) {
                const RolloverDef& ro = t.rollovers[k];
                const uint8_t bit = (uint8_t)(1u << k);
                if (rolloverLit & bit) continue;
                const float dx = b.x - ro.x, dy = b.y - ro.y, rr = ro.r + 1.5f;
                if (dx * dx + dy * dy >= rr * rr) continue;
                rolloverLit |= bit;
                score += ro.points;
                emit(Sfx::MenuMove, 1);
                touchHud();
                if ((rolloverLit & 0x0F) == 0x0F) {
                    rolloverLit &= (uint8_t)~0x0F;
                    rolloverFlash = 1.2f;
                    score += 10000;
                    showBanner("COULOIRS +10000", 1.6f);
                    emit(Sfx::Mission, 0);
                } else if ((rolloverLit & 0x30) == 0x30) {
                    rolloverLit &= (uint8_t)~0x30;
                    score += 5000;
                    showBanner("RETOURS +5000", 1.4f);
                    emit(Sfx::Mission, 0);
                }
            }
        }

        // Entrees de rampes (propulsion guidee vers la sortie)
        if (b.rampCool <= 0.0f && b.vy < -55.0f) {
            for (uint8_t r = 0; r < 2; r++) {
                Vec2 entry = t.ramps[r].pts[0];
                Vec2 exitP = t.ramps[r].pts[RAMP_PTS - 1];
                float dx = b.x - entry.x;
                float dy = b.y - entry.y;
                float rad = t.ramps[r].entryRadius;
                if (dx * dx + dy * dy < rad * rad) {
                    // la bille quitte le plateau et suit la rampe point par point (pas de teleportation)
                    b.ramp = (int8_t)r;
                    b.rampDist = 0.0f;
                    b.rampSpeed = clampf(sqrtf(b.vx * b.vx + b.vy * b.vy) * 0.8f, 150.0f, 330.0f);
                    b.vx = 0.0f;
                    b.vy = 0.0f;
                    (void)exitP;
                    b.rampCool = 0.75f;
                    score += t.ramps[r].points * rampBoost;
                    advanceMission(1);
                    bannerf(1.3f, "%s +%lu", t.ramps[r].name, (unsigned long)t.ramps[r].points);
                    emit(Sfx::Ramp, r);
                    touchHud();
                    break;
                }
            }
        }

        // Ejecteur (VUK) : capte la bille puis la renvoie par un conduit aerien (aucune teleportation)
        if (t.vuk.present && !b.inShooter && !isTilted && b.rampCool <= 0.0f && b.layer == 0) {
            const float dx = b.x - t.vuk.x, dy = b.y - t.vuk.y;
            if (dx * dx + dy * dy <= t.vuk.r * t.vuk.r) {
                b.held = true;
                b.holdTimer = 0.24f;
                b.vx = 0.0f; b.vy = 0.0f;
                vukFlash = 0.45f;
                score += t.vuk.points;
                advanceMission(2, true);
                bannerf(1.2f, "%s +%u", t.vuk.name, (unsigned)t.vuk.points);
                emit(Sfx::Ramp, 2);
                touchHud();
                continue;
            }
        }

        // Puits de capture Multibille (2 verrous -> 3 billes)
        if (lockLit && !multiballActive && b.rampCool <= 0.0f) {
            float dx = b.x - t.lockPos.x;
            float dy = b.y - t.lockPos.y;
            float lr = t.lockRadius + 2.5f;
            if (dx * dx + dy * dy < lr * lr) {
                lockedBalls++;
                lockLit = false;
                lockHits = 0;
                score += 5000;
                touchHud();
                if (lockedBalls >= 2) {
                    lockedBalls = 0;
                    multiballActive = true;
                    b.vx = -110.0f;
                    b.vy = -130.0f;
                    b.rampCool = 0.83f;
                    balls[1] = {t.lockPos.x - 10.0f, t.lockPos.y + 8.0f, -95.0f, 70.0f, true, false, 0.67f, 0.0f};
                    balls[2] = {t.lockPos.x + 10.0f, t.lockPos.y + 8.0f,  95.0f, 80.0f, true, false, 0.67f, 0.0f};
                    showBanner(t.multiballName, 2.2f);
                    emit(Sfx::Multiball);
                } else {
                    showBanner("BILLE VERROUILLEE 1/2", 1.6f);
                    spawnBallInShooter(i);
                    emit(Sfx::Lock);
                }
            }
        }

        // Anti-blocage : bille quasi immobile hors lanceur (et pas retenue par un flipper leve)
        {
            bool cradled = false;
            for (uint8_t f = 0; f < flipperCount; f++) {
                bool active = flippers[f].isLeft ? leftHeld : rightHeld;
                float cdx = b.x - flippers[f].px;
                float cdy = b.y - flippers[f].py;
                float reach = flippers[f].length + 12.0f;
                if (active && cdx * cdx + cdy * cdy < reach * reach) cradled = true;
            }
            float spd2 = b.vx * b.vx + b.vy * b.vy;
            if (!b.inShooter && !cradled && b.y < 490.0f && spd2 < 100.0f) {
                b.stuckTime += dt;
                if (b.stuckTime > 0.7f) {
                    b.vy = -155.0f;
                    b.vx = (b.x < 112.0f) ? 85.0f : -85.0f;
                    b.stuckTime = 0.0f;
                }
            } else {
                b.stuckTime = 0.0f;
            }
        }

        // Perte de bille en bas
        if (b.y > WORLD_H - 4.0f) b.active = false;

        float spd = sqrtf(b.vx * b.vx + b.vy * b.vy);
        if (spd > 560.0f) {
            b.vx = (b.vx / spd) * 560.0f;
            b.vy = (b.vy / spd) * 560.0f;
        }
    }
}

void Game::stepPhysics(float dt, const Input& in) {
    bool leftHeld  = !isTilted && in.left;
    bool rightHeld = !isTilted && in.right;
    physicsAccum_ += dt;
    int substeps = 0;
    while (physicsAccum_ >= PHYSICS_DT && substeps < MAX_SUBSTEPS) {
        stepSubstep(PHYSICS_DT, leftHeld, rightHeld);
        physicsAccum_ -= PHYSICS_DT;
        substeps++;
    }
    if (substeps == MAX_SUBSTEPS) physicsAccum_ = 0.0f;
}

void Game::updateCamera(float dt) {
    // Zoom progressif d'arrivee (vue d'ensemble -> jeu 1.0x)
    if (introTimer > 0.0f) {
        introTimer = maxf(0.0f, introTimer - dt);
        float progress = 1.0f - (introTimer / 2.35f);
        if (progress < 0.34f) {
            cameraZoom = OVERVIEW_ZOOM;
        } else {
            float u = clampf((progress - 0.34f) / 0.66f, 0.0f, 1.0f);
            float ease = u * u * (3.0f - 2.0f * u);
            cameraZoom = OVERVIEW_ZOOM + (1.0f - OVERVIEW_ZOOM) * ease;
        }
    } else {
        cameraZoom = 1.0f;
    }

    // La camera suit la bille active la plus basse (en jeu, avant celles du lanceur)
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
        float maxCamForZoom = maxf(0.0f, (float)WORLD_H - visibleWorldH);
        float targetCam = clampf(lb.y - visibleWorldH * 0.56f, 0.0f, maxCamForZoom);
        if (lb.y > 350.0f) targetCam = maxCamForZoom;
        cameraY += (targetCam - cameraY) * minf(1.0f, dt * 14.0f);
        float hardFloor = minf(maxCamForZoom, lb.y - (visibleWorldH - 42.0f));
        if (cameraY < hardFloor) cameraY = hardFloor;
        cameraY = clampf(cameraY, 0.0f, maxCamForZoom);
    }
}

void Game::commitScore() {
    if (score > highScores[tableIdx]) {
        highScores[tableIdx] = score;
        if (store_.save) store_.save(highScores);
    }
}

void Game::updatePlaying(float dt, const Input& in, bool nudgePressed, bool flipperEdge) {
    (void)flipperEdge;
    if (bannerTimer > 0.0f) bannerTimer = maxf(0.0f, bannerTimer - dt);
    for (int i = 0; i < MAX_BUMPERS; i++) if (bumperFlash[i] > 0.0f) bumperFlash[i] = maxf(0.0f, bumperFlash[i] - dt);
    if (huntFlash > 0.0f) huntFlash = maxf(0.0f, huntFlash - dt);
    for (int i = 0; i < wallCount; i++) if (wallFlash[i] > 0.0f) wallFlash[i] = maxf(0.0f, wallFlash[i] - dt);
    if (rolloverFlash > 0.0f) rolloverFlash = maxf(0.0f, rolloverFlash - dt);
    if (ballSaveTimer > 0.0f) ballSaveTimer = maxf(0.0f, ballSaveTimer - dt);

    bool anyInShooter = false;
    bool onSpring = false;   // une bille repose sur la tete du ressort (seule situation ou on peut le tendre / tirer)
    for (int i = 0; i < MAX_BALLS; i++) {
        if (balls[i].active && balls[i].inShooter) {
            anyInShooter = true;
            const float headY = PLUNGER_TOP_Y + plungerCharge * 22.0f;
            if (balls[i].y + BALL_RADIUS >= headY - 3.0f && fabsf(balls[i].vy) < 60.0f) onSpring = true;
        }
        if (balls[i].active && balls[i].rampCool > 0.0f) balls[i].rampCool = maxf(0.0f, balls[i].rampCool - dt);
    }
    (void)anyInShooter;

    // Ressort du lance-bille : inactif tant qu'aucune bille ne repose dessus (bille deja lancee, en vol dans le couloir)
    if (in.plunger && onSpring) {
        plungerCharge = minf(1.0f, plungerCharge + dt * 1.15f);
    } else if (prevPlunger_ && !in.plunger && onSpring && plungerCharge > 0.03f) {
        float launchVy = -(360.0f + plungerCharge * 220.0f);
        for (int i = 0; i < MAX_BALLS; i++) {
            if (balls[i].active && balls[i].inShooter && balls[i].y + BALL_RADIUS >= PLUNGER_TOP_Y + plungerCharge * 22.0f - 3.0f && fabsf(balls[i].vy) < 60.0f) {
                balls[i].vy = launchVy;
                balls[i].vx = -18.0f;
            }
        }
        emit(Sfx::Launch, (uint8_t)(plungerCharge * 100.0f));
        plungerCharge = 0.0f;
        introTimer = 0.0f;   // passe immediatement en zoom jeu au tir
    } else {
        plungerCharge = maxf(0.0f, plungerCharge - dt * (in.plunger ? 6.0f : 3.0f));
    }

    // Secousse (Nudge) et jauge de TILT
    tiltMeter = maxf(0.0f, tiltMeter - dt * 0.55f);
    if (nudgePressed && !isTilted) {
        tiltMeter += 1.05f;
        for (int i = 0; i < MAX_BALLS; i++) {
            if (balls[i].active && !balls[i].inShooter) {
                balls[i].vx += (balls[i].x < 112.0f) ? 55.0f : -55.0f;
                balls[i].vy -= 42.0f;
            }
        }
        emit(Sfx::Nudge);
        if (tiltMeter >= 2.85f) {
            isTilted = true;
            showBanner("TILT! FLIPPERS BLOQUES", 2.0f);
            emit(Sfx::Tilt);
        }
    }

    stepPhysics(dt, in);

    int activeCount = 0;
    for (int i = 0; i < MAX_BALLS; i++) if (balls[i].active) activeCount++;
    if (multiballActive && activeCount <= 1 && multiQueue == 0) {
        multiballActive = false;
        touchHud();
    }
    if (activeCount == 0) {
        isTilted = false;
        tiltMeter = 0.0f;
        if (ballSaveTimer > 0.0f) {   // chute directe juste apres le tir : la bille est rendue, sans perdre de bille
            ballSaveTimer = 0.0f;
            ballSaveUsed = true;
            spawnBallInShooter(0);
            showBanner("BILLE SAUVEE !", 1.6f);
            emit(Sfx::NewBall);
            touchHud();
            updateCamera(dt);
            return;
        }
        if (!isTilted && bonusMult > 1) {   // bonus de fin de bille : multiplicateur des banques
            score += 10000u * bonusMult;
            bannerf(1.4f, "BONUS X%u +%uK", (unsigned)bonusMult, (unsigned)(10u * bonusMult));
        }
        bonusMult = 1;
        multiQueue = 0;
        emit(Sfx::Drain);
        if (ballsRemaining > 1) {
            ballsRemaining--;
            ballSaveUsed = false; kickLeftLit = kickRightLit = true;
            spawnBallInShooter(0);
            showBanner("NOUVELLE BILLE", 1.4f);
            emit(Sfx::NewBall);
        } else {
            newRecord = score > recordAtStart_;
            commitScore();
            state = State::GameOver;
            stateLockUntilMs_ = nowMs + 1200;   // un appui sur B/R1 ne saute pas l'ecran de fin
            emit(newRecord ? Sfx::NewRecord : Sfx::GameOver);
        }
        touchHud();
    }

    updateCamera(dt);
}

void Game::requestConfirm(uint8_t action) {
    if (confirmAction == action && nowMs < confirmUntilMs) {
        confirmAction = 0;
        commitScore();
        if (action == 1) {
            startNewGame(tableIdx);
        } else {
            state = State::Menu;
            setupFlippers();
            touchHud();
            emit(Sfx::MenuOk);
        }
    } else {
        confirmAction = action;
        confirmUntilMs = nowMs + 2500;
        emit(Sfx::Confirm);
    }
}

void Game::syncInput(const Input& in) {
    // Appele pendant que le menu systeme est ouvert : les touches deja tenues a sa fermeture
    // (ex. A qui valide « Reprendre ») ne doivent pas compter comme de nouveaux appuis.
    prevLeft_ = in.left;
    prevRight_ = in.right;
    prevPlunger_ = in.plunger;
    prevNudge_ = in.nudge;
    prevPause_ = in.pause;
}

void Game::update(float dtRaw, const Input& in, uint32_t now) {
    nowMs = now;
    float dt = dtRaw > MAX_FRAME_DT ? MAX_FRAME_DT : (dtRaw < 0.0f ? 0.0f : dtRaw);

    const bool leftEdge    = in.left    && !prevLeft_;
    const bool rightEdge   = in.right   && !prevRight_;
    const bool plungerEdge = in.plunger && !prevPlunger_;
    const bool nudgeEdge   = in.nudge   && !prevNudge_;
    const bool pauseEdge   = in.pause   && !prevPause_;

    switch (state) {
        case State::Menu:
            if (leftEdge) {
                tableIdx = (uint8_t)((tableIdx + TABLE_COUNT - 1) % TABLE_COUNT);
                setupFlippers();
                touchHud();
                emit(Sfx::MenuMove, 0);
            } else if (rightEdge) {
                tableIdx = (uint8_t)((tableIdx + 1) % TABLE_COUNT);
                setupFlippers();
                touchHud();
                emit(Sfx::MenuMove, 1);
            } else if (plungerEdge || nudgeEdge) {
                startNewGame(tableIdx);
            }
            break;

        case State::Playing:
            if (pauseEdge) {
                state = State::Paused;
                confirmAction = 0;
                emit(Sfx::Pause);
            } else {
                if (!isTilted && (leftEdge || rightEdge)) {
                    emit(Sfx::Flipper, leftEdge ? 0 : 1);
                    // changement de couloir : les boutons de flippers decalent les lampes du haut (classique)
                    const uint8_t top = rolloverLit & 0x0F;
                    if (top && top != 0x0F) {
                        const uint8_t rot = leftEdge ? (uint8_t)(((top << 1) | (top >> 3)) & 0x0F)
                                                     : (uint8_t)(((top >> 1) | (top << 3)) & 0x0F);
                        rolloverLit = (uint8_t)((rolloverLit & 0xF0) | rot);
                    }
                }
                updatePlaying(dt, in, nudgeEdge, leftEdge || rightEdge);
            }
            break;

        case State::Paused:
            if (confirmAction != 0 && nowMs >= confirmUntilMs) confirmAction = 0;
            if (pauseEdge || plungerEdge) {
                confirmAction = 0;
                state = State::Playing;
                emit(Sfx::Resume);
            } else if (nudgeEdge) {
                requestConfirm(1);
            } else if (leftEdge) {
                requestConfirm(2);
            }
            break;

        case State::GameOver:
            if (nowMs >= stateLockUntilMs_) {
                if (plungerEdge || nudgeEdge) {
                    startNewGame(tableIdx);
                } else if (leftEdge || rightEdge) {   // pas de touche de pause : A / D reviennent a la selection de table
                    state = State::Menu;
                    setupFlippers();
                    touchHud();
                    emit(Sfx::MenuOk);
                }
            }
            break;
    }

    prevLeft_ = in.left;
    prevRight_ = in.right;
    prevPlunger_ = in.plunger;
    prevNudge_ = in.nudge;
    prevPause_ = in.pause;
}

} // namespace pinball
