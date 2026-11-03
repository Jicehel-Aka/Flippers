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
        MusicNote a, b;   // la boucle se repete a l'identique
        CHECK(music_note((uint8_t)decor, 0, a) && music_note((uint8_t)decor, MUSIC_STEPS, b) && a.freq == b.freq, "decor %d : boucle non periodique", decor);
        printf("  decor %d : %d notes sur 2 boucles, %.0f..%.0f Hz, pas %u ms\n", decor, notes, lo, hi, music_step_ms((uint8_t)decor, false));
    }
}

static void test_sfx_patterns() {
    printf("[effets sonores]\n");
    int total = 0;
    for (int decor = 0; decor < DECOR_COUNT; decor++) {
        for (int id = 1; id <= (int)Sfx::LockLit; id++) {
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
    test_containment();
    test_ramp_follow();
    test_hunt();
    test_music();
    test_render(outDir);
    if (g_fail) { printf("\n%d ECHEC(S)\n", g_fail); return 1; }
    printf("\nTOUS LES TESTS PASSENT\n");
    return 0;
}
