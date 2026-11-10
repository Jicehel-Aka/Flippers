// Laboratoire de test : 3 profils de joueurs (expert flipper, arcade, debutant) sur chaque table.
// Mesure ce qu'un testeur ressent : duree de bille, drains precoces, billes coincees, score, missions, mecaniques utilisees.
// Usage : playtest [parties_par_profil]
#include <cstdio>
#include <cmath>
#include <cstdlib>
#include <cstring>
#include "../../main/game/pinball_core.h"
using namespace pinball;

static uint32_t g_store[TABLE_COUNT];
static void st_load(uint32_t o[TABLE_COUNT]) { for (int i = 0; i < TABLE_COUNT; i++) o[i] = g_store[i]; }
static void st_save(const uint32_t in[TABLE_COUNT]) { for (int i = 0; i < TABLE_COUNT; i++) g_store[i] = in[i]; }

static uint32_t rs = 1;
static float rnd() { rs = rs * 1664525u + 1013904223u; return (rs >> 8) / 16777216.0f; }

enum Profile { EXPERT, ARCADE, NOVICE };
static const char* PN[] = {"flipper-fou", "arcade", "debutant"};

struct Pilot {
    Profile p; float clock = 0, chargeT = 0, chargeLen = 0; bool charging = false;
    float lateL = -1, lateR = -1; float mashL = 0, mashR = 0; bool mL = false, mR = false;
};

static Input decide(const Game& g, Pilot& k, float dt) {
    Input in;
    bool inLane = false, settled = false;
    for (int i = 0; i < MAX_BALLS; i++) {
        const Ball& b = g.balls[i];
        if (!b.active || !b.inShooter) continue;
        inLane = true; if (b.y > 470 && fabsf(b.vy) < 8) settled = true;
    }
    if (!inLane) k.charging = false;
    if (settled && !k.charging) {
        k.charging = true; k.chargeT = 0;
        k.chargeLen = k.p == EXPERT ? 0.85f + rnd() * 0.1f : k.p == ARCADE ? 0.5f + rnd() * 0.5f : 0.15f + rnd() * 1.1f;
    }
    if (k.charging) { k.chargeT += dt; in.plunger = k.chargeT < k.chargeLen; if (k.chargeT > 1.5f) k.charging = false; }

    bool wantL = false, wantR = false;
    for (int i = 0; i < MAX_BALLS; i++) {
        const Ball& b = g.balls[i];
        if (!b.active || b.inShooter || b.y < 330) continue;
        const bool left = b.x < 113;
        const float tipX = left ? 100.0f : 126.0f;
        float win = k.p == EXPERT ? 30.0f : k.p == ARCADE ? 22.0f : 14.0f;
        const bool atTip = b.y > 430.0f && fabsf(b.x - tipX) < win && b.vy > -20.0f;
        if (atTip) { if (left) wantL = true; else wantR = true; }
    }
    float& lt = k.lateL; float& rt = k.lateR;
    float delayMax = k.p == EXPERT ? 0.02f : k.p == ARCADE ? 0.09f : 0.22f;
    if (wantL) { if (lt < 0) lt = rnd() * delayMax; lt -= dt; wantL = lt <= 0; } else lt = -1;
    if (wantR) { if (rt < 0) rt = rnd() * delayMax; rt -= dt; wantR = rt <= 0; } else rt = -1;
    if (k.p == NOVICE) {   // matraquage : appuie au hasard, parfois les deux, parfois trop tot
        k.mashL -= dt; k.mashR -= dt;
        if (k.mashL <= 0) { k.mL = rnd() < 0.45f; k.mashL = 0.1f + rnd() * 0.4f; }
        if (k.mashR <= 0) { k.mR = rnd() < 0.45f; k.mashR = 0.1f + rnd() * 0.4f; }
        wantL = wantL || k.mL; wantR = wantR || k.mR;
    } else if (fmodf(k.clock, 2.2f) < 0.2f && k.p == ARCADE) { wantL = wantR = true; }
    in.left = wantL; in.right = wantR;
    k.clock += dt;
    return in;
}

struct Stats {
    int games = 0; double score = 0, ballSec = 0; int balls = 0, earlyDrain = 0, stuck = 0, drains = 0;
    int ramps = 0, bumpers = 0, missions = 0, multi = 0, lock = 0, saves = 0, tilt = 0; double gameSec = 0, firstScore = 0;
    int noScoreBalls = 0;
};

int main(int argc, char** argv) {
    HighScoreStore store; store.load = st_load; store.save = st_save;
    if (argc > 4 && !strcmp(argv[1], "trace")) {   // playtest trace <table> <profil 0..2> <periode_s> [graine]
        const int t = atoi(argv[2]), pr = atoi(argv[3]); const float per = (float)atof(argv[4]);
        rs = argc > 5 ? (uint32_t)atoi(argv[5]) : 1000 + t * 13 + pr * 5;
        Game g; g.begin(store); g.startNewGame((uint8_t)t); Pilot k; k.p = (Profile)pr; uint32_t ms = 0;
        for (int i = 0; i < 60 * 600 && g.state == State::Playing; i++) {
            Input in = decide(g, k, 1.0f / 60); ms += 17; g.update(1.0f / 60, in, ms);
            SfxEvent e; while (g.popSfx(e)) if (e.id == Sfx::Drain) printf("   -- DRAIN t=%.1f\n", i / 60.0f);
            if (i % (int)(per * 60) == 0) {
                printf("t=%5.1f bille=%d score=%u |", i / 60.0f, g.ballsRemaining, g.score);
                for (int b = 0; b < MAX_BALLS; b++) { const Ball& ba = g.balls[b]; if (!ba.active) continue;
                    printf(" (%.0f,%.0f v%.0f,%.0f L%d R%d%s%s)", ba.x, ba.y, ba.vx, ba.vy, ba.layer, ba.ramp, ba.inShooter ? " shoot" : "", ba.held ? " held" : ""); }
                printf("\n"); }
        }
        return 0;
    }
    const int N = argc > 1 ? atoi(argv[1]) : 4;
    printf("%-22s %-12s %7s %7s %6s %6s %6s %6s %6s %6s %6s\n", "TABLE", "PROFIL", "score", "bille_s", "<10s%", "coince", "rampe", "bump", "miss", "multi", "partie_s");
    for (int t = 0; t < TABLE_COUNT; t++) {
        for (int pr = 0; pr < 3; pr++) {
            Stats s;
            for (int n = 0; n < N; n++) {
                rs = 1000 + n * 77 + t * 13 + pr * 5;
                Game g; g.begin(store); g.startNewGame((uint8_t)t);
                Pilot k; k.p = (Profile)pr;
                uint32_t ms = 0; float ballT = 0, stillT = 0; uint8_t prevRem = g.ballsRemaining; int scoreAtBallStart = 0;
                bool stuckFlag = false;
                for (int i = 0; i < 60 * 600 && g.state == State::Playing; i++) {
                    Input in = decide(g, k, 1.0f / 60);
                    ms += 17; g.update(1.0f / 60, in, ms);
                    SfxEvent e;
                    while (g.popSfx(e)) {
                        if (e.id == Sfx::Ramp) s.ramps++; else if (e.id == Sfx::Bumper) s.bumpers++;
                        else if (e.id == Sfx::Mission) s.missions++; else if (e.id == Sfx::Multiball) s.multi++;
                        else if (e.id == Sfx::Tilt) s.tilt++;
                        else if (e.id == Sfx::Drain) { s.drains++; if (ballT < 10.0f) s.earlyDrain++; s.ballSec += ballT; s.balls++; if ((int)g.score == scoreAtBallStart) s.noScoreBalls++; ballT = 0; scoreAtBallStart = (int)g.score; }
                    }
                    bool moving = false, any = false;
                    for (int b = 0; b < MAX_BALLS; b++) { const Ball& ba = g.balls[b]; if (!ba.active || ba.inShooter || ba.held || ba.ramp >= 0) continue; any = true; if (fabsf(ba.vx) + fabsf(ba.vy) > 8.0f) moving = true; }
                    if (any) { ballT += 1.0f / 60; stillT = moving ? 0 : stillT + 1.0f / 60; if (stillT > 4.0f && !stuckFlag) { s.stuck++; stuckFlag = true; if (getenv("STUCKLOG")) { for (int q = 0; q < MAX_BALLS; q++) if (g.balls[q].active && !g.balls[q].inShooter) printf("  coince %s/%s t=%d (%.0f,%.0f) L%d held=%d\n", table(t).name, PN[pr], i / 60, g.balls[q].x, g.balls[q].y, g.balls[q].layer, g.balls[q].held); } } if (moving) stuckFlag = false; }
                    (void)prevRem;
                    s.gameSec += 1.0 / 60;
                }
                s.games++; s.score += g.score;
            }
            printf("%-22s %-12s %7.0f %7.1f %5.0f%% %6.1f %6.1f %6.1f %6.1f %6.1f %6.0f\n", table(t).name, PN[pr], s.score / s.games,
                   s.balls ? s.ballSec / s.balls : 0.0, s.balls ? 100.0 * s.earlyDrain / s.balls : 0.0, (double)s.stuck / s.games,
                   (double)s.ramps / s.games, (double)s.bumpers / s.games, (double)s.missions / s.games, (double)s.multi / s.games, s.gameSec / s.games);
        }
    }
    return 0;
}
