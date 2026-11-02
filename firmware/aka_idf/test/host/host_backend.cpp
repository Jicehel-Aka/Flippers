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

uint16_t rgb(uint8_t r, uint8_t g, uint8_t b) { return (uint16_t)(((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3)); }

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

void present() {}

void dump_ppm(const char* path) {
    FILE* f = fopen(path, "wb");
    if (!f) return;
    fprintf(f, "P6\n%d %d\n255\n", W, H);
    for (int i = 0; i < W * H; i++) {
        uint16_t c = g_fb[i];
        uint8_t px[3] = {(uint8_t)(((c >> 11) & 31) << 3), (uint8_t)(((c >> 5) & 63) << 2), (uint8_t)((c & 31) << 3)};
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
