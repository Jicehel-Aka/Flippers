#include "gfx.h"

namespace vid {

static inline void px(int x, int y, uint16_t c) {
    if ((unsigned)x < (unsigned)W && (unsigned)y < (unsigned)H) raw_pixel(x, y, c);
}

void fill_rect(int x, int y, int w, int h, uint16_t color) {
    if (w <= 0 || h <= 0) return;
    int x2 = x + w, y2 = y + h;
    if (x < 0) x = 0;
    if (y < 0) y = 0;
    if (x2 > W) x2 = W;
    if (y2 > H) y2 = H;
    if (x2 <= x || y2 <= y) return;
    raw_fill_rect(x, y, x2 - x, y2 - y, color);
}

void clear(uint16_t color) { raw_fill_rect(0, 0, W, H, color); }

void rect(int x, int y, int w, int h, uint16_t color) {
    if (w <= 0 || h <= 0) return;
    fill_rect(x, y, w, 1, color);
    fill_rect(x, y + h - 1, w, 1, color);
    fill_rect(x, y, 1, h, color);
    fill_rect(x + w - 1, y, 1, h, color);
}

void line(int x0, int y0, int x1, int y1, uint16_t color) {
    // Coordonnees folles (camera, zoom) : on borne pour eviter tout debordement d'entier.
    constexpr int LIM = 4000;
    if ((x0 < -LIM && x1 < -LIM) || (x0 > LIM && x1 > LIM) || (y0 < -LIM && y1 < -LIM) || (y0 > LIM && y1 > LIM)) return;
    // Rejet rapide si le segment est entierement d'un meme cote de l'ecran
    if ((x0 < 0 && x1 < 0) || (x0 >= W && x1 >= W) || (y0 < 0 && y1 < 0) || (y0 >= H && y1 >= H)) return;
    int dx = x1 > x0 ? x1 - x0 : x0 - x1;
    int dy = y1 > y0 ? y0 - y1 : y1 - y0;   // -|dy|
    int sx = x0 < x1 ? 1 : -1;
    int sy = y0 < y1 ? 1 : -1;
    int err = dx + dy;
    if (dx > 2 * LIM || -dy > 2 * LIM) return;
    for (;;) {
        px(x0, y0, color);
        if (x0 == x1 && y0 == y1) break;
        int e2 = 2 * err;
        if (e2 >= dy) { err += dy; x0 += sx; }
        if (e2 <= dx) { err += dx; y0 += sy; }
    }
}

void circle(int cx, int cy, int r, uint16_t color) {
    if (r < 0) return;
    if (cx + r < 0 || cx - r >= W || cy + r < 0 || cy - r >= H) return;
    int x = r, y = 0, err = 1 - r;
    while (x >= y) {
        px(cx + x, cy + y, color); px(cx - x, cy + y, color);
        px(cx + x, cy - y, color); px(cx - x, cy - y, color);
        px(cx + y, cy + x, color); px(cx - y, cy + x, color);
        px(cx + y, cy - x, color); px(cx - y, cy - x, color);
        y++;
        if (err < 0) err += 2 * y + 1;
        else { x--; err += 2 * (y - x) + 1; }
    }
}

void fill_circle(int cx, int cy, int r, uint16_t color) {
    if (r < 0) return;
    if (cx + r < 0 || cx - r >= W || cy + r < 0 || cy - r >= H) return;
    int x = r, y = 0, err = 1 - r;
    while (x >= y) {
        fill_rect(cx - x, cy + y, 2 * x + 1, 1, color);
        fill_rect(cx - x, cy - y, 2 * x + 1, 1, color);
        fill_rect(cx - y, cy + x, 2 * y + 1, 1, color);
        fill_rect(cx - y, cy - x, 2 * y + 1, 1, color);
        y++;
        if (err < 0) err += 2 * y + 1;
        else { x--; err += 2 * (y - x) + 1; }
    }
}

void fill_triangle(int x0, int y0, int x1, int y1, int x2, int y2, uint16_t color) {
    // tri par y croissant
    if (y0 > y1) { int t = y0; y0 = y1; y1 = t; t = x0; x0 = x1; x1 = t; }
    if (y1 > y2) { int t = y1; y1 = y2; y2 = t; t = x1; x1 = x2; x2 = t; }
    if (y0 > y1) { int t = y0; y0 = y1; y1 = t; t = x0; x0 = x1; x1 = t; }
    if (y2 < 0 || y0 >= H) return;
    int total = y2 - y0;
    if (total <= 0) {
        int lo = x0 < x1 ? x0 : x1; if (x2 < lo) lo = x2;
        int hi = x0 > x1 ? x0 : x1; if (x2 > hi) hi = x2;
        fill_rect(lo, y0, hi - lo + 1, 1, color);
        return;
    }
    for (int y = (y0 < 0 ? 0 : y0); y <= y2 && y < H; y++) {
        bool second = y > y1 || y1 == y0;
        int segH = second ? y2 - y1 : y1 - y0;
        long a = (long)(x2 - x0) * (y - y0) / total + x0;
        long b = second ? (segH ? (long)(x2 - x1) * (y - y1) / segH + x1 : x1)
                        : (segH ? (long)(x1 - x0) * (y - y0) / segH + x0 : x0);
        int lo = (int)(a < b ? a : b);
        int hi = (int)(a < b ? b : a);
        fill_rect(lo, y, hi - lo + 1, 1, color);
    }
}

} // namespace vid
