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
    for (int i = 0; i < MAX_WALLS; i++) wallFlash[i] = 0.0f;
}

void Game::setupFlippers() {
    flipperCount = 0;
    flippers[flipperCount++] = {true,  72.0f,  468.0f, 31.0f,  25.2f * DEG_TO_RAD_F, -28.6f * DEG_TO_RAD_F,  25.2f * DEG_TO_RAD_F,  25.2f * DEG_TO_RAD_F};
    flippers[flipperCount++] = {false, 154.0f, 468.0f, 31.0f, 154.8f * DEG_TO_RAD_F, 208.6f * DEG_TO_RAD_F, 154.8f * DEG_TO_RAD_F, 154.8f * DEG_TO_RAD_F};
    const TableDef& t = tbl();
    for (uint8_t i = 0; i < t.extraFlipperCount; i++) {
        const ExtraFlipperDef& ef = t.extraFlippers[i];
        if (ef.length <= 1.0f) continue;
        float r = ef.restDeg * DEG_TO_RAD_F;
        float a = ef.activeDeg * DEG_TO_RAD_F;
        flippers[flipperCount++] = {ef.isLeft, ef.px, ef.py, ef.length, r, a, r, r};
    }
}

void Game::spawnBallInShooter(int idx) {
    // pose sur la tete du ressort (comme le moteur Web : x = 225, sommet du ressort a y = 478, bille de rayon 5,2)
    balls[idx] = {225.0f, PLUNGER_TOP_Y - BALL_RADIUS, 0.0f, 0.0f, true, true, 0.0f, 0.0f};
}

void Game::advanceMission(uint8_t kind) {
    const MissionDef& m = tbl().missions[missionIdx % 3];
    if (m.kind != kind) return;
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

void Game::collideBallSegment(Ball& b, float x1, float y1, float x2, float y2, float restitution,
                              float extraKick, int wallIndex, float thick) {
    float dx = x2 - x1;
    float dy = y2 - y1;
    float lenSq = dx * dx + dy * dy;
    if (lenSq < 0.001f) return;

    float t = ((b.x - x1) * dx + (b.y - y1) * dy) / lenSq;
    t = clampf(t, 0.0f, 1.0f);
    float cx = x1 + t * dx;
    float cy = y1 + t * dy;

    float nx = b.x - cx;
    float ny = b.y - cy;
    float distSq = nx * nx + ny * ny;
    const float reach = BALL_RADIUS + thick;
    if (distSq >= reach * reach || distSq < 0.0001f) return;

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
    }
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

    for (int i = 0; i < MAX_BALLS; i++) {
        Ball& b = balls[i];
        if (!b.active) continue;

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
            float ex = fl.px + cosf(fl.angleRad) * fl.length;
            float ey = fl.py + sinf(fl.angleRad) * fl.length;
            float angVel = fabsf(fl.angleRad - fl.prevAngleRad) / dt;
            float kick = (angVel > 1.5f) ? 235.0f : 0.0f;
            collideBallSegment(b, fl.px, fl.py, ex, ey, 0.58f, kick, -1, f < 2 ? 4.2f : 3.7f);
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
                score += bmp.points;
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
                Vec2 exitP = t.ramps[r].pts[4];
                float dx = b.x - entry.x;
                float dy = b.y - entry.y;
                float rad = t.ramps[r].entryRadius;
                if (dx * dx + dy * dy < rad * rad) {
                    b.x = exitP.x;
                    b.y = exitP.y;
                    // Jamais vx = 0 : une bille qui retombe pile sur l'extremite d'un mur (sommet d'un
                    // slingshot, sous la sortie des rampes) y resterait en equilibre indefiniment.
                    b.vx = (exitP.x < 112.0f) ? -35.0f : 35.0f;
                    if (exitP.y < 300.0f) b.vx = (exitP.x < 112.0f) ? 35.0f : -35.0f;
                    b.vy = 95.0f;
                    b.rampCool = 0.75f;
                    score += t.ramps[r].points;
                    advanceMission(1);
                    bannerf(1.3f, "%s +%lu", t.ramps[r].name, (unsigned long)t.ramps[r].points);
                    emit(Sfx::Ramp, r);
                    touchHud();
                    break;
                }
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
    for (int i = 0; i < wallCount; i++) if (wallFlash[i] > 0.0f) wallFlash[i] = maxf(0.0f, wallFlash[i] - dt);
    if (rolloverFlash > 0.0f) rolloverFlash = maxf(0.0f, rolloverFlash - dt);
    if (ballSaveTimer > 0.0f) ballSaveTimer = maxf(0.0f, ballSaveTimer - dt);

    bool anyInShooter = false;
    for (int i = 0; i < MAX_BALLS; i++) {
        if (balls[i].active && balls[i].inShooter) anyInShooter = true;
        if (balls[i].active && balls[i].rampCool > 0.0f) balls[i].rampCool = maxf(0.0f, balls[i].rampCool - dt);
    }

    // Ressort du lance-bille
    if (in.plunger && anyInShooter) {
        plungerCharge = minf(1.0f, plungerCharge + dt * 1.15f);
    } else if (prevPlunger_ && !in.plunger && anyInShooter) {
        float launchVy = -(360.0f + plungerCharge * 220.0f);
        for (int i = 0; i < MAX_BALLS; i++) {
            if (balls[i].active && balls[i].inShooter) {
                balls[i].vy = launchVy;
                balls[i].vx = -18.0f;
            }
        }
        emit(Sfx::Launch, (uint8_t)(plungerCharge * 100.0f));
        plungerCharge = 0.0f;
        introTimer = 0.0f;   // passe immediatement en zoom jeu au tir
    } else {
        plungerCharge = maxf(0.0f, plungerCharge - dt * 3.0f);
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
    if (multiballActive && activeCount <= 1) {
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
