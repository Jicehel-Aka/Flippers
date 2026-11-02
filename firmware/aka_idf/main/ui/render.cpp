#include "render.h"
#include "gfx.h"
#include <math.h>
#include <stdio.h>
#include <string.h>

extern char font8x8_basic[128][8];   // police 8x8 du SDK (gb_graphics), bit 0 = pixel de gauche

using namespace pinball;

namespace render {

// ---------------------------------------------------------------------------
// Rotation portrait (240x320) -> paysage (320x240), console tournee a 90 degres vers la droite :
// le haut du portrait est a GAUCHE de l'ecran physique.
//     sx = py            sy = 239 - px
// ---------------------------------------------------------------------------
static inline int SX(int py) { return py; }
static inline int SY(int px) { return vid::H - 1 - px; }

static inline uint16_t C(uint32_t c) { return vid::rgb888(c); }
static inline uint16_t C3(int r, int g, int b) { return vid::rgb((uint8_t)r, (uint8_t)g, (uint8_t)b); }

// Rectangle en coordonnees portrait
static void pfill(int x, int y, int w, int h, uint16_t col) {
    if (w <= 0 || h <= 0) return;
    vid::fill_rect(SX(y), SY(x + w - 1), h, w, col);
}
static void pline(int x0, int y0, int x1, int y1, uint16_t col) { vid::line(SX(y0), SY(x0), SX(y1), SY(x1), col); }
static void pcircle(int cx, int cy, int r, uint16_t col) { vid::circle(SX(cy), SY(cx), r, col); }
static void pfillcircle(int cx, int cy, int r, uint16_t col) { vid::fill_circle(SX(cy), SY(cx), r, col); }
static void ptri(int x0, int y0, int x1, int y1, int x2, int y2, uint16_t col) {
    vid::fill_triangle(SX(y0), SY(x0), SX(y1), SY(x1), SX(y2), SY(x2), col);
}
static void prect(int x, int y, int w, int h, uint16_t col) {
    if (w <= 0 || h <= 0) return;
    vid::rect(SX(y), SY(x + w - 1), h, w, col);
}

// Texte 8x8 (ASCII) agrandi d'un facteur `s`, en coordonnees portrait. Les pixels allumes d'une meme
// rangee sont fusionnes en traits pour limiter le nombre d'appels au pilote.
static void ptext(int x, int y, const char* str, uint16_t col, int s = 1) {
    for (; *str; ++str, x += 8 * s) {
        unsigned char ch = (unsigned char)*str;
        if (ch >= 128) ch = '?';
        const uint8_t* glyph = (const uint8_t*)font8x8_basic[ch];
        for (int gy = 0; gy < 8; gy++) {
            uint8_t row = glyph[gy];
            int gx = 0;
            while (gx < 8) {
                if (!(row & (1 << gx))) { gx++; continue; }
                int start = gx;
                while (gx < 8 && (row & (1 << gx))) gx++;
                pfill(x + start * s, y + gy * s, (gx - start) * s, s, col);
            }
        }
    }
}

static int text_w(const char* s, int sc = 1) { return (int)strlen(s) * 8 * sc; }
static void ptext_center(int cx, int y, const char* str, uint16_t col, int s = 1) {
    ptext(cx - text_w(str, s) / 2, y, str, col, s);
}

// Texte sur plusieurs lignes (coupure aux espaces), retourne le nombre de lignes dessinees
static int ptext_wrap(int x, int y, int maxChars, const char* str, uint16_t col, int maxLines) {
    char line[48];
    int lines = 0;
    const char* p = str;
    while (*p && lines < maxLines) {
        int n = (int)strlen(p);
        if (n > maxChars) {
            n = maxChars;
            while (n > 0 && p[n] != ' ') n--;
            if (n == 0) n = maxChars;
        }
        if (n > 47) n = 47;
        memcpy(line, p, (size_t)n);
        line[n] = 0;
        ptext(x, y + lines * 10, line, col);
        lines++;
        p += n;
        while (*p == ' ') p++;
    }
    return lines;
}

// ---------------------------------------------------------------------------
// Vue sur le monde
// ---------------------------------------------------------------------------
struct View {
    float zoom, camY, xPad;
    int X(float wx) const { return (int)lroundf(xPad + wx * zoom); }
    int Y(float wy) const { return HUD_H + (int)lroundf((wy - camY) * zoom); }
    int R(float r) const { int v = (int)lroundf(r * zoom); return v < 1 ? 1 : v; }
};

static uint16_t dim(uint32_t c, int num, int den) {
    return C3((int)(((c >> 16) & 255) * num / den), (int)(((c >> 8) & 255) * num / den), (int)((c & 255) * num / den));
}

static void draw_star_field(const View& v, uint16_t a, uint16_t b) {
    for (int i = 0; i < 40; i++) {
        float wx = 16.0f + (float)((i * 73) % 192);
        float wy = 28.0f + (float)((i * 103) % 450);
        int x = v.X(wx), y = v.Y(wy);
        pfill(x, y, 1, 1, (i % 6 == 0) ? a : b);
    }
}

static void draw_decor(const Game& g, const View& v, const TableDef& t) {
    switch (t.decor) {
        case 0: {   // circuit imprime
            uint16_t grid = C3(18, 40, 78);
            for (int gy = 40; gy < WORLD_H; gy += 48) pfill(v.X(16), v.Y((float)gy), (int)(208 * v.zoom), 1, grid);
            for (int gx = 40; gx < 210; gx += 40) pfill(v.X((float)gx), v.Y(20), 1, (int)(470 * v.zoom), C3(12, 30, 60));
            break;
        }
        case 1:     // espace : champ d'etoiles + planete
            draw_star_field(v, C3(147, 197, 253), C3(120, 125, 140));
            pfillcircle(v.X(170), v.Y(440), v.R(18), C3(30, 58, 110));
            pcircle(v.X(170), v.Y(440), v.R(18), C3(96, 165, 250));
            break;
        case 2: {   // STAR WARS : etoiles, Etoile Noire, deux sabres croises
            draw_star_field(v, C3(147, 197, 253), C3(200, 205, 220));
            int bx = v.X(113), by = v.Y(236), br = v.R(24);
            pfillcircle(bx, by, br, C3(51, 65, 85));
            pfillcircle(bx - v.R(3), by - v.R(3), br - v.R(5), C3(71, 85, 105));
            pcircle(bx, by, br, C3(203, 213, 225));
            pfill(bx - br + 1, by, 2 * br - 2, v.zoom > 0.8f ? 2 : 1, C3(15, 23, 42));          // tranchee equatoriale
            int dx = bx - v.R(7), dy = by - v.R(8);
            pfillcircle(dx, dy, v.R(6.5f), C3(51, 65, 85));
            pcircle(dx, dy, v.R(6.5f), g.multiballActive ? C3(34, 197, 94) : C3(148, 163, 184));  // parabole du superlaser
            // sabres croises (Sith rouge / Jedi bleu) au-dessus des flippers
            int fx = 113, fy = 414;
            for (int k = 0; k < 2; k++) {
                uint32_t col = k == 0 ? 0xEF4444 : 0x3B82F6;
                uint32_t core = k == 0 ? 0xFCA5A5 : 0x93C5FD;
                int sgn = k == 0 ? 1 : -1;
                int x0 = v.X((float)(fx - sgn * 24)), y0 = v.Y((float)(fy - 8));
                int x1 = v.X((float)(fx + sgn * 22)), y1 = v.Y((float)(fy + 6));
                pline(x0, y0 - 1, x1, y1 - 1, dim(col, 1, 2));
                pline(x0, y0 + 1, x1, y1 + 1, dim(col, 1, 2));
                pline(x0, y0, x1, y1, C(core));
            }
            pfill(v.X((float)fx - 29), v.Y((float)fy - 12), v.R(6), v.R(3), C3(148, 163, 184));
            pfill(v.X((float)fx + 23), v.Y((float)fy - 12), v.R(6), v.R(3), C3(148, 163, 184));
            break;
        }
        default: {  // temple solaire
            int sx = v.X(113), sy = v.Y(194);
            pfillcircle(sx, sy, v.R(22), C3(23, 18, 14));
            pcircle(sx, sy, v.R(22), C3(245, 158, 11));
            for (int i = 0; i < 8; i++) {
                float a = (float)i * 0.785398f;
                pline(sx + (int)(cosf(a) * v.R(13)), sy + (int)(sinf(a) * v.R(13)),
                      sx + (int)(cosf(a) * v.R(20)), sy + (int)(sinf(a) * v.R(20)), C3(16, 185, 129));
            }
            for (int step = 0; step < 3; step++) {
                int w = 48 - step * 12;
                pfill(v.X(113.0f - w * 0.5f), v.Y((float)(414 - step * 10)), v.R((float)w), v.R(10), step == 2 ? C3(245, 158, 11) : C3(120, 53, 15));
            }
            break;
        }
    }
}

static void draw_playfield(const Game& g, const View& v, const TableDef& t) {
    // Fond : hors table = presque noir ; table = deux teintes (haut / bas)
    pfill(0, HUD_H, SCREEN_W, VIEW_H, C3(4, 6, 10));
    int tx = v.X(0), tw = (int)lroundf(WORLD_W * v.zoom);
    int mid = v.Y(WORLD_H * 0.5f);
    int top = v.Y(0), bot = v.Y((float)WORLD_H);
    pfill(tx, top, tw, mid - top, C(t.bgTop));
    pfill(tx, mid, tw, bot - mid, C(t.bgBot));

    draw_decor(g, v, t);

    // Rampes (double rail + traverses) et anneau d'entree
    for (int r = 0; r < 2; r++) {
        const RampDef& rp = t.ramps[r];
        for (int s = 0; s < 4; s++) {
            int x1 = v.X(rp.pts[s].x), y1 = v.Y(rp.pts[s].y);
            int x2 = v.X(rp.pts[s + 1].x), y2 = v.Y(rp.pts[s + 1].y);
            int hw = v.R(rp.wireform ? 4.5f : 6.5f);
            if (hw < 2) hw = 2;
            pline(x1 - hw, y1, x2 - hw, y2, C(rp.color));
            pline(x1 + hw, y1, x2 + hw, y2, C(rp.color));
            if (!rp.wireform) pline(x1, y1, x2, y2, dim(rp.color, 1, 3));
        }
        pcircle(v.X(rp.pts[0].x), v.Y(rp.pts[0].y), v.R(rp.entryRadius * 0.6f), C(t.accent));
    }

    // Puits Multibille
    {
        int lx = v.X(t.lockPos.x), ly = v.Y(t.lockPos.y);
        pfillcircle(lx, ly, v.R(t.lockRadius), C3(6, 40, 30));
        pcircle(lx, ly, v.R(t.lockRadius + 1.0f), g.lockLit ? C3(250, 250, 120) : C3(52, 211, 153));
        if (g.lockLit && ((g.nowMs / 200u) & 1u)) pcircle(lx, ly, v.R(t.lockRadius + 4.0f), C3(250, 250, 120));
        for (int k = 0; k < g.lockedBalls; k++) pfillcircle(lx - v.R(3) + k * v.R(6), ly, v.R(2.5f), C3(226, 232, 240));
    }

    // Murs et slingshots (clignotent quand ils sont touches)
    for (int w = 0; w < g.wallCount; w++) {
        const Segment& s = g.walls[w];
        uint16_t col = g.wallFlash[w] > 0.0f ? C3(255, 255, 255) : C(s.color);
        pline(v.X(s.x1), v.Y(s.y1), v.X(s.x2), v.Y(s.y2), col);
        if (s.scoring) pline(v.X(s.x1) + 1, v.Y(s.y1), v.X(s.x2) + 1, v.Y(s.y2), col);
    }

    // Ressort du lanceur
    {
        int top2 = v.Y(488.0f - (1.0f - g.plungerCharge) * 14.0f);
        int bot2 = v.Y(492.0f);
        if (bot2 < top2) { int tmp = top2; top2 = bot2; bot2 = tmp; }
        pfill(v.X(214.0f), top2, v.R(14), bot2 - top2 + 3, C3(239, 68, 68));
    }

    // Bumpers
    for (int k = 0; k < t.bumperCount; k++) {
        const BumperDef& b = t.bumpers[k];
        int bx = v.X(b.x), by = v.Y(b.y), br = v.R(b.r);
        bool flash = g.bumperFlash[k] > 0.0f;
        pfillcircle(bx, by, br, flash ? C3(255, 255, 255) : C(b.fill));
        pcircle(bx, by, br, C(b.rim));
        pcircle(bx, by, br > 2 ? br - 2 : 1, dim(b.rim, 1, 2));
        pfillcircle(bx, by, br / 3 > 0 ? br / 3 : 1, flash ? C(b.fill) : C3(255, 255, 255));
    }

    // Medaillon des 3 missions au-dessus des flippers
    {
        int cy = v.Y(430.0f);
        for (int m = 0; m < 3; m++) {
            int mx = v.X(92.0f + m * 16.0f);
            bool done = m < (g.missionIdx % 3);
            bool curr = m == (g.missionIdx % 3);
            uint16_t c = done ? C3(52, 211, 153) : (curr ? C(t.accent) : C3(51, 65, 85));
            pfillcircle(mx, cy, v.R(4.5f), c);
            pcircle(mx, cy, v.R(4.5f), C3(255, 255, 255));
        }
    }

    // Flippers
    for (int f = 0; f < g.flipperCount; f++) {
        const FlipperRuntime& fl = g.flippers[f];
        int x1 = v.X(fl.px), y1 = v.Y(fl.py);
        int x2 = v.X(fl.px + cosf(fl.angleRad) * fl.length);
        int y2 = v.Y(fl.py + sinf(fl.angleRad) * fl.length);
        pline(x1, y1 - 1, x2, y2 - 1, C3(255, 255, 255));
        pline(x1, y1, x2, y2, C(t.flipperCol));
        pline(x1, y1 + 1, x2, y2 + 1, C(t.flipperCol));
        pfillcircle(x1, y1, v.R(3.5f) < 2 ? 2 : v.R(3.5f), C(t.accent));
    }

    // Billes, et fleche radar quand une bille est au-dessus de la vue
    for (int i = 0; i < MAX_BALLS; i++) {
        if (!g.balls[i].active) continue;
        int bx = v.X(g.balls[i].x), by = v.Y(g.balls[i].y);
        int br = v.R(BALL_RADIUS) < 2 ? 2 : v.R(BALL_RADIUS);
        if (by + br >= HUD_H) {
            pfillcircle(bx, by, br, C3(226, 232, 240));
            pfillcircle(bx - 1, by - 1, br / 3 > 0 ? br / 3 : 1, C3(255, 255, 255));
        } else {
            ptri(bx, HUD_H + 3, bx - 4, HUD_H + 10, bx + 4, HUD_H + 10, C(t.accent));
        }
    }
}

static void panel(const TableDef& t, uint32_t border, int h = 106) {
    pfill(18, HUD_H + 18, 204, h, C3(12, 18, 30));
    prect(18, HUD_H + 18, 204, h, C(border));
    (void)t;
}

static void draw_overlays(const Game& g, const TableDef& t) {
    const int y0 = HUD_H + 18;
    uint16_t grey = C3(148, 163, 184), white = C3(255, 255, 255), green = C3(52, 211, 153), red = C3(248, 113, 113);
    if (g.state == State::Menu) {
        panel(t, t.accent, 132);
        ptext_center(120, y0 + 8, "GAMEBUINO AKA PINBALL", C(t.accent));
        char buf[64];
        snprintf(buf, sizeof(buf), "< %u/%d >", g.tableIdx + 1, TABLE_COUNT);
        ptext_center(120, y0 + 24, buf, white);
        ptext_center(120, y0 + 38, t.name, C(t.accent));
        ptext_wrap(28, y0 + 54, 24, t.subName, grey, 3);
        snprintf(buf, sizeof(buf), "RECORD %lu", (unsigned long)g.highScores[g.tableIdx]);
        ptext_center(120, y0 + 92, buf, white);
        ptext_center(120, y0 + 108, "A/D: TABLE  R1/B: JOUER", green);
    } else if (g.state == State::Paused) {
        bool armRestart = g.confirmAction == 1 && g.nowMs < g.confirmUntilMs;
        bool armMenu = g.confirmAction == 2 && g.nowMs < g.confirmUntilMs;
        panel(t, t.accent);
        ptext(30, y0 + 10, "PAUSE", C(t.accent), 2);
        ptext(30, y0 + 34, "C / R1 : REPRENDRE", white);
        ptext(30, y0 + 56, armRestart ? "B : CONFIRMER ?" : "B : RECOMMENCER (x2)", armRestart ? red : grey);
        ptext(30, y0 + 76, armMenu ? "A : CONFIRMER ?" : "A : MENU TABLES (x2)", armMenu ? red : grey);
    } else if (g.state == State::GameOver) {
        panel(t, 0xEF4444);
        ptext_center(120, y0 + 10, "FIN DE PARTIE", C3(239, 68, 68), 1);
        char buf[64];
        snprintf(buf, sizeof(buf), "SCORE %lu", (unsigned long)g.score);
        ptext_center(120, y0 + 30, buf, white, 1);
        if (g.newRecord) {
            ptext_center(120, y0 + 48, "NOUVEAU RECORD !", C3(250, 204, 21));
        } else {
            snprintf(buf, sizeof(buf), "RECORD %lu", (unsigned long)g.highScores[g.tableIdx]);
            ptext_center(120, y0 + 48, buf, grey);
        }
        ptext_center(120, y0 + 76, "R1/B: REJOUER", green);
        ptext_center(120, y0 + 90, "C: MENU", green);
    } else if (g.bannerTimer > 0.0f) {
        pfill(14, HUD_H + 6, 212, 20, C3(15, 23, 42));
        prect(14, HUD_H + 6, 212, 20, C(t.accent));
        char buf[27];
        size_t bi = 0;
        for (; g.bannerText[bi] && bi < sizeof(buf) - 1; bi++) buf[bi] = g.bannerText[bi];
        buf[bi] = 0;
        ptext_center(120, HUD_H + 12, buf, white);
    }
}

static void draw_hud(const Game& g, const TableDef& t) {
    pfill(0, 0, SCREEN_W, HUD_H, C3(9, 13, 22));
    pfill(0, HUD_H - 1, SCREEN_W, 1, C(t.accent));

    char name[21];   // 20 caracteres au plus : "BILLE n/3" commence a x = 168
    size_t ni = 0;
    for (; t.name[ni] && ni < sizeof(name) - 1; ni++) name[ni] = t.name[ni];
    name[ni] = 0;
    ptext(6, 5, name, C(t.accent));

    char buf[48];
    snprintf(buf, sizeof(buf), "BILLE %u/3", g.ballsRemaining);
    ptext(168, 5, buf, C3(255, 255, 255));

    snprintf(buf, sizeof(buf), "%08lu", (unsigned long)g.score);
    ptext(6, 22, buf, C3(255, 255, 255), 2);

    const MissionDef& m = t.missions[g.missionIdx % 3];
    if (g.multiballActive) {
        ptext(146, 22, "MULTIBILLE!", C3(52, 211, 153));
    } else {
        snprintf(buf, sizeof(buf), "M%u:%u/%u L:%u/2%s", (g.missionIdx % 3) + 1, g.missionProgress, m.goal, g.lockedBalls, g.lockLit ? "*" : "");
        ptext(146, 22, buf, C3(148, 163, 184));
    }
    // Titre de mission en defilement (11 caracteres visibles)
    {
        int n = (int)strlen(m.title);
        char win[12];
        if (n <= 11) {
            snprintf(win, sizeof(win), "%s", m.title);
        } else {
            int off = (int)((g.nowMs / 280u) % (uint32_t)(n + 3));
            for (int i = 0; i < 11; i++) {
                int k = (off + i) % (n + 3);
                win[i] = k < n ? m.title[k] : ' ';
            }
            win[11] = 0;
        }
        ptext(146, 34, win, C3(250, 204, 21));
    }
}

void draw(const Game& g) {
    const TableDef& t = g.tbl();
    View v;
    v.zoom = g.cameraZoom;
    v.camY = g.cameraY;
    v.xPad = ((float)SCREEN_W - (float)WORLD_W * g.cameraZoom) * 0.5f;

    draw_playfield(g, v, t);
    draw_overlays(g, t);
    draw_hud(g, t);       // en dernier : le HUD recouvre le bord gauche de l'ecran physique
}

} // namespace render
