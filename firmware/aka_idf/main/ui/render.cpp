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
// Disque / anneau centres sur des coordonnees CANVAS flottantes (portrait). Ils se calent exactement sur le decor
// pre-rendu : un cercle a centre entier (pfillcircle) serait decale d'un demi-pixel.
static void pdisc(float cx, float cy, float r, uint16_t col) {
    if (r <= 0.0f) return;
    for (int j = (int)floorf(cy - r); j < (int)ceilf(cy + r); j++) {
        const float dy = (float)j + 0.5f - cy;
        const float q = r * r - dy * dy;
        if (q <= 0.0f) continue;
        const float w = sqrtf(q);
        const int x0 = (int)lroundf(cx - w), x1 = (int)lroundf(cx + w);
        if (x1 > x0) pfill(x0, j, x1 - x0, 1, col);
    }
}
static void pring(float cx, float cy, float r, float thick, uint16_t col) {
    const float ri = r - thick;
    for (int j = (int)floorf(cy - r); j < (int)ceilf(cy + r); j++) {
        const float dy = (float)j + 0.5f - cy;
        const float qo = r * r - dy * dy;
        if (qo <= 0.0f) continue;
        const float wo = sqrtf(qo);
        const int xo0 = (int)lroundf(cx - wo), xo1 = (int)lroundf(cx + wo);
        const float qi = ri * ri - dy * dy;
        if (ri > 0.0f && qi > 0.0f) {
            const float wi = sqrtf(qi);
            const int xi0 = (int)lroundf(cx - wi), xi1 = (int)lroundf(cx + wi);
            if (xi0 > xo0) pfill(xo0, j, xi0 - xo0, 1, col);
            if (xo1 > xi1) pfill(xi1, j, xo1 - xi1, 1, col);
        } else if (xo1 > xo0) {
            pfill(xo0, j, xo1 - xo0, 1, col);
        }
    }
}
static void prect(int x, int y, int w, int h, uint16_t col) {
    if (w <= 0 || h <= 0) return;
    vid::rect(SX(y), SY(x + w - 1), h, w, col);
}

// Trait epais (quadrilatere plein) en coordonnees portrait, demi-largeur hw (pixels ecran).
static void pthick(int x0, int y0, int x1, int y1, float hw, uint16_t col) {
    const float dx = (float)(x1 - x0), dy = (float)(y1 - y0);
    const float len = sqrtf(dx * dx + dy * dy);
    if (len < 0.5f) { pfillcircle(x0, y0, (int)(hw + 0.5f), col); return; }
    const int nx = (int)lroundf(-dy / len * hw), ny = (int)lroundf(dx / len * hw);
    ptri(x0 + nx, y0 + ny, x0 - nx, y0 - ny, x1 + nx, y1 + ny, col);
    ptri(x0 - nx, y0 - ny, x1 + nx, y1 + ny, x1 - nx, y1 - ny, col);
}

// Trait effile (flipper) : demi-largeur hw0 au pivot, hw1 a la pointe.
static void ptaper(int x0, int y0, int x1, int y1, float hw0, float hw1, uint16_t col) {
    const float dx = (float)(x1 - x0), dy = (float)(y1 - y0);
    const float len = sqrtf(dx * dx + dy * dy);
    if (len < 0.5f) return;
    const float ux = -dy / len, uy = dx / len;
    const int ax = x0 + (int)lroundf(ux * hw0), ay = y0 + (int)lroundf(uy * hw0);
    const int bx = x0 - (int)lroundf(ux * hw0), by = y0 - (int)lroundf(uy * hw0);
    const int cx = x1 + (int)lroundf(ux * hw1), cy = y1 + (int)lroundf(uy * hw1);
    const int ex = x1 - (int)lroundf(ux * hw1), ey = y1 - (int)lroundf(uy * hw1);
    ptri(ax, ay, bx, by, cx, cy, col);
    ptri(bx, by, cx, cy, ex, ey, col);
}

// Melange de deux couleurs RGB888 : a + (b - a) * num / den
static uint16_t mix(uint32_t a, uint32_t b, int num, int den) {
    int r = (int)((a >> 16) & 255), g = (int)((a >> 8) & 255), bl = (int)(a & 255);
    int r2 = (int)((b >> 16) & 255), g2 = (int)((b >> 8) & 255), b2 = (int)(b & 255);
    return C3(r + (r2 - r) * num / den, g + (g2 - g) * num / den, bl + (b2 - bl) * num / den);
}
static uint16_t lighten(uint32_t c, int pct) { return mix(c, 0xFFFFFF, pct, 100); }
static uint16_t darken(uint32_t c, int pct) { return mix(c, 0x000000, pct, 100); }

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
    // Coordonnees CANVAS (flottantes) : le pixel i couvre [i, i+1), comme dans les images de decor.
    float Xf(float wx) const { return xPad + wx * zoom; }
    float Yf(float wy) const { return (float)HUD_H + (wy - camY) * zoom; }
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

// ---------------------------------------------------------------------------
// Decor pre-rendu (images generees depuis le moteur de rendu du jeu Web)
// ---------------------------------------------------------------------------
// art : 240 lignes ECRAN de 520 pixels. A l'echelle 1 une ligne d'ecran se recopie d'un seul bloc ;
// sinon (vue d'ensemble, zoom d'arrivee) on echantillonne au plus proche voisin.
static void draw_art_layer(const View& v, const uint8_t* art) {
    static uint16_t rowbuf[VIEW_H];
    static int iyTab[VIEW_H];
    bool allIn = true;
    for (int k = 0; k < VIEW_H; k++) {
        int iy = (int)floorf(v.camY + ((float)k + 0.5f) / v.zoom);
        iyTab[k] = iy;
        if (iy < 0 || iy >= WORLD_H) allIn = false;
    }
    const bool unit = fabsf(v.zoom - 1.0f) < 0.0005f && allIn;
    const uint16_t black = C3(4, 6, 10);
    for (int sy = 0; sy < vid::H; sy++) {
        const float wx = ((float)(vid::H - 1 - sy) + 0.5f - v.xPad) / v.zoom;
        const int ix = (int)floorf(wx);
        if (ix < 0 || ix >= WORLD_W) continue;     // hors plateau : le fond sombre deja pose
        // ligne de l'image = ligne d'ecran ; elle contient la colonne x = 239 - r du plateau, donc r = 239 - ix
        const uint8_t* row = art + (size_t)(WORLD_W - 1 - ix) * WORLD_H * 2;
        if (unit) {
            memcpy(rowbuf, row + (size_t)iyTab[0] * 2, (size_t)VIEW_H * 2);
        } else {
            for (int k = 0; k < VIEW_H; k++) {
                const int iy = iyTab[k];
                if (iy < 0 || iy >= WORLD_H) { rowbuf[k] = black; continue; }
                uint16_t px;
                memcpy(&px, row + (size_t)iy * 2, 2);
                rowbuf[k] = px;
            }
        }
        vid::raw_blit_row(HUD_H, sy, rowbuf, VIEW_H);
    }
}

// Lampes animees posees sur le decor fixe : chevrons du couloir lanceur, rollovers, gemmes de mission.
static void draw_lamps(const Game& g, const View& v, const TableDef& t) {
    // chevrons du couloir lanceur : une lampe sur quatre s'allume, en chenillard
    // (triangle du moteur Web : sommet (225, y-4), base y+3 entre x = 220 et 230, en coordonnees canvas)
    for (int y = 120; y <= 440; y += 45) {
        if ((((g.nowMs / 100u) + (uint32_t)(y / 45)) & 3u) != 0u) continue;
        ptri((int)lroundf(v.Xf(225.0f) - 0.5f), (int)lroundf(v.Yf((float)(y - 4))),
             (int)lroundf(v.Xf(220.0f)),        (int)lroundf(v.Yf((float)(y + 3)) - 1.0f),
             (int)lroundf(v.Xf(230.0f) - 1.0f), (int)lroundf(v.Yf((float)(y + 3)) - 1.0f), darken(t.rail, 15));
    }

    // rollovers : allumes par la bille ; les 4 couloirs clignotent quand ils sont completes
    for (int k = 0; k < MAX_ROLLOVERS; k++) {
        const RolloverDef& ro = t.rollovers[k];
        const bool blink = g.rolloverFlash > 0.0f && k < 4 && (((g.nowMs / 100u) & 1u) != 0u);
        const bool lit = (g.rolloverLit & (1u << k)) != 0 || blink;
        if (!lit) continue;
        const float cx = v.Xf(ro.x), cy = v.Yf(ro.y), cr = ro.r * v.zoom;
        pdisc(cx, cy, cr + 3.0f * v.zoom, darken(t.rail, 65));    // halo
        pdisc(cx, cy, cr + 0.6f * v.zoom, C3(255, 255, 255));     // liseré blanc (trait de 1,2 px centré sur le bord)
        pdisc(cx, cy, cr - 0.6f * v.zoom, C(t.rail));
        if (v.zoom > 0.8f) {
            const char txt[2] = {ro.letter, 0};
            ptext_center((int)lroundf(cx), (int)lroundf(cy) - 4, txt, C3(9, 13, 22));
        }
    }

    // gemmes de mission : acquises = pleines, en cours = pulsation (rayon 4,2 + trait blanc de 1 px)
    for (int i = 0; i < 3; i++) {
        const int cur = g.missionIdx % 3;
        if (i > cur) continue;
        const MissionDef& m = t.missions[i];
        const float gx = v.Xf(t.missionPos.x - 26.0f + (float)i * 26.0f), gy = v.Yf(t.missionPos.y - 3.5f);
        uint16_t col;
        if (i < cur) {
            col = C(m.color);
        } else {
            const int pulse = (int)(55.0f + 45.0f * sinf((float)g.nowMs * 0.01f));   // 10..100 %
            col = mix(0x1E293B, m.color, pulse, 100);
        }
        pdisc(gx, gy, 4.7f * v.zoom, C3(255, 255, 255));
        pdisc(gx, gy, 3.7f * v.zoom, col);
    }
}

// Elements animes dessines PAR-DESSUS le decor : eclats des bumpers et slingshots, puits de verrouillage, ressort.
static void draw_art_dynamic(const Game& g, const View& v, const TableDef& t) {
    draw_lamps(g, v, t);
    for (int w = 0; w < g.wallCount; w++) {
        const Segment& sg = g.walls[w];
        if (!(sg.scoring && g.wallFlash[w] > 0.0f)) continue;
        pthick(v.X(sg.x1), v.Y(sg.y1), v.X(sg.x2), v.Y(sg.y2), 2.5f, C3(255, 255, 255));
    }
    for (int k = 0; k < t.bumperCount; k++) {
        if (!(g.bumperFlash[k] > 0.0f)) continue;
        const BumperDef& b = t.bumpers[k];
        const float bx = v.Xf(b.x), by = v.Yf(b.y), br = b.r * v.zoom;
        pring(bx, by, br + 4.0f, 1.0f, lighten(b.rim, 50));
        pring(bx, by, br + 6.0f, 1.0f, darken(b.rim, 40));
        pdisc(bx, by, br, C3(255, 255, 255));
        pdisc(bx, by, br * 0.66f, lighten(b.fill, 60));
    }
    {   // puits Multibille : clignote quand il est arme, billes verrouillees visibles
        const int lx = v.X(t.lockPos.x), ly = v.Y(t.lockPos.y);
        if (g.lockLit && ((g.nowMs / 200u) & 1u)) {
            pcircle(lx, ly, v.R(t.lockRadius + 3.0f), C3(250, 250, 120));
            pcircle(lx, ly, v.R(t.lockRadius + 5.0f), C3(250, 250, 120));
        }
        for (int k = 0; k < g.lockedBalls; k++) {
            pfillcircle(lx - v.R(3) + k * v.R(6), ly, v.R(3.0f) < 2 ? 2 : v.R(3.0f), C3(226, 232, 240));
        }
    }
    {   // ressort du lanceur (meme dessin que le moteur Web : tete rouge sur ressort a spires, sol a y = 513)
        const float topY = PLUNGER_TOP_Y + g.plungerCharge * 22.0f, floorY = 513.0f;
        const float xc = v.Xf(225.0f);
        pfill((int)lroundf(v.Xf(218.5f)), (int)lroundf(v.Yf(490.0f)), (int)lroundf(13.0f * v.zoom), (int)lroundf(5.0f * v.zoom), C3(20, 70, 40));
        pfill((int)lroundf(xc - 1.8f * v.zoom), (int)lroundf(v.Yf(topY + 3.0f)), (int)lroundf(3.6f * v.zoom) < 1 ? 1 : (int)lroundf(3.6f * v.zoom),
              (int)lroundf((floorY - topY - 3.0f) * v.zoom), C3(148, 163, 184));
        const uint16_t coil = g.plungerCharge > 0.55f ? C3(250, 204, 21) : C3(226, 232, 240);
        const float span = floorY - topY - 4.0f;
        float px = xc, py = v.Yf(topY + 2.0f);
        for (int i = 0; i <= 7; i++) {
            const float y = v.Yf(topY + 3.5f + ((float)i / 7.0f) * span);
            const float x = xc + (i % 2 == 0 ? -4.8f : 4.8f) * v.zoom;
            if (i > 0) pthick((int)lroundf(px), (int)lroundf(py), (int)lroundf(x), (int)lroundf(y), 0.8f, coil);
            px = x; py = y;
        }
        pfill((int)lroundf(xc - 6.0f * v.zoom), (int)lroundf(v.Yf(topY - 0.5f)), (int)lroundf(12.0f * v.zoom), (int)lroundf(4.2f * v.zoom) < 2 ? 2 : (int)lroundf(4.2f * v.zoom), C3(220, 38, 38));
    }
    // protection contre la chute directe : l'embleme de sauvegarde clignote (derniere seconde plus vite)
    if (g.ballSaveTimer > 0.0f && !g.isTilted && (g.ballSaveTimer > 3.0f || ((g.nowMs / 60u) & 1u))) {
        if (t.decor == 0) {
            pfill((int)lroundf(v.Xf(98.0f)), (int)lroundf(v.Yf(484.0f)), (int)lroundf(30.0f * v.zoom), (int)lroundf(13.0f * v.zoom), C3(250, 204, 21));
            if (v.zoom > 0.8f) ptext_center((int)lroundf(v.Xf(113.0f)), (int)lroundf(v.Yf(491.0f)) - 4, "AKA", C3(9, 13, 22));
        } else if (t.decor == 1) {
            pdisc(v.Xf(113.0f), v.Yf(490.0f), 6.0f * v.zoom, C3(250, 204, 21));
        } else {
            pdisc(v.Xf(113.0f), v.Yf(490.0f), 8.6f * v.zoom, C3(255, 255, 255));
            pdisc(v.Xf(113.0f), v.Yf(490.0f), 7.4f * v.zoom, C3(56, 189, 248));
        }
    }
}

static void draw_playfield(const Game& g, const View& v, const TableDef& t) {
    // Fond : hors table = presque noir ; table = degrade vertical (16 bandes) + cadre lumineux
    pfill(0, HUD_H, SCREEN_W, VIEW_H, C3(4, 6, 10));
    const uint8_t* art = table_art(g.tableIdx);
    if (art) {
        draw_art_layer(v, art);
        draw_art_dynamic(g, v, t);
    } else {   // pas d'image : rendu vectoriel de secours
    const int tx = v.X(0), tw = (int)lroundf(WORLD_W * v.zoom);
    const int top = v.Y(0), bot = v.Y((float)WORLD_H);
    for (int b = 0; b < 16; b++) {
        int y0 = top + (bot - top) * b / 16, y1 = top + (bot - top) * (b + 1) / 16;
        pfill(tx, y0, tw, y1 - y0 + 1, mix(t.bgTop, t.bgBot, b, 15));
    }
    // halo central + lampes (inserts) qui guident la bille vers les flippers
    for (int r = 4; r >= 1; r--)
        pfillcircle(v.X(113), v.Y(250), v.R(18.0f * (float)r), mix(t.bgTop, 0xFFFFFF, 2 * (5 - r), 100));
    for (int k = 0; k < 4; k++) {
        const bool on = (((g.nowMs / 180u) + (uint32_t)k) % 4u) == 0u;
        pfillcircle(v.X(113), v.Y(350.0f + (float)k * 14.0f), v.R(2.5f), on ? lighten(t.accent, 40) : darken(t.accent, 70));
    }
    prect(tx, top, tw, bot - top, darken(t.accent, 40));
    prect(tx + 1, top + 1, tw - 2, bot - top - 2, darken(t.accent, 65));

    draw_decor(g, v, t);

    // Rampes : bande pleine ombree, rails lumineux sur les bords, chevrons le long du trajet, anneau d'entree
    for (int r = 0; r < 2; r++) {
        const RampDef& rp = t.ramps[r];
        int hw = v.R(rp.wireform ? 4.5f : 6.5f);
        if (hw < 2) hw = 2;
        for (int sgm = 0; sgm < 4; sgm++) {
            int x1 = v.X(rp.pts[sgm].x), y1 = v.Y(rp.pts[sgm].y);
            int x2 = v.X(rp.pts[sgm + 1].x), y2 = v.Y(rp.pts[sgm + 1].y);
            if (!rp.wireform) pthick(x1, y1, x2, y2, (float)hw, darken(rp.color, 72));            // dessous de la rampe
            pthick(x1, y1, x2, y2, (float)(hw - 1 > 1 ? hw - 1 : 1), mix(t.bgBot, rp.color, rp.wireform ? 12 : 30, 100));
            pline(x1 - hw, y1, x2 - hw, y2, lighten(rp.color, 25));                                 // rails
            pline(x1 + hw, y1, x2 + hw, y2, lighten(rp.color, 25));
            pline(x1 - hw - 1, y1, x2 - hw - 1, y2, darken(rp.color, 50));
            pline(x1 + hw + 1, y1, x2 + hw + 1, y2, darken(rp.color, 50));
            // chevrons : un point lumineux qui court le long de la rampe
            const int n = 3;
            for (int c = 0; c < n; c++) {
                const int ph = (int)((g.nowMs / 90u) % (uint32_t)n);
                if (c != ph) continue;
                pfillcircle((x1 + x2) / 2, (y1 + y2) / 2, 2, lighten(rp.color, 60));
            }
        }
        const int ex = v.X(rp.pts[0].x), ey = v.Y(rp.pts[0].y), er = v.R(rp.entryRadius * 0.6f);
        pfillcircle(ex, ey, er, darken(rp.color, 70));
        pcircle(ex, ey, er, C(t.accent));
        pcircle(ex, ey, er + 1, darken(t.accent, 50));
    }

    // Puits Multibille
    {
        int lx = v.X(t.lockPos.x), ly = v.Y(t.lockPos.y);
        pfillcircle(lx, ly, v.R(t.lockRadius), C3(6, 40, 30));
        pcircle(lx, ly, v.R(t.lockRadius + 1.0f), g.lockLit ? C3(250, 250, 120) : C3(52, 211, 153));
        if (g.lockLit && ((g.nowMs / 200u) & 1u)) pcircle(lx, ly, v.R(t.lockRadius + 4.0f), C3(250, 250, 120));
        for (int k = 0; k < g.lockedBalls; k++) pfillcircle(lx - v.R(3) + k * v.R(6), ly, v.R(2.5f), C3(226, 232, 240));
    }

    // Murs et slingshots (clignotent quand ils sont touches) : rails epais avec reflet
    for (int w = 0; w < g.wallCount; w++) {
        const Segment& sg = g.walls[w];
        const bool fl = g.wallFlash[w] > 0.0f;
        const int x1 = v.X(sg.x1), y1 = v.Y(sg.y1), x2 = v.X(sg.x2), y2 = v.Y(sg.y2);
        const float hw = sg.scoring ? 2.5f : 1.5f;
        pthick(x1, y1, x2, y2, hw + 1.0f, darken(sg.color, 60));
        pthick(x1, y1, x2, y2, hw, fl ? C3(255, 255, 255) : C(sg.color));
        pline(x1, y1, x2, y2, fl ? C3(255, 255, 160) : lighten(sg.color, 45));
    }

    // Ressort du lanceur : fourreau + ressort a spires
    {
        int top2 = v.Y(488.0f - (1.0f - g.plungerCharge) * 14.0f);
        int bot2 = v.Y(492.0f);
        if (bot2 < top2) { int tmp = top2; top2 = bot2; bot2 = tmp; }
        const int px0 = v.X(214.0f), pw = v.R(14);
        pfill(px0 - 1, v.Y(470.0f), pw + 2, v.Y(496.0f) - v.Y(470.0f), C3(30, 41, 59));
        pfill(px0, top2, pw, bot2 - top2 + 3, C3(185, 28, 28));
        for (int yy = top2; yy < bot2 + 3; yy += 3) pfill(px0, yy, pw, 1, C3(252, 165, 165));
        pfill(px0, top2 - 2, pw, 3, C3(226, 232, 240));
    }

    // Bumpers : ombre, jupe, anneau lumineux, calotte degradee, reflet (blanc au choc)
    for (int k = 0; k < t.bumperCount; k++) {
        const BumperDef& b = t.bumpers[k];
        const int bx = v.X(b.x), by = v.Y(b.y), br = v.R(b.r);
        const bool flash = g.bumperFlash[k] > 0.0f;
        pfillcircle(bx + 2, by + 2, br + 1, C3(2, 3, 6));                                     // ombre portee
        if (flash) {
            pcircle(bx, by, br + 4, lighten(b.rim, 50));                                      // onde de choc
            pcircle(bx, by, br + 6, darken(b.rim, 40));
        } else {
            pcircle(bx, by, br + 3, darken(b.rim, 60));                                       // halo
        }
        pfillcircle(bx, by, br + 1, darken(b.rim, 45));                                       // jupe
        pfillcircle(bx, by, br, C(b.rim));                                                    // anneau
        const int cap = br > 3 ? br - 2 : br;
        pfillcircle(bx, by, cap, flash ? C3(255, 255, 255) : darken(b.fill, 25));              // calotte (ombre)
        pfillcircle(bx - cap / 5, by - cap / 5, cap * 4 / 5, flash ? lighten(b.fill, 75) : C(b.fill));
        pfillcircle(bx - cap / 4, by - cap / 4, cap / 2 > 0 ? cap / 2 : 1, flash ? C3(255, 255, 255) : lighten(b.fill, 35));
        pfillcircle(bx - cap / 3, by - cap / 3, cap / 5 > 0 ? cap / 5 : 1, C3(255, 255, 255)); // reflet
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

    }

    // Flippers : batte effilee a reflet, pivot metallique
    for (int f = 0; f < g.flipperCount; f++) {
        const FlipperRuntime& fl = g.flippers[f];
        const int x1 = v.X(fl.px), y1 = v.Y(fl.py);
        const int x2 = v.X(fl.px + cosf(fl.angleRad) * fl.length);
        const int y2 = v.Y(fl.py + sinf(fl.angleRad) * fl.length);
        const float h0 = (float)v.R(5.0f) < 2.5f ? 2.5f : (float)v.R(5.0f);
        const float h1 = h0 * 0.55f;
        ptaper(x1 + 1, y1 + 2, x2 + 1, y2 + 2, h0 + 1.0f, h1 + 1.0f, C3(2, 3, 6));              // ombre
        ptaper(x1, y1, x2, y2, h0 + 1.0f, h1 + 1.0f, darken(t.flipperCol, 55));                  // contour
        ptaper(x1, y1, x2, y2, h0, h1, C(t.flipperCol));                                          // liseré colore
        ptaper(x1, y1, x2, y2, h0 * 0.68f, h1 * 0.62f, lighten(t.flipperCol, 175));               // dessus blanc (chrome)
        ptaper(x1, y1 - 1, x2, y2 - 1, h0 * 0.3f, h1 * 0.3f, C3(255, 255, 255));                  // reflet
        pfillcircle(x2, y2, (int)(h1 * 0.68f + 0.5f), lighten(t.flipperCol, 175));                // bout arrondi
        const int pr = v.R(3.5f) < 2 ? 2 : v.R(3.5f);
        pfillcircle(x1, y1, pr + 1, C3(30, 41, 59));                                              // pivot
        pfillcircle(x1, y1, pr, C(t.accent));
        pfillcircle(x1 - 1, y1 - 1, pr > 2 ? pr / 2 : 1, C3(255, 255, 255));
    }

    // Billes (spheres chromees), et fleche radar quand une bille est au-dessus de la vue
    for (int i = 0; i < MAX_BALLS; i++) {
        if (!g.balls[i].active) continue;
        const int bx = v.X(g.balls[i].x), by = v.Y(g.balls[i].y);
        const int br = v.R(BALL_RADIUS) < 2 ? 2 : v.R(BALL_RADIUS);
        if (by + br >= HUD_H) {
            pfillcircle(bx + 2, by + 2, br, C3(2, 3, 6));                                         // ombre
            pfillcircle(bx, by, br, C3(100, 116, 139));
            pfillcircle(bx - 1, by - 1, br > 2 ? br - 1 : br, C3(203, 213, 225));
            pfillcircle(bx - br / 3, by - br / 3, br / 3 > 0 ? br / 3 : 1, C3(255, 255, 255));    // reflet
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
    uint16_t grey = C3(148, 163, 184), white = C3(255, 255, 255), green = C3(52, 211, 153);
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
        ptext_center(120, y0 + 90, "A/D: TABLES", green);
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
