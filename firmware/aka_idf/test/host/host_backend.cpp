// Backend graphique du test PC : un framebuffer 320x240 en RGB565 qui REFUSE tout acces hors ecran
// (abort), ce qui verifie que gfx_prims.cpp ecrete bien avant d'appeler le pilote.
#include "../../main/ui/gfx.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

// police du SDK (definie dans le header, comme dans gb_graphics.cpp)
#include "../../components/gamebuino/include_lib/font8x8_basic.h"

namespace vid {

uint16_t g_fb[W * H];
unsigned long g_raw_calls = 0;

// meme format que lcd_color_rgb() du SDK AKA : R bits 0-4, V bits 5-10, B bits 11-15
uint16_t rgb(uint8_t r, uint8_t g, uint8_t b) { return (uint16_t)((r >> 3) | ((g >> 2) << 5) | ((b >> 3) << 11)); }

void raw_pixel(int x, int y, uint16_t c) {
    if (x < 0 || x >= W || y < 0 || y >= H) { fprintf(stderr, "raw_pixel hors ecran: %d,%d\n", x, y); abort(); }
    g_fb[y * W + x] = c;
    g_raw_calls++;
}

void raw_fill_rect(int x, int y, int w, int h, uint16_t c) {
    if (x < 0 || y < 0 || w <= 0 || h <= 0 || x + w > W || y + h > H) {
        fprintf(stderr, "raw_fill_rect hors ecran: %d,%d %dx%d\n", x, y, w, h);
        abort();
    }
    for (int j = 0; j < h; j++) for (int i = 0; i < w; i++) g_fb[(y + j) * W + x + i] = c;
    g_raw_calls++;
}

void raw_blit_row(int x, int y, const uint16_t* px, int n) {
    if (x < 0 || y < 0 || n <= 0 || x + n > W || y >= H) {
        fprintf(stderr, "raw_blit_row hors ecran: %d,%d n=%d\n", x, y, n);
        abort();
    }
    memcpy(&g_fb[y * W + x], px, (size_t)n * sizeof(uint16_t));
    g_raw_calls++;
}

void present() {}

void dump_ppm(const char* path) {
    FILE* f = fopen(path, "wb");
    if (!f) return;
    fprintf(f, "P6\n%d %d\n255\n", W, H);
    for (int i = 0; i < W * H; i++) {
        uint16_t c = g_fb[i];
        uint8_t px[3] = {(uint8_t)((c & 31) << 3), (uint8_t)(((c >> 5) & 63) << 2), (uint8_t)(((c >> 11) & 31) << 3)};
        fwrite(px, 1, 3, f);
    }
    fclose(f);
}

unsigned count_non_background(uint16_t bg) {
    unsigned n = 0;
    for (int i = 0; i < W * H; i++) if (g_fb[i] != bg) n++;
    return n;
}

} // namespace vid

// Decors des plateaux : lus depuis main/art/art<N>.z (flux deflate), decompresses avec le meme code que le firmware
#include "../../main/ui/render.h"
#include "../../main/game/inflate.h"
namespace render {
const uint8_t* table_art(int tableIdx) {
    static unsigned char* cache[32];
    if (tableIdx < 0 || tableIdx >= 32) return nullptr;
    if (!cache[tableIdx]) {
        char path[512];
        snprintf(path, sizeof(path), "%s/art%d.z", ART_DIR, tableIdx);
        FILE* f = fopen(path, "rb");
        if (!f) return nullptr;
        fseek(f, 0, SEEK_END);
        const long n = ftell(f);
        fseek(f, 0, SEEK_SET);
        unsigned char* z = (unsigned char*)malloc((size_t)n);
        if (fread(z, 1, (size_t)n, f) != (size_t)n) { fclose(f); free(z); return nullptr; }
        fclose(f);
        cache[tableIdx] = (unsigned char*)malloc(240 * 520 * 2);
        if (pinball::inflate_raw(z, (size_t)n, cache[tableIdx], 240 * 520 * 2) != 240 * 520 * 2) { free(cache[tableIdx]); cache[tableIdx] = nullptr; }
        free(z);
    }
    return cache[tableIdx];
}
} // namespace render
