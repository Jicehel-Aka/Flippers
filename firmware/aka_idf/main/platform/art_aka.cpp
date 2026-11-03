// Images de decor des plateaux : fichiers main/art/art<N>.z (deflate brut) embarques dans le firmware (EMBED_FILES).
// Generes par scripts/gen-aka-art.mjs depuis le moteur de rendu du jeu Web. Le plateau choisi est decompresse en PSRAM
// (240 x 520 RGB565) ; le rendu lit ensuite cette image comme une simple table de pixels.
#include "../ui/render.h"
#include "../game/inflate.h"
#include "esp_heap_caps.h"
#include <stdio.h>

extern "C" {
extern const uint8_t _binary_art0_z_start[];  extern const uint8_t _binary_art0_z_end[];
extern const uint8_t _binary_art1_z_start[];  extern const uint8_t _binary_art1_z_end[];
extern const uint8_t _binary_art2_z_start[];  extern const uint8_t _binary_art2_z_end[];
extern const uint8_t _binary_art3_z_start[];  extern const uint8_t _binary_art3_z_end[];
extern const uint8_t _binary_art4_z_start[];  extern const uint8_t _binary_art4_z_end[];
extern const uint8_t _binary_art5_z_start[];  extern const uint8_t _binary_art5_z_end[];
extern const uint8_t _binary_art6_z_start[];  extern const uint8_t _binary_art6_z_end[];
extern const uint8_t _binary_art7_z_start[];  extern const uint8_t _binary_art7_z_end[];
extern const uint8_t _binary_art8_z_start[];  extern const uint8_t _binary_art8_z_end[];
extern const uint8_t _binary_art9_z_start[];  extern const uint8_t _binary_art9_z_end[];
extern const uint8_t _binary_art10_z_start[]; extern const uint8_t _binary_art10_z_end[];
extern const uint8_t _binary_art11_z_start[]; extern const uint8_t _binary_art11_z_end[];
}

namespace render {

namespace {
constexpr size_t kArtBytes = 240 * 520 * 2;

struct Embedded { const uint8_t* start; const uint8_t* end; };
const Embedded kArt[] = {
    {_binary_art0_z_start, _binary_art0_z_end},   {_binary_art1_z_start, _binary_art1_z_end},
    {_binary_art2_z_start, _binary_art2_z_end},   {_binary_art3_z_start, _binary_art3_z_end},
    {_binary_art4_z_start, _binary_art4_z_end},   {_binary_art5_z_start, _binary_art5_z_end},
    {_binary_art6_z_start, _binary_art6_z_end},   {_binary_art7_z_start, _binary_art7_z_end},
    {_binary_art8_z_start, _binary_art8_z_end},   {_binary_art9_z_start, _binary_art9_z_end},
    {_binary_art10_z_start, _binary_art10_z_end}, {_binary_art11_z_start, _binary_art11_z_end},
};
constexpr int kArtCount = (int)(sizeof(kArt) / sizeof(kArt[0]));

uint8_t* g_buf = nullptr;
int g_loaded = -1;
}

const uint8_t* table_art(int tableIdx) {
    if (tableIdx < 0 || tableIdx >= kArtCount) return nullptr;
    if (g_loaded == tableIdx) return g_buf;
    if (!g_buf) {
        g_buf = (uint8_t*)heap_caps_malloc(kArtBytes, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
        if (!g_buf) g_buf = (uint8_t*)heap_caps_malloc(kArtBytes, MALLOC_CAP_8BIT);
        if (!g_buf) return nullptr;
    }
    const Embedded& e = kArt[tableIdx];
    const long n = pinball::inflate_raw(e.start, (size_t)(e.end - e.start), g_buf, kArtBytes);
    if (n != (long)kArtBytes) { g_loaded = -1; return nullptr; }
    g_loaded = tableIdx;
    return g_buf;
}

} // namespace render
