// Records : un petit fichier binaire sur la carte SD (comme les autres jeux AKA).
// Format PNB2 : magic, puis pour chaque table TOP_N entrees (score uint32 + trigramme 4 octets).
// Un fichier PNB1 (un seul record par table, versions <= 1.3.0) reste lisible : son record devient la 1re place ("AKA").
#include "platform.h"
#include <stdio.h>
#include <string.h>

namespace platform {

static const char* kPath = "/sdcard/pinball/records.bin";
static constexpr uint32_t kMagic1 = 0x504E4231;   // "PNB1"
static constexpr uint32_t kMagic2 = 0x504E4232;   // "PNB2"

static void sd_load(pinball::ScoreBoard out[pinball::TABLE_COUNT]) {
    FILE* f = fopen(kPath, "rb");
    if (!f) return;
    uint32_t magic = 0;
    if (fread(&magic, sizeof(magic), 1, f) == 1) {
        if (magic == kMagic2) {
            // un fichier d'une version precedente (moins de tables) reste lisible : on lit autant de tables qu'il en contient
            for (int t = 0; t < pinball::TABLE_COUNT; t++) {
                pinball::ScoreBoard b;
                if (fread(&b, sizeof(b), 1, f) != 1) break;
                for (int i = 0; i < pinball::TOP_N; i++) b.e[i].tri[3] = 0;
                out[t] = b;
            }
        } else if (magic == kMagic1) {
            uint32_t rec[pinball::TABLE_COUNT] = {};
            const size_t n = fread(rec, sizeof(uint32_t), pinball::TABLE_COUNT, f);
            for (size_t t = 0; t < n; t++) {
                if (rec[t] > out[t].e[0].score) {   // l'ancien record devient la 1re place, les autres glissent d'un rang
                    for (int i = pinball::TOP_N - 1; i > 0; i--) out[t].e[i] = out[t].e[i - 1];
                    out[t].e[0].score = rec[t];
                }
            }
        }
    }
    fclose(f);
}

static void sd_store(const pinball::ScoreBoard in[pinball::TABLE_COUNT]) {
    FILE* f = fopen(kPath, "wb");
    if (!f) return;
    fwrite(&kMagic2, sizeof(kMagic2), 1, f);
    fwrite(in, sizeof(pinball::ScoreBoard), pinball::TABLE_COUNT, f);
    fclose(f);
}

pinball::HighScoreStore store() {
    pinball::HighScoreStore s;
    s.load = sd_load;
    s.save = sd_store;
    return s;
}

} // namespace platform
