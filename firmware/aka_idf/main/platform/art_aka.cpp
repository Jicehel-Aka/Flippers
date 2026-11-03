// Images de decor des 5 plateaux : fichiers main/art/art<N>.bin embarques dans le firmware (EMBED_FILES),
// lus directement en flash. Generes par scripts/gen-aka-art.mjs depuis le moteur de rendu du jeu Web.
#include "../ui/render.h"

extern "C" {
extern const uint8_t _binary_art0_bin_start[];
extern const uint8_t _binary_art1_bin_start[];
extern const uint8_t _binary_art2_bin_start[];
extern const uint8_t _binary_art3_bin_start[];
extern const uint8_t _binary_art4_bin_start[];
}

namespace render {

const uint8_t* table_art(int tableIdx) {
    switch (tableIdx) {
        case 0: return _binary_art0_bin_start;
        case 1: return _binary_art1_bin_start;
        case 2: return _binary_art2_bin_start;
        case 3: return _binary_art3_bin_start;
        case 4: return _binary_art4_bin_start;
        default: return nullptr;
    }
}

} // namespace render
