// Test hote du coeur de jeu + du rendu : compile sous g++, sans ESP-IDF ni materiel.
//   bash firmware/aka_idf/test/host/run.sh [dossier_captures]
#include "../../main/game/pinball_core.h"
#include "../../main/game/sfx_patterns.h"
#include "../../main/game/music.h"
#include "../../main/ui/gfx.h"
#include "../../main/ui/render.h"
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

namespace vid {
extern uint16_t g_fb[];
void dump_ppm(const char* path);
unsigned count_non_background(uint16_t bg);
}

using namespace pinball;
static float clampf(float v, float lo, float hi) { return v < lo ? lo : (v > hi ? hi : v); }

static int g_fail = 0;
#define CHECK(cond, ...)                                  \
    do {                                                  \
        if (!(cond)) {                                    \
            g_fail++;                                     \
            printf("  ECHEC: " #cond " -- ");             \
            printf(__VA_ARGS__);                          \
            printf("\n");                                 \
        }                                                 \
    } while (0)

static uint32_t g_store[TABLE_COUNT];
static int g_saves = 0;
static void store_load(uint32_t out[TABLE_COUNT]) { for (int i = 0; i < TABLE_COUNT; i++) out[i] = g_store[i]; }
static void store_save(const uint32_t in[TABLE_COUNT]) { for (int i = 0; i < TABLE_COUNT; i++) g_store[i] = in[i]; g_saves++; }
static HighScoreStore STORE() { HighScoreStore s; s.load = store_load; s.save = store_save; return s; }

struct SfxCount { int n[32]; };
static void drain(Game& g, SfxCount& c) {
    SfxEvent e;
    while (g.popSfx(e)) c.n[(int)e.id]++;
}

static uint32_t g_ms = 0;
static void tick(Game& g, const Input& in, float dt, SfxCount* c = nullptr) {
    g_ms += (uint32_t)(dt * 1000.0f + 0.5f);
    g.update(dt, in, g_ms);
    if (c) drain(g, *c);
}

// Bot : tire le ressort puis frappe quand une bille est pres des flippers
struct Bot { float t = 0; bool charging = false; float clock = 0; };
static Input bot_input(const Game& g, Bot& b, float dt) {
    Input in;
    bool settled = false, inLane = false;
    for (int i = 0; i < MAX_BALLS; i++) {
        const Ball& ba = g.balls[i];
        if (!ba.active || !ba.inShooter) continue;
        inLane = true;
        if (ba.y > 470 && fabsf(ba.vy) < 8) settled = true;
    }
    if (!inLane) b.charging = false;
    if (settled && !b.charging) { b.charging = true; b.t = 0; }
    if (b.charging) {
        b.t += dt;
        in.plunger = b.t < 0.9f;
        if (b.t > 1.4f) b.charging = false;   // laisse partir la bille, puis recommence si elle est revenue
    }
    for (int i = 0; i < MAX_BALLS; i++) {
        const Ball& ba = g.balls[i];
        if (!ba.active || ba.inShooter || ba.y < 330) continue;
        // Comme un joueur : on arme le flipper quand la bille arrive pres de sa pointe, sinon on relache.
        const bool left = ba.x < 113;
        const float tipX = left ? 100.0f : 126.0f;
        const bool atTip = ba.y > 430.0f && fabsf(ba.x - tipX) < 26.0f && ba.vy > -20.0f;
        const bool wiggle = fmodf(b.clock, 2.0f) < 0.25f;               // petit coup de flipper de temps en temps
        if (!atTip && !wiggle) continue;
        if (left) in.left = true; else in.right = true;
    }
    b.clock += dt;
    return in;
}

static void test_tables() {
    printf("[tables]\n");
    for (int t = 0; t < TABLE_COUNT; t++) {
        const TableDef& d = table(t);
        printf("  %d: %-22s bumpers=%d extra=%d\n", t, d.name, d.bumperCount, d.extraFlipperCount);
        CHECK(d.bumperCount >= 3, "%s : un flipper sans bumpers n'en est pas un", d.name);
        CHECK(d.bumperCount <= MAX_BUMPERS, "trop de bumpers");
        for (int k = 0; k < d.bumperCount; k++) {
            const BumperDef& b = d.bumpers[k];
            CHECK(b.x > 20 && b.x < 205 && b.y > 30 && b.y < 440, "%s bumper %d hors plateau (%.0f,%.0f)", d.name, k, b.x, b.y);
            CHECK(b.points > 0 && b.r > 5, "bumper %d sans points/rayon", k);
        }
        for (int r = 0; r < 2; r++) CHECK(d.ramps[r].entryRadius > 5, "rampe %d : rayon d'entree", r);
        CHECK(d.gravity > 250 && d.gravity < 400, "gravite %.0f", d.gravity);
        for (int m = 0; m < 3; m++) CHECK(d.missions[m].goal > 0 && d.missions[m].title[0], "mission %d vide", m);
    }
    CHECK(strstr(table(2).name, "STAR WARS") != nullptr, "la table 3 doit etre Star Wars (%s)", table(2).name);
}

static void test_play_all_tables() {
    printf("[parties au bot, toutes les tables]\n");
    int bumperTables = 0;
    for (int t = 0; t < TABLE_COUNT; t++) {
        Game g;
        g.begin(STORE());
        g.startNewGame((uint8_t)t);
        Bot bot;
        SfxCount c = {};
        int bad = 0;
        for (int i = 0; i < 60 * 90 && g.state == State::Playing; i++) {   // 90 s a 60 FPS
            Input in = bot_input(g, bot, 1.0f / 60);
            tick(g, in, 1.0f / 60, &c);
            for (int b = 0; b < MAX_BALLS; b++) {
                const Ball& ba = g.balls[b];
                if (!ba.active) continue;
                if (!isfinite(ba.x) || !isfinite(ba.y) || !isfinite(ba.vx) || !isfinite(ba.vy)) bad++;
                if (ba.x < 0 || ba.x > 242 || ba.y < -5 || ba.y > 540) bad++;
            }
        }
        printf("  %-22s score=%lu bumpers=%d flippers=%d launch=%d ramp=%d etat=%d\n", g.tbl().name, (unsigned long)g.score,
               c.n[(int)Sfx::Bumper], c.n[(int)Sfx::Flipper], c.n[(int)Sfx::Launch], c.n[(int)Sfx::Ramp], (int)g.state);
        CHECK(bad == 0, "%s : valeurs invalides ou bille hors plateau (%d)", g.tbl().name, bad);
        if (c.n[(int)Sfx::Bumper] > 0) bumperTables++; else printf("  (info) %s : aucun bumper touche par le bot en 90 s\n", g.tbl().name);
        CHECK(c.n[(int)Sfx::Launch] > 0, "%s : aucun lancer", g.tbl().name);
        CHECK(c.n[(int)Sfx::Flipper] > 0, "%s : aucun son de flipper", g.tbl().name);
        CHECK(g.score > 0, "%s : pas de score", g.tbl().name);
    }
    CHECK(bumperTables >= TABLE_COUNT - 2, "le bot doit toucher des bumpers sur presque toutes les tables (%d/%d)", bumperTables, TABLE_COUNT);
}

static void test_framerate_independence() {
    printf("[independance au framerate]\n");
    float ref_y = 0, ref_x = 0;
    const int fps[] = {25, 30, 50, 60, 100};
    for (int k = 0; k < 5; k++) {
        Game g;
        g.begin(STORE());
        g.startNewGame(0);
        g.introTimer = 0;
        Ball& b = g.balls[0];
        b.inShooter = false; b.x = 160; b.y = 140; b.vx = 12; b.vy = 0;
        float dt = 1.0f / fps[k];
        int frames = (int)(0.6f * fps[k] + 0.5f);   // meme duree simulee (0,6 s) quelle que soit la cadence
        for (int i = 0; i < frames; i++) tick(g, Input(), dt);
        if (k == 0) { ref_x = g.balls[0].x; ref_y = g.balls[0].y; }
        printf("  %3d FPS -> (%.2f, %.2f)\n", fps[k], g.balls[0].x, g.balls[0].y);
        CHECK(fabsf(g.balls[0].x - ref_x) < 0.8f && fabsf(g.balls[0].y - ref_y) < 0.8f, "ecart a %d FPS", fps[k]);
    }
}

static void test_state_machine() {
    printf("[etats : menu / pause / fin de partie / records]\n");
    memset(g_store, 0, sizeof(g_store));
    for (int i = 0; i < TABLE_COUNT; i++) g_store[i] = 25000;
    g_saves = 0;
    Game g;
    g.begin(STORE());
    CHECK(g.state == State::Menu, "demarrage en menu");
    CHECK(g.highScores[0] == 25000, "records charges");

    Input in;
    in.right = true; tick(g, in, 0.016f); in.right = false; tick(g, in, 0.016f);
    CHECK(g.tableIdx == 1, "navigation menu");
    in.plunger = true; tick(g, in, 0.016f); in.plunger = false; tick(g, in, 0.016f);
    CHECK(g.state == State::Playing, "demarrage de partie");

    // pause + confirmations en deux temps
    in = Input(); in.pause = true; tick(g, in, 0.016f); in = Input(); tick(g, in, 0.016f);
    CHECK(g.state == State::Paused, "pause");
    g.score = 123;
    in = Input(); in.nudge = true; tick(g, in, 0.016f); in = Input(); tick(g, in, 0.016f);
    CHECK(g.state == State::Paused && g.score == 123, "un appui ne recommence pas");
    in = Input(); in.nudge = true; tick(g, in, 0.016f); in = Input(); tick(g, in, 0.016f);
    CHECK(g.state == State::Playing && g.score == 0, "le second appui confirme");

    // partie sans jouer -> fin de partie
    int frames = 0;
    while (g.state == State::Playing && frames < 60 * 120) {
        Input idle;
        if (g.balls[0].inShooter) { idle.plunger = (frames % 90) < 50; }   // tire sans jamais toucher aux flippers
        tick(g, idle, 1.0f / 30);
        frames++;
    }
    printf("  fin de partie apres %.1f s simules\n", frames / 30.0f);
    CHECK(g.state == State::GameOver, "la partie doit se terminer (%d)", (int)g.state);

    // anti-rebond de l'ecran de fin
    in = Input(); in.nudge = true; tick(g, in, 0.016f); in = Input(); tick(g, in, 0.016f);
    CHECK(g.state == State::GameOver, "appui immediat ignore (verrou 1,2 s)");
    for (int i = 0; i < 80; i++) tick(g, Input(), 0.016f);
    in = Input(); in.nudge = true; tick(g, in, 0.016f);
    CHECK(g.state == State::Playing, "rejouer apres le verrou");

    // Reprise depuis le menu systeme : une touche deja tenue (A qui valide « Reprendre ») n'est pas un nouvel appui.
    {
        Game m;
        m.begin(STORE());
        m.startNewGame(1);
        const uint32_t sc = m.score;
        Input held; held.left = true;
        m.syncInput(held);                        // pendant que le menu est ouvert
        tick(m, held, 0.016f);                    // premiere image apres la reprise, touche encore tenue
        CHECK(m.state == State::Playing && m.score == sc, "la reprise garde la partie en cours");
        Input none;
        CHECK(!none.pause, "aucune pause par defaut");
    }
    {   // fin de partie : A / D reviennent a la selection de table (plus de touche de pause)
        Game e;
        e.begin(STORE());
        e.startNewGame(0);
        for (int i = 0; i < MAX_BALLS; i++) e.balls[i].active = false;
        e.ballsRemaining = 1;
        tick(e, Input(), 0.016f);
        CHECK(e.state == State::GameOver, "fin de partie");
        for (int i = 0; i < 80; i++) tick(e, Input(), 0.016f);
        Input l; l.left = true; tick(e, l, 0.016f);
        CHECK(e.state == State::Menu, "A en fin de partie : retour a la selection de table");
    }

    // record : sauvegarde unique a la fin de partie
    g_saves = 0;
    Game h;
    h.begin(STORE());
    h.startNewGame(0);
    h.score = 99999;
    for (int i = 0; i < MAX_BALLS; i++) h.balls[i].active = false;
    h.ballsRemaining = 1;
    tick(h, Input(), 0.016f);
    CHECK(h.state == State::GameOver && h.newRecord && g_saves == 1 && g_store[0] == 99999, "nouveau record sauvegarde (%d ecritures)", g_saves);
}

static void test_multiball_and_lock() {
    printf("[verrou multibille]\n");
    Game g;
    g.begin(STORE());
    g.startNewGame(2);   // Star Wars
    g.introTimer = 0;
    const TableDef& t = g.tbl();
    SfxCount c = {};
    {   // puits eteint : une bille posee dessus n'est PAS capturee
        Ball& b = g.balls[0];
        b.active = true; b.inShooter = false; b.rampCool = 0; b.vx = 0; b.vy = 0;
        b.x = t.lockPos.x; b.y = t.lockPos.y;
        g.stepPhysics(0.01f, Input());
        CHECK(g.lockedBalls == 0, "puits eteint : pas de capture");
    }
    for (int k = 0; k < 2; k++) {
        g.lockLit = true;
        Ball& b = g.balls[0];
        b.active = true; b.inShooter = false; b.rampCool = 0; b.vx = 0; b.vy = 0;
        b.x = t.lockPos.x; b.y = t.lockPos.y;
        g.stepPhysics(0.01f, Input());
        drain(g, c);
    }
    CHECK(g.multiballActive, "2 billes verrouillees -> multibille");
    int active = 0;
    for (int i = 0; i < MAX_BALLS; i++) active += g.balls[i].active;
    CHECK(active == 3, "3 billes en jeu (%d)", active);
    CHECK(c.n[(int)Sfx::Lock] == 1 && c.n[(int)Sfx::Multiball] == 1, "sons verrou/multibille");
    CHECK(strstr(g.bannerText, "ESCADRON") != nullptr, "bandeau Star Wars: %s", g.bannerText);
}

static void test_rollovers() {
    printf("[rollovers]\n");
    for (int ti = 0; ti < TABLE_COUNT; ti++) {
        Game g;
        g.begin(STORE());
        g.startNewGame((uint8_t)ti);
        const TableDef& t = g.tbl();
        for (int k = 0; k < 4; k++) {   // couloirs du haut : la bille passe sur chacun
            for (int i = 0; i < MAX_BALLS; i++) g.balls[i].active = false;
            g.balls[0] = {t.rollovers[k].x, t.rollovers[k].y, 0, 0, true, false, 0.0f, 0.0f};
            const uint32_t before = g.score;
            g.stepPhysics(0.004f, Input());
            if (k < 3) {
                CHECK(g.rolloverLit & (1u << k), "table %d : rollover %d non allume", ti, k);
                CHECK(g.score >= before + t.rollovers[k].points, "table %d : rollover %d sans points", ti, k);
            }
        }
        CHECK((g.rolloverLit & 0x0F) == 0 && g.rolloverFlash > 0.0f, "table %d : 4 couloirs = bonus + clignotement (lit=%02x)", ti, g.rolloverLit);
        for (int k = 4; k < 6; k++) {   // retours
            for (int i = 0; i < MAX_BALLS; i++) g.balls[i].active = false;
            g.balls[0] = {t.rollovers[k].x, t.rollovers[k].y, 0, 0, true, false, 0.0f, 0.0f};
            g.stepPhysics(0.004f, Input());
        }
        CHECK((g.rolloverLit & 0x30) == 0, "table %d : 2 retours = bonus (lit=%02x)", ti, g.rolloverLit);
    }
    printf("  4 tables : allumage, bonus des couloirs et des retours\n");
}

// Le decor doit tomber EXACTEMENT sous les coordonnees du jeu : les 4 anneaux de rollovers du haut (Star Wars,
// asymetriques par rapport a l'axe central) doivent se retrouver a leur place dans l'image rendue.
static void test_art_alignment() {
    printf("[alignement decor / coordonnees du jeu]\n");
    Game g;
    g.begin(STORE());
    g.startNewGame(2);
    g.introTimer = 0.0f;
    g.cameraZoom = 1.0f;
    g.cameraY = 0.0f;
    render::draw(g);
    const TableDef& t = g.tbl();
    int found = 0;
    for (int k = 0; k < 4; k++) {
        const RolloverDef& ro = t.rollovers[k];
        bool ok = false;
        for (int dx = -7; dx <= -5 && !ok; dx++) {
            for (int dy = -1; dy <= 0 && !ok; dy++) {
                const int px = (int)ro.x + dx, py = (int)ro.y + dy;      // pixel du plateau (portrait)
                const uint16_t c = vid::g_fb[(239 - px) * 320 + (HUD_H + py)];  // rotation : sx = HUD_H + y, sy = 239 - x
                const int r = (c & 31) << 3, gg = ((c >> 5) & 63) << 2, b = ((c >> 11) & 31) << 3;
                if (abs(r - 71) < 45 && abs(gg - 85) < 45 && abs(b - 105) < 45) ok = true;
            }
        }
        found += ok ? 1 : 0;
    }
    CHECK(found == 4, "anneaux de rollovers du decor retrouves a leur place : %d/4 (decor inverse ou decale ?)", found);
    printf("  %d/4 anneaux du decor sous les coordonnees des rollovers\n", found);
}

static void test_art() {
    printf("[decors pre-rendus]\n");
    for (int i = 0; i < TABLE_COUNT; i++) {
        const uint8_t* a = render::table_art(i);
        CHECK(a != nullptr, "plateau %d : image de decor introuvable (node scripts/gen-aka-art.mjs)", i);
        if (!a) continue;
        unsigned nonBlack = 0;
        for (int k = 0; k < 240 * 520; k += 7) { uint16_t px = (uint16_t)(a[k * 2] | (a[k * 2 + 1] << 8)); if (px) nonBlack++; }
        CHECK(nonBlack > 240 * 520 / 7 / 2, "plateau %d : image de decor presque noire", i);
    }
    printf("  %d images de decor presentes\n", TABLE_COUNT);
}

static void test_launch_and_save() {
    printf("[lanceur et protection]\n");
    Game g; g.begin(STORE()); g.startNewGame(0);
    Input in;
    for (int i = 0; i < 120; i++) tick(g, in, 1.0f / 60.0f);
    CHECK(fabsf(g.balls[0].y - (PLUNGER_TOP_Y - BALL_RADIUS)) < 0.6f, "bille posee sur la tete du ressort (y=%.1f)", g.balls[0].y);
    // ressort tendu : la tete (donc la bille) descend
    in.plunger = true;
    for (int i = 0; i < 40; i++) tick(g, in, 1.0f / 60.0f);
    CHECK(g.balls[0].y > PLUNGER_TOP_Y - BALL_RADIUS + 3.0f, "la bille suit le ressort tendu (y=%.1f)", g.balls[0].y);
    // protection : bille hors du couloir, puis chute directe -> rendue, une seule fois
    g.startNewGame(0);
    g.balls[0].x = 113; g.balls[0].y = 300; g.balls[0].vx = 0; g.balls[0].vy = 0; g.balls[0].inShooter = false;
    g.ballSaveTimer = BALL_SAVE_SEC;
    const int before = g.ballsRemaining;
    in = Input();
    g.balls[0].y = 600;   // sous le plateau
    for (int i = 0; i < 30; i++) tick(g, in, 1.0f / 60.0f);
    CHECK(g.ballsRemaining == before && g.ballSaveUsed, "bille sauvee sans perdre de bille");
    g.balls[0].x = 113; g.balls[0].inShooter = false; g.balls[0].y = 600; g.ballSaveTimer = 0.0f;
    for (int i = 0; i < 30; i++) tick(g, in, 1.0f / 60.0f);
    CHECK(g.ballsRemaining == before - 1, "sans protection la bille est perdue");
}

static void test_containment() {
    printf("[etancheite des bords]\n");
    uint32_t seed = 12345;
    auto rnd = [&]() { seed = seed * 1664525u + 1013904223u; return (float)((seed >> 8) & 0xFFFF) / 65535.0f; };
    for (int t = 0; t < TABLE_COUNT; t++) {
        int escapes = 0; float ex = 0, ey = 0;
        for (int trial = 0; trial < 120; trial++) {
            Game g; g.begin(STORE()); g.startNewGame((uint8_t)t);
            g.ballSaveTimer = 0.0f; g.ballSaveUsed = true; g.introTimer = 0.0f;
            float x = 20.0f + rnd() * 180.0f, y = 40.0f + rnd() * 420.0f;
            float sp = 150.0f + rnd() * 700.0f, an = rnd() * 6.2832f;
            g.balls[0] = {x, y, cosf(an) * sp, sinf(an) * sp, true, false, 0.0f, 0.0f};
            Input in;
            for (int f = 0; f < 60 * 8 && g.state == State::Playing; f++) {
                in.left = in.right = ((f / 7) & 1);
                tick(g, in, 1.0f / 60.0f);
                const Ball& b = g.balls[0];
                if (!b.active) break;
                const bool bad = b.x < 9.0f || b.x > 236.0f || b.y < 8.0f || (b.y > 520.0f && b.x < 209.0f && false);
                if (bad && !b.inShooter) { escapes++; ex = b.x; ey = b.y; break; }
            }
        }
        CHECK(escapes == 0, "table %d : %d billes sorties du plateau (derniere en %.0f,%.0f)", t, escapes, ex, ey);
    }
}

static const TableDef& tbl_of(int t) { return table(t); }

static void test_ramp_follow() {
    printf("[rampes : trajectoire continue]\n");
    int checked = 0;
    for (int t = 0; t < TABLE_COUNT; t++) {
        for (int r = 0; r < 2; r++) {
            Game g; g.begin(STORE()); g.startNewGame((uint8_t)t); g.introTimer = 0.0f;
            g.ballSaveUsed = true;
            const Vec2 en = tbl_of(t).ramps[r].pts[0];
            g.balls[0] = {en.x, en.y + 4.0f, 0.0f, -260.0f, true, false, 0.0f, 0.0f};
            Input in;
            float px = g.balls[0].x, py = g.balls[0].y, maxJump = 0.0f;
            bool onRamp = false, left = false;
            for (int f = 0; f < 60 * 5 && !left; f++) {
                tick(g, in, 1.0f / 60.0f);
                const Ball& b = g.balls[0];
                if (b.ramp >= 0) onRamp = true;
                const float d = hypotf(b.x - px, b.y - py);
                if (onRamp && b.ramp >= 0 && d > maxJump) maxJump = d;
                if (onRamp && b.ramp < 0) left = true;
                px = b.x; py = b.y;
            }
            CHECK(onRamp && left, "table %d rampe %d : la bille doit entrer puis ressortir (%d/%d)", t, r, onRamp, left);
            CHECK(maxJump < 8.0f, "table %d rampe %d : saut de %.1f px sur la rampe (teleportation)", t, r, maxJump);
            checked++;
        }
    }
    printf("  %d rampes suivies sans teleportation\n", checked);
}

static void test_hunt() {
    printf("[cibles mobiles et bumper dore]\n");
    int tested = 0;
    for (int t = 0; t < TABLE_COUNT; t++) {
        const TableDef& td = tbl_of(t);
        if (td.hunt.kind) {
            Game g; g.begin(STORE()); g.startNewGame((uint8_t)t); g.introTimer = 0.0f;
            g.ballSaveUsed = true;
            Input in;
            int relocated = 0;
            uint32_t prize = 0;
            for (int h = 0; h < td.hunt.goal; h++) {
                const Vec2 sp = td.hunt.slots[g.huntSlot % td.hunt.slotCount];
                const uint8_t before = g.huntSlot;
                const uint32_t sc = g.score;
                g.balls[0] = {sp.x, sp.y - td.hunt.radius - 6.0f, 0.0f, 40.0f, true, false, 0.0f, 0.0f};
                for (int f = 0; f < 20 && g.huntSlot == before; f++) tick(g, in, 1.0f / 60.0f);
                if (g.huntSlot != before) relocated++;
                prize = g.score - sc;
            }
            CHECK(relocated == td.hunt.goal, "table %d : la cible doit changer de place a chaque touche (%d/%d)", t, relocated, td.hunt.goal);
            CHECK(prize >= td.hunt.reward, "table %d : prime de %u attendue au %de coup (obtenu %u)", t, td.hunt.reward, td.hunt.goal, prize);
            tested++;
        }
        if (td.rotateBumper) {
            Game g; g.begin(STORE()); g.startNewGame((uint8_t)t); g.introTimer = 0.0f;
            g.ballSaveUsed = true;
            Input in;
            const uint8_t k = g.litBumper % td.bumperCount;
            const BumperDef& bm = td.bumpers[k];
            const uint32_t sc = g.score;
            g.balls[0] = {bm.x, bm.y - bm.r - 6.0f, 0.0f, 60.0f, true, false, 0.0f, 0.0f};
            for (int f = 0; f < 20 && g.litBumper == k; f++) tick(g, in, 1.0f / 60.0f);
            CHECK(g.litBumper != k, "table %d : le bumper dore doit changer apres la touche", t);
            CHECK(g.score - sc >= (uint32_t)bm.points * 3, "table %d : bumper dore x3 (%u)", t, g.score - sc);
            tested++;
        }
    }
    CHECK(tested >= 5, "au moins 5 tables avec mecanique propre (%d)", tested);
    printf("  %d tables avec mecanique propre verifiees\n", tested);
}

static void test_music() {
    printf("[musique]\n");
    for (int decor = 0; decor < DECOR_COUNT; decor++) {
        int notes = 0;
        float lo = 1e9f, hi = 0;
        for (uint32_t st = 0; st < MUSIC_STEPS * 2; st++) {
            MusicNote n;
            if (!music_note((uint8_t)decor, st, n)) continue;
            notes++;
            CHECK(n.freq >= 80 && n.freq <= 2000, "decor %d pas %u : frequence %.0f", decor, st, n.freq);
            CHECK(n.durMs > 0 && n.durMs <= music_step_ms((uint8_t)decor, false), "decor %d pas %u : duree %u", decor, st, n.durMs);
            CHECK(n.vol > 0 && n.vol <= 0.5f, "decor %d : volume %.2f", decor, n.vol);
            if (n.freq < lo) lo = n.freq;
            if (n.freq > hi) hi = n.freq;
        }
        CHECK(notes >= MUSIC_STEPS * 2 / 3, "decor %d : boucle trop vide (%d notes)", decor, notes);
        CHECK(music_step_ms((uint8_t)decor, true) < music_step_ms((uint8_t)decor, false), "decor %d : multibille pas plus rapide", decor);
        MusicNote a, b;   // le cycle complet (4 passages differents) se repete a l'identique ; deux passages consecutifs different
        CHECK(music_note((uint8_t)decor, 0, a) && music_note((uint8_t)decor, MUSIC_STEPS * 4, b) && a.freq == b.freq, "decor %d : cycle non periodique", decor);
        int diff = 0;
        for (uint32_t st = 0; st < MUSIC_STEPS; st++) {
            MusicNote x, y;
            const bool hx = music_note((uint8_t)decor, st, x), hy = music_note((uint8_t)decor, st + MUSIC_STEPS, y);
            if (hx != hy || (hx && x.freq != y.freq)) diff++;
        }
        CHECK(diff > MUSIC_STEPS / 3, "decor %d : le 2e passage doit differer du 1er (%d pas)", decor, diff);
        printf("  decor %d : %d notes sur 2 boucles, %.0f..%.0f Hz, pas %u ms\n", decor, notes, lo, hi, music_step_ms((uint8_t)decor, false));
    }
}

static void test_sfx_patterns() {
    printf("[effets sonores]\n");
    int total = 0;
    for (int decor = 0; decor < DECOR_COUNT; decor++) {
        for (int id = 1; id <= (int)Sfx::Assist; id++) {
            for (int arg = 0; arg < 6; arg += 5) {
                Pattern p;
                build_pattern((uint8_t)decor, (Sfx)id, (uint8_t)(arg * 20), p);
                CHECK(p.count >= 1 && p.count <= MAX_NOTES, "decor %d sfx %d : %d notes", decor, id, p.count);
                for (int i = 0; i < p.count; i++) {
                    const Note& n = p.n[i];
                    CHECK(n.f0 >= 20 && n.f0 <= 8000 && n.f1 >= 20 && n.f1 <= 8000, "decor %d sfx %d note %d : frequence %.0f..%.0f", decor, id, i, n.f0, n.f1);
                    CHECK(n.v0 >= 0 && n.v0 <= 1 && n.v1 >= 0 && n.v1 <= 1, "volume hors plage");
                    CHECK(n.durMs >= 10 && n.durMs <= 1500 && n.atMs <= 1500, "duree/delai hors plage (%u,%u)", n.durMs, n.atMs);
                    CHECK(n.wave <= WAVE_NOISE, "forme d'onde");
                }
                total++;
            }
        }
    }
    // Les bumpers du plateau Star Wars ne sonnent pas comme ceux des autres plateaux
    Pattern a, b;
    build_pattern(2, Sfx::Bumper, 0, a);
    build_pattern(0, Sfx::Bumper, 0, b);
    CHECK(a.n[0].f0 > 1500 && b.n[0].f0 < 1000, "blaster aigu pour Star Wars, sinus pour les autres");
    printf("  %d motifs valides (4 decors)\n", total);
}

static unsigned fb_hash() {
    unsigned h = 2166136261u;
    for (int i = 0; i < vid::W * vid::H; i++) h = (h ^ vid::g_fb[i]) * 16777619u;
    return h;
}

static void test_render(const char* outDir) {
    printf("[rendu]\n");
    char path[256];
    for (int t = 0; t < TABLE_COUNT; t++) {
        Game g;
        g.begin(STORE());
        g.tableIdx = (uint8_t)t;
        // menu
        render::draw(g);
        unsigned n = vid::count_non_background(0);
        CHECK(n > 20000, "menu %d presque vide (%u)", t, n);
        if (outDir) { snprintf(path, sizeof(path), "%s/t%d_menu.ppm", outDir, t); vid::dump_ppm(path); }
        unsigned hMenu = fb_hash();

        // partie : vue d'ensemble, puis jeu
        g.startNewGame((uint8_t)t);
        tick(g, Input(), 0.016f);
        render::draw(g);
        if (outDir) { snprintf(path, sizeof(path), "%s/t%d_overview.ppm", outDir, t); vid::dump_ppm(path); }
        CHECK(fb_hash() != hMenu, "rendu inchange entre menu et partie");

        Bot bot;
        for (int i = 0; i < 60 * 12; i++) tick(g, bot_input(g, bot, 1.0f / 60), 1.0f / 60);
        render::draw(g);
        if (outDir) { snprintf(path, sizeof(path), "%s/t%d_play.ppm", outDir, t); vid::dump_ppm(path); }
        {   // lampes allumees (captures de controle) : couloirs 1 et 3, un retour, mission 2 en cours
            const uint8_t sl = g.rolloverLit; const uint8_t sm = g.missionIdx; const float sz = g.cameraZoom, sc = g.cameraY;
            g.rolloverLit = 0x15; g.missionIdx = 1;
            g.cameraZoom = 1.0f; g.cameraY = 0.0f; render::draw(g);
            if (outDir) { snprintf(path, sizeof(path), "%s/t%d_lamps_top.ppm", outDir, t); vid::dump_ppm(path); }
            g.cameraY = MAX_CAM_Y; render::draw(g);
            if (outDir) { snprintf(path, sizeof(path), "%s/t%d_lamps_bot.ppm", outDir, t); vid::dump_ppm(path); }
            if (outDir && (t == 0 || t == 1)) {   // bille en pleine rampe (controle visuel : elle doit rester dans le rail du decor)
                const Ball sb = g.balls[0]; const Vec2 en = g.tbl().ramps[1].pts[0];
                g.balls[0] = {en.x, en.y + 4.0f, 0.0f, -260.0f, true, false, 0, 0};
                for (int f = 0; f < 40; f++) tick(g, Input(), 1.0f / 60.0f);
                g.cameraZoom = 1.0f; g.cameraY = clampf(g.balls[0].y - 120.0f, 0.0f, MAX_CAM_Y); render::draw(g);
                snprintf(path, sizeof(path), "%s/t%d_ramp.ppm", outDir, t); vid::dump_ppm(path);
                g.balls[0] = sb;
            }
            {   // mecaniques : cibles touchees / escamotees, spinner en rotation, jouet actif, bille a l'etage
                const uint16_t th = g.targetHit; const uint8_t uh = g.upTargetHit; const Ball sb = g.balls[0];
                g.targetHit = 0x2B; g.upTargetHit = 0x01; g.targetFlash[1] = 0.2f; g.targetFlash[MAX_TARGETS + 1] = 0.2f;
                g.spinVel[0] = 30.0f; g.spinAngle[0] = 0.7f; g.toyState.flash = 0.3f; g.toyState.angle = 1.0f; g.toyState.activeTimer = 2.0f; g.toyState.openRatio = 0.6f;
                g.upBumperFlash[0] = 0.1f; g.upRolloverLit = 1; g.vukFlash = 0.3f;
                if (g.tbl().upper.present) { g.balls[0] = {g.tbl().upper.bumpers[0].x - 14.0f, g.tbl().upper.bumpers[0].y + 6.0f, 0, 0, true, false, 0, 0}; g.balls[0].layer = 2; }
                g.cameraY = 96.0f; g.nowMs += 130; render::draw(g);
                if (outDir) { snprintf(path, sizeof(path), "%s/t%d_mech.ppm", outDir, t); vid::dump_ppm(path); }
                g.targetHit = th; g.upTargetHit = uh; g.balls[0] = sb; g.spinVel[0] = 0; g.toyState.flash = 0; g.toyState.activeTimer = 0; g.toyState.openRatio = 0; g.upBumperFlash[0] = 0; g.upRolloverLit = 0; g.vukFlash = 0;
            }
            g.rolloverLit = sl; g.missionIdx = sm; g.cameraZoom = sz; g.cameraY = sc;
        }

        // pause + fin de partie
        g.state = State::Paused;
        render::draw(g);
        if (outDir && t == 2) { snprintf(path, sizeof(path), "%s/t%d_pause.ppm", outDir, t); vid::dump_ppm(path); }
        g.state = State::GameOver;
        g.newRecord = true;
        render::draw(g);
        if (outDir && t == 2) { snprintf(path, sizeof(path), "%s/t%d_gameover.ppm", outDir, t); vid::dump_ppm(path); }
    }
    // HUD : la bande gauche (sx < 46) ne doit pas etre une couleur unie
    printf("  ok (raw_* n'a recu aucune coordonnee hors ecran)\n");
}

static bool pointInPolyTest(const UpperDeckDef& u, float x, float y) {
    bool in = false;
    for (int i = 0, j = u.n - 1; i < u.n; j = i++)
        if (((u.b[i].y > y) != (u.b[j].y > y)) && (x < (u.b[j].x - u.b[i].x) * (y - u.b[i].y) / (u.b[j].y - u.b[i].y) + u.b[i].x)) in = !in;
    return in;
}

// --- Mecaniques portees du moteur Web : cibles, spinners, jouets, ejecteur, etage -------------------
static Game* fresh(int t) {
    Game* g = new Game(); g->begin(STORE()); g->startNewGame((uint8_t)t);
    g->introTimer = 0.0f; g->ballSaveUsed = true; g->ballSaveTimer = 0.0f;
    return g;
}
static void run(Game& g, float sec, const Input& in = Input()) {
    for (int f = 0; f < (int)(sec * 60.0f); f++) tick(g, in, 1.0f / 60.0f);
}

static void test_wall_budget() {
    printf("[budget de murs et donnees des mecaniques]\n");
    for (int t = 0; t < TABLE_COUNT; t++) {
        Game* g = fresh(t);
        CHECK(g->wallCount < MAX_WALLS, "table %d : %d murs (max %d : des murs seraient ignores)", t, g->wallCount, MAX_WALLS);
        const TableDef& d = table(t);
        CHECK(d.targetCount >= 5 && d.spinnerCount == 2 && d.toy.present, "table %d : cibles/spinners/jouet manquants", t);
        for (int k = 0; k < d.targetCount; k++)
            CHECK(d.targets[k].x1 > 5 && d.targets[k].x1 < 235 && d.targets[k].y1 > 20 && d.targets[k].y1 < 480, "table %d cible %d hors plateau", t, k);
        if (d.upper.present) {
            CHECK(d.upper.flipperCount == 1 && g->flipperCount >= 3 && g->flippers[g->flipperCount - 1].layer == 2, "table %d : flipper d'etage", t);
            CHECK(g->upWallCount == d.upper.n - 1, "table %d : %d rebords fermes", t, g->upWallCount);
            bool toUp = d.ramps[0].toUpper || d.ramps[1].toUpper;
            CHECK(toUp, "table %d : aucune rampe n'amene a l'etage", t);
        }
        delete g;
    }
}

// Tire une bille vers le milieu d'un segment de cible, en essayant les deux cotes ; renvoie vrai si `done()` devient vrai.
template <typename F>
static bool shoot_segment(Game& g, float x1, float y1, float x2, float y2, uint8_t layer, F done) {
    const float mx = (x1 + x2) * 0.5f, my = (y1 + y2) * 0.5f;
    float nx = -(y2 - y1), ny = x2 - x1; const float nl = hypotf(nx, ny); nx /= nl; ny /= nl;
    for (int side = 0; side < 2; side++) {
        const float sx = side ? -nx : nx, sy = side ? -ny : ny;
        g.balls[0] = {mx + sx * 12.0f, my + sy * 12.0f, -sx * 150.0f, -sy * 150.0f, true, false, 0.0f, 0.0f};
        g.balls[0].layer = layer;
        for (int f = 0; f < 60; f++) {
            tick(g, Input(), 1.0f / 120.0f);
            if (done()) return true;
        }
    }
    return false;
}

static void test_targets_banks() {
    printf("[cibles fixes / escamotables, banques]\n");
    int dropBanks = 0, standBanks = 0, roles[4] = {0, 0, 0, 0};
    for (int t = 0; t < TABLE_COUNT; t++) {
        const TableDef& d = table(t);
        for (int bank = 0; bank < 2; bank++) {
            Game* g = fresh(t);
            int n = 0; bool drop = false; uint8_t role = 0;
            for (int k = 0; k < d.targetCount; k++) if (d.targets[k].bank == bank) { n++; drop = d.targets[k].drop; role = d.targets[k].role; }
            CHECK(n >= 2, "table %d banque %d : %d cibles", t, bank, n);
            const uint32_t sc0 = g->score;
            int done = 0;
            for (int k = 0; k < d.targetCount; k++) {
                if (d.targets[k].bank != bank) continue;
                const TargetDef& tg = d.targets[k];
                if (shoot_segment(*g, tg.x1, tg.y1, tg.x2, tg.y2, 0, [&]() { return g->targetFlash[k] > 0.0f; })) done++;
                else printf("    (table %d cible %d '%c' sans reaction)\n", t, k, tg.letter);
            }
            g->balls[0].active = false;
            CHECK(done == n, "table %d banque %d : %d/%d cibles reagissent", t, bank, done, n);
            CHECK(g->score > sc0, "table %d banque %d : aucun point", t, bank);
            if (drop) {
                dropBanks++;
                CHECK(g->dropReset[bank] > 0.0f, "table %d banque %d : delai de retour des cibles escamotables", t, bank);
                g->balls[0] = {225.0f, PLUNGER_TOP_Y - BALL_RADIUS, 0, 0, true, true, 0, 0};
                run(*g, 1.0f);
                bool back = true;
                for (int k = 0; k < d.targetCount; k++) if (d.targets[k].bank == bank && ((g->targetHit >> k) & 1u)) back = false;
                CHECK(back, "table %d banque %d : les cibles escamotees remontent (mask=%04x)", t, bank, g->targetHit);
            } else {
                standBanks++;
                bool clear = true;
                for (int k = 0; k < d.targetCount; k++) if (d.targets[k].bank == bank && ((g->targetHit >> k) & 1u)) clear = false;
                CHECK(clear, "table %d banque %d : cibles fixes rearmees (mask=%04x)", t, bank, g->targetHit);
            }
            roles[role & 3]++;
            delete g;
        }
    }
    CHECK(dropBanks >= 10 && standBanks >= 10, "banques escamotables %d / fixes %d", dropBanks, standBanks);
    printf("  %d banques escamotables, %d fixes ; roles : %d bonus, %d multibille, %d boucliers, %d rampes\n", dropBanks, standBanks, roles[0], roles[1], roles[2], roles[3]);
    {   // role multibille (Star Wars) : la banque arme l'envoi de 2 billes supplementaires
        Game* g = fresh(2);
        const TableDef& d = table(2);
        int bank = -1;
        for (int k = 0; k < d.targetCount; k++) if (d.targets[k].role == 1) bank = d.targets[k].bank;
        CHECK(bank >= 0, "Star Wars : banque multibille");
        for (int k = 0; k < d.targetCount; k++) {
            if (d.targets[k].bank != bank) continue;
            const TargetDef& tg = d.targets[k];
            shoot_segment(*g, tg.x1, tg.y1, tg.x2, tg.y2, 0, [&]() { return g->targetFlash[k] > 0.0f; });
        }
        CHECK(g->multiballActive && g->multiQueue > 0, "banque multibille armee (queue=%d)", g->multiQueue);
        g->balls[0] = {225.0f, 300.0f, 0, 0, false, false, 0, 0};   // plus de bille en jeu : seules celles de la file arrivent
        g->balls[0].active = false;
        g->balls[1].active = g->balls[2].active = false;
        g->balls[0] = {113.0f, 300.0f, 0, 0, true, false, 0, 0};
        run(*g, 3.0f);
        int inLane = 0;
        for (int i = 0; i < MAX_BALLS; i++) if (g->balls[i].active && g->balls[i].inShooter) inLane++;
        CHECK(inLane >= 1, "les billes de la banque multibille sortent dans le lanceur (%d)", inLane);
        delete g;
    }
}

static void test_spinners_toys() {
    printf("[spinners et jouets interactifs]\n");
    int toyKinds[6] = {0, 0, 0, 0, 0, 0};
    for (int t = 0; t < TABLE_COUNT; t++) {
        const TableDef& d = table(t);
        {   // spinner : la bille le traverse vite, le compteur de demi-tours rapporte des points
            Game* g = fresh(t);
            const SpinnerDef& sp = d.spinners[0];
            g->balls[0] = {sp.x - 6.0f, sp.y, 260.0f, 0.0f, true, false, 0, 0};
            uint32_t sc0 = g->score; bool spun = false;
            for (int f = 0; f < 60 * 3; f++) { tick(*g, Input(), 1.0f / 60.0f); if (fabsf(g->spinVel[0]) > 1.0f) spun = true; if (!g->balls[0].active) g->balls[0] = {sp.x - 6.0f, sp.y, 260.0f, 0.0f, true, false, 0, 0}; }
            CHECK(spun && g->score >= sc0 + sp.points, "table %d : spinner (spun=%d, +%u pts)", t, spun, g->score - sc0);
            delete g;
        }
        {   // jouet : impacts repetes (essai de plusieurs directions d'arrivee) -> compteur, recompense
            Game* g = fresh(t);
            const ToyDef& ty = d.toy;
            toyKinds[ty.kind]++;
            const uint32_t sc0 = g->score;
            for (int shot = 0; shot < 40 && g->toyState.hits < ty.hitsRequired * 2u; shot++) {
                const float an = (float)(shot % 8) * 0.7853982f + (shot / 8) * 0.3f;
                const float dist = ty.r + 14.0f;
                if (ty.kind == 1) g->balls[0] = {ty.x + (float)((shot % 3) - 1) * 4.0f, ty.y + 22.0f, 0.0f, -230.0f, true, false, 0, 0};
                else g->balls[0] = {ty.x + cosf(an) * dist, ty.y + sinf(an) * dist, -cosf(an) * 210.0f, -sinf(an) * 210.0f, true, false, 0, 0};
                for (int f = 0; f < 70; f++) tick(*g, Input(), 1.0f / 120.0f);
                if (ty.kind == 4 && g->toyState.activeTimer > 0.0f) {   // sarcophage ouvert : la bille y est tiree vers le haut
                    g->balls[0] = {ty.x, ty.y + 2.0f, 0.0f, 0.0f, true, false, 0, 0};
                    for (int f = 0; f < 20; f++) tick(*g, Input(), 1.0f / 120.0f);
                    break;
                }
            }
            CHECK(g->toyState.hits >= (ty.kind == 4 ? 1 : ty.hitsRequired), "table %d jouet %s (kind %d) : %d impacts (%d requis)", t, ty.name, ty.kind, g->toyState.hits, ty.hitsRequired);
            CHECK(g->score > sc0, "table %d jouet %s : aucun point", t, ty.name);
            delete g;
        }
    }
    printf("  jouets : %d bash, %d portes, %d plateaux, %d puits, %d sarcophage, %d roto-cible\n", toyKinds[0], toyKinds[1], toyKinds[2], toyKinds[3], toyKinds[4], toyKinds[5]);
}

static void test_vuk_tube() {
    printf("[ejecteur VUK : conduit sans teleportation]\n");
    int n = 0;
    for (int t = 0; t < TABLE_COUNT; t++) {
        const TableDef& d = table(t);
        if (!d.vuk.present) continue;
        Game* g = fresh(t);
        g->balls[0] = {d.vuk.x + 2.0f, d.vuk.y - 3.0f, 0.0f, 40.0f, true, false, 0, 0};
        float px = g->balls[0].x, py = g->balls[0].y, maxJump = 0.0f;
        bool held = false, inTube = false, out = false;
        uint32_t sc0 = g->score;
        for (int f = 0; f < 60 * 3 && !out; f++) {
            tick(*g, Input(), 1.0f / 60.0f);
            const Ball& b = g->balls[0];
            if (b.held) held = true;
            if (b.ramp == 2) inTube = true;
            const float dd = hypotf(b.x - px, b.y - py);
            if (inTube && b.ramp == 2 && dd > maxJump) maxJump = dd;
            if (inTube && b.ramp < 0) out = true;
            px = b.x; py = b.y;
        }
        CHECK(held && inTube && out, "table %d : capture %d / conduit %d / sortie %d", t, held, inTube, out);
        CHECK(maxJump < 8.0f, "table %d : saut de %.1f px dans le conduit", t, maxJump);
        CHECK(g->score >= sc0 + d.vuk.points, "table %d : points de l'ejecteur", t);
        CHECK(hypotf(g->balls[0].x - d.vuk.pts[RAMP_PTS - 1].x, g->balls[0].y - d.vuk.pts[RAMP_PTS - 1].y) < 12.0f, "table %d : la bille ressort a la sortie du conduit", t);
        delete g; n++;
    }
    CHECK(n >= 2, "au moins 2 tables avec ejecteur (%d)", n);
    printf("  %d ejecteurs verifies\n", n);
}

static void test_upper_deck() {
    printf("[etage superieur : acces par rampe, jeu a l'etage, retour au plateau]\n");
    int decks = 0;
    for (int t = 0; t < TABLE_COUNT; t++) {
        const TableDef& d = table(t);
        if (!d.upper.present) continue;
        decks++;
        int r = d.ramps[0].toUpper ? 0 : 1;
        Game* g = fresh(t);
        const Vec2 en = d.ramps[r].pts[0];
        g->balls[0] = {en.x, en.y + 4.0f, 0.0f, -260.0f, true, false, 0, 0};
        bool reached = false; float jump = 0, px = en.x, py = en.y;
        for (int f = 0; f < 60 * 6 && !reached; f++) {
            tick(*g, Input(), 1.0f / 60.0f);
            const Ball& b = g->balls[0];
            const float dd = hypotf(b.x - px, b.y - py); if (b.ramp >= 0 && dd > jump) jump = dd;
            px = b.x; py = b.y;
            if (b.layer == 2) reached = true;
        }
        CHECK(reached, "table %d : la rampe %d doit deposer la bille a l'etage", t, r);
        CHECK(jump < 8.0f, "table %d : saut de %.1f px sur la rampe d'etage", t, jump);
        CHECK(pointInPolyTest(d.upper, g->balls[0].x, g->balls[0].y), "table %d : la bille arrive dans le polygone de l'etage (%.0f,%.0f)", t, g->balls[0].x, g->balls[0].y);
        // jeu a l'etage : plusieurs essais avec des rythmes de flipper differents ; la bille doit marquer et ressortir
        int scoring = 0, returned = 0; bool leak = false; int upperTicks = 0;
        for (int trial = 0; trial < 6; trial++) {
            Game* u = fresh(t);
            u->balls[0] = {en.x, en.y + 4.0f, 0.0f, -260.0f, true, false, 0, 0};
            uint32_t sc0 = 0; bool inUp = false, back = false;
            Input in;
            for (int f = 0; f < 60 * 30 && !back; f++) {
                in.left = in.right = ((f / (5 + trial * 2)) & 1);
                tick(*u, in, 1.0f / 60.0f);
                const Ball& b = u->balls[0];
                if (b.layer == 2) {
                    if (!inUp) { inUp = true; sc0 = u->score; }
                    upperTicks++;
                    if (b.x < 9 || b.x > 216 || b.y < 20) leak = true;
                } else if (inUp) back = true;
            }
            if (u->score > sc0 + 1000 && inUp) scoring++;
            if (back) returned++;
            delete u;
        }
        CHECK(!leak, "table %d : la bille sort du meuble depuis l'etage", t);
        CHECK(upperTicks > 120, "table %d : bille restee %d images a l'etage", t, upperTicks);
        CHECK(returned >= 5, "table %d : la bille redescend par le rebord ouvert (%d/6)", t, returned);
        CHECK(scoring >= 1, "table %d : l'etage rapporte des points (%d/6 essais)", t, scoring);
        // bumpers et cibles de l'etage reagissent
        Game* h = fresh(t);
        for (int k = 0; k < d.upper.bumperCount; k++) {
            const BumperDef& bm = d.upper.bumpers[k];
            h->balls[0] = {bm.x - bm.r - 9.0f, bm.y, 170.0f, 0.0f, true, false, 0, 0}; h->balls[0].layer = 2;
            uint32_t s1 = h->score;
            for (int f = 0; f < 40 && h->score == s1; f++) tick(*h, Input(), 1.0f / 120.0f);
            CHECK(h->score >= s1 + bm.points * 2, "table %d : bumper d'etage %d (+%u)", t, k, h->score - s1);
        }
        for (int k = 0; k < d.upper.targetCount; k++) {
            const TargetDef& tg = d.upper.targets[k];
            const bool ok = shoot_segment(*h, tg.x1, tg.y1, tg.x2, tg.y2, 2, [&]() { return h->targetFlash[MAX_TARGETS + k] > 0.0f; });
            CHECK(ok, "table %d : cible d'etage %d '%c'", t, k, tg.letter);
        }
        CHECK(h->score > 0, "table %d : points des cibles d'etage", t);
        delete h;
    }
    CHECK(decks == 4, "4 tables avec etage attendues (%d)", decks);
    printf("  %d etages jouables (rampe -> bumpers/cibles/flipper -> retour)\n", decks);
}

static void test_plunger_in_flight() {
    printf("[ressort : pas de tir a vide]\n");
    Game g; g.begin(STORE()); g.startNewGame(0); g.introTimer = 0.0f;
    Input in;
    in.plunger = true; for (int f = 0; f < 40; f++) tick(g, in, 1.0f / 60.0f);
    CHECK(g.plungerCharge > 0.3f, "le ressort se tend avec la bille dessus (%.2f)", g.plungerCharge);
    in.plunger = false; tick(g, in, 1.0f / 60.0f);
    for (int f = 0; f < 3; f++) tick(g, in, 1.0f / 60.0f);
    CHECK(g.balls[0].vy < -200.0f && g.balls[0].inShooter, "bille lancee dans le couloir (vy=%.0f)", g.balls[0].vy);
    in.plunger = true;
    float maxCharge = 0.0f;
    for (int f = 0; f < 8 && g.balls[0].inShooter; f++) { tick(g, in, 1.0f / 60.0f); if (g.plungerCharge > maxCharge) maxCharge = g.plungerCharge; }
    CHECK(maxCharge < 0.05f, "pas de tension tant que la bille ne touche pas le ressort (%.2f)", maxCharge);
    in.plunger = false; tick(g, in, 1.0f / 60.0f);
    CHECK(g.balls[0].vy < 0.0f || !g.balls[0].inShooter, "un relachement en vol ne relance pas la bille");
}

static void test_return_and_sling() {
    printf("[retour a la selection, triangle de rebond]\n");
    Game g; g.begin(STORE()); g.startNewGame(8); g.introTimer = 0.0f; g.score = 4242;
    g.returnToSelection();
    CHECK(g.state == State::Menu && g.tableIdx == 8, "le menu systeme ramene a la selection de table");
    CHECK(g.highScores[8] >= 4242, "la partie interrompue est enregistree");
    for (int t = 0; t < TABLE_COUNT; t++) {   // une bille renvoyee par un triangle ne prend pas la rampe voisine pendant 0,4 s
        Game* h = fresh(t);
        h->balls[0] = {50.0f, 395.0f, 200.0f, -20.0f, true, false, 0.0f, 0.0f};
        bool entered = false; bool slung = false;
        for (int f = 0; f < 120; f++) {
            tick(*h, Input(), 1.0f / 120.0f);
            if (h->wallFlash[0] >= 0.0f) {}
            for (int w = 0; w < h->wallCount; w++) if (h->walls[w].scoring && h->wallFlash[w] > 0.0f) slung = true;
            if (slung && h->balls[0].rampCool <= 0.0f) break;
            if (slung && h->balls[0].ramp >= 0) entered = true;
        }
        CHECK(!entered, "table %d : la bille renvoyee par le triangle s'engouffre dans la rampe", t);
        delete h;
    }
}

static void test_ramp_exit_not_drain() {
    printf("[sortie de rampe : pas de chute directe dans les couloirs de sortie]\n");
    int bad = 0, total = 0;
    for (int t = 0; t < TABLE_COUNT; t++) for (int r = 0; r < 2; r++) {
        const Vec2 ex = table(t).ramps[r].pts[RAMP_PTS - 1];
        if (table(t).ramps[r].toUpper || ex.y < 150.0f || (ex.x > 60.0f && ex.x < 166.0f)) continue;
        Game* g = fresh(t);
        const Vec2 en = table(t).ramps[r].pts[0];
        g->balls[0] = {en.x, en.y + 4.0f, 0.0f, -260.0f, true, false, 0, 0};
        float xAt = -1; bool crossed = false;
        for (int f = 0; f < 60 * 8 && !crossed; f++) {
            tick(*g, Input(), 1.0f / 60.0f);
            const Ball& b = g->balls[0];
            if (b.ramp < 0 && b.y > 380.0f) { xAt = b.x; crossed = true; }
            if (!b.active) break;
        }
        total++;
        if (crossed && (xAt < 27.0f || xAt > 199.0f)) { bad++; printf("    table %d rampe %d : franchit y=380 en x=%.0f (couloir de sortie)\n", t, r, xAt); }
        delete g;
    }
    CHECK(bad == 0, "%d/%d sorties de rampe retombent dans un couloir de sortie", bad, total);
}


// --- Sprint 1 de l'agence : boitiers, combo, aide debutant, coaching ------------------------------------
static void test_sprint1() {
    printf("[sprint 1 : boitier, combo, aide, coaching]\n");
    // 1) une bille posee dans un boitier plein est rendue au plateau (bug : bille retombee de l'etage coincee a vie)
    for (int t = 0; t < TABLE_COUNT; t++) {
        const TableDef& d = table(t);
        for (int h = 0; h < d.housingCount; h++) {
            const HousingDef& hd = d.housings[h];
            float cx = 0, cy = 0; for (int i = 0; i < hd.n; i++) { cx += hd.p[i].x; cy += hd.p[i].y; }
            cx /= hd.n; cy /= hd.n;
            if (cx < 30 || cx > 195 || cy < 60 || cy > 380) continue;   // les boitiers colles aux parois ne piegent pas
            Game* g = fresh(t);
            g->balls[0] = {cx, cy, 0.0f, 0.0f, true, false, 0.0f, 0.0f};
            run(*g, 1.0f);
            bool inside = false; { float x = g->balls[0].x, y = g->balls[0].y; int c = 0;
                for (int i = 0, j = hd.n - 1; i < hd.n; j = i++) if (((hd.p[i].y > y) != (hd.p[j].y > y)) && (x < (hd.p[j].x - hd.p[i].x) * (y - hd.p[i].y) / (hd.p[j].y - hd.p[i].y) + hd.p[i].x)) c++;
                inside = c & 1; }
            CHECK(!inside, "table %d boitier %d : la bille est restee piegee a l'interieur", t, h);
            delete g;
        }
    }
    // 2) aide debutant : deux chutes rapides d'affilee -> protection etendue ; combo de rampes
    {
        Game* g = fresh(1);
        CHECK(!g->assistOn, "l'aide ne doit pas etre active au depart");
        for (int k = 0; k < 2; k++) {
            g->ballSaveUsed = true; g->ballSaveTimer = 0.0f;
            g->balls[0] = {110.0f, 515.0f, 0.0f, 300.0f, true, false, 0.0f, 0.0f};
            run(*g, 0.5f);
        }
        CHECK(g->assistOn, "deux chutes rapides doivent declencher l'aide (quickDrains=%d)", (int)g->quickDrains);
        delete g;
    }
    {
        Game* g = fresh(1);
        const uint32_t s0 = g->score;
        const Vec2 en = table(1).ramps[0].pts[0];
        g->balls[0] = {en.x, en.y + 4.0f, 0.0f, -260.0f, true, false, 0.0f, 0.0f};
        run(*g, 0.3f);
        const uint32_t afterOne = g->score - s0;
        CHECK(g->rampCombo == 1, "premiere rampe : combo 1 (%d)", (int)g->rampCombo);
        // on remet une bille a l'entree dans la fenetre de combo
        run(*g, 4.5f);
        g->balls[0] = {en.x, en.y + 4.0f, 0.0f, -260.0f, true, false, 0.0f, 0.0f};
        g->balls[0].rampCool = 0.0f;
        run(*g, 0.3f);
        CHECK(g->rampCombo >= 2, "deuxieme rampe dans la fenetre : combo >= 2 (%d)", (int)g->rampCombo);
        CHECK(g->score - s0 > afterOne * 2, "le combo doit rapporter plus que deux rampes isolees");
        delete g;
    }
    // 3) coaching : s'affiche sur la premiere partie de la session, pas ensuite
    {
        Game g; g.begin(STORE());
        g.startNewGame(0); run(g, 3.5f);
        CHECK(g.hintStage >= 1, "le coaching de la premiere bille doit demarrer (stage %d)", (int)g.hintStage);
        g.startNewGame(0); g.startNewGame(0);
        CHECK(g.hintStage == 2, "pas de coaching apres les deux premieres parties");
    }
}

// --- Sprint 3 : mode demo, combo etendu aux cibles, jauge ----------------------------------------------
static void test_sprint3() {
    printf("[sprint 3 : demo automatique, combo cibles, jauge]\n");
    {   // la demo demarre apres l'inactivite, joue seule, n'enregistre aucun record et rend la main a la moindre touche
        Game g; g.begin(STORE());
        const uint32_t rec = g.highScores[0];
        run(g, DEMO_IDLE_SEC - 2.0f);
        CHECK(g.state == State::Menu && !g.demo, "pas de demo avant l'inactivite");
        run(g, 4.0f);
        CHECK(g.demo && g.state == State::Playing, "la demo doit demarrer apres %.0f s d'inactivite", DEMO_IDLE_SEC);
        run(g, 60.0f);
        CHECK(g.score > 0, "la demo doit marquer des points seule (%lu)", (unsigned long)g.score);
        CHECK(g.highScores[0] == rec, "la demo n'enregistre jamais de record");
        const uint8_t before = g.tableIdx; (void)before;
        Input press; press.left = true;
        tick(g, press, 1.0f / 60.0f);
        CHECK(!g.demo && g.state == State::Menu, "une touche coupe la demo et revient au menu");
        Input none; run(g, 0.5f, none);
        CHECK(g.state == State::Menu, "la touche est consommee : on reste au menu");
    }
    {   // la demo qui va au bout revient d'elle-meme au menu
        Game g; g.begin(STORE());
        run(g, DEMO_IDLE_SEC + 1.0f);
        bool back = false;
        for (int i = 0; i < 60 * 900 && !back; i++) { tick(g, Input(), 1.0f / 60.0f); if (!g.demo && g.state == State::Menu) back = true; }
        CHECK(back, "la demo doit se terminer et revenir au menu");
    }
    {   // combo : une rampe puis une cible rapprochees
        Game* g = fresh(1);
        g->attractEnabled = false;
        const Vec2 en = table(1).ramps[0].pts[0];
        g->balls[0] = {en.x, en.y + 4.0f, 0.0f, -260.0f, true, false, 0.0f, 0.0f};
        run(*g, 0.3f);
        CHECK(g->rampCombo == 1, "rampe : combo 1");
        g->onTargetHit(0, false);
        CHECK(g->rampCombo == 2, "une cible touchee dans la fenetre prolonge le combo (%d)", (int)g->rampCombo);
        delete g;
    }
    {   // jauge : la duree de protection est connue du rendu
        Game* g = fresh(0);
        g->ballSaveUsed = false;
        const Ball sh = g->balls[0];
        (void)sh;
        g->balls[0] = {200.0f, 450.0f, 0.0f, -300.0f, true, true, 0.0f, 0.0f};
        run(*g, 0.5f);
        CHECK(g->ballSaveTimer <= g->ballSaveMax + 0.01f && g->ballSaveMax >= BALL_SAVE_SEC - 0.01f, "ballSaveMax coherent (%.1f/%.1f)", g->ballSaveTimer, g->ballSaveMax);
        delete g;
    }
}

int main(int argc, char** argv) {
    const char* outDir = argc > 1 ? argv[1] : nullptr;
    test_tables();
    test_play_all_tables();
    test_framerate_independence();
    test_state_machine();
    test_multiball_and_lock();
    test_sfx_patterns();
    test_rollovers();
    test_art();
    test_art_alignment();
    test_launch_and_save();
    test_plunger_in_flight();
    test_return_and_sling();
    test_ramp_exit_not_drain();
    test_sprint1();
    test_sprint3();
    test_containment();
    test_ramp_follow();
    test_hunt();
    test_wall_budget();
    test_targets_banks();
    test_spinners_toys();
    test_vuk_tube();
    test_upper_deck();
    test_music();
    test_render(outDir);
    if (g_fail) { printf("\n%d ECHEC(S)\n", g_fail); return 1; }
    printf("\nTOUS LES TESTS PASSENT\n");
    return 0;
}
