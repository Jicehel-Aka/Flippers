// Records : un petit fichier binaire sur la carte SD (comme les autres jeux AKA).
#include "platform.h"
#include <stdio.h>

namespace platform {

static const char* kPath = "/sdcard/pinball/records.bin";
static constexpr uint32_t kMagic = 0x504E4231;   // "PNB1"

static void sd_load(uint32_t out[pinball::TABLE_COUNT]) {
    FILE* f = fopen(kPath, "rb");
    if (!f) return;
    uint32_t buf[1 + pinball::TABLE_COUNT];
    if (fread(buf, sizeof(uint32_t), 1 + pinball::TABLE_COUNT, f) == 1 + pinball::TABLE_COUNT && buf[0] == kMagic) {
        for (int i = 0; i < pinball::TABLE_COUNT; i++) out[i] = buf[1 + i];
    }
    fclose(f);
}

static void sd_store(const uint32_t in[pinball::TABLE_COUNT]) {
    FILE* f = fopen(kPath, "wb");
    if (!f) return;
    uint32_t buf[1 + pinball::TABLE_COUNT];
    buf[0] = kMagic;
    for (int i = 0; i < pinball::TABLE_COUNT; i++) buf[1 + i] = in[i];
    fwrite(buf, sizeof(uint32_t), 1 + pinball::TABLE_COUNT, f);
    fclose(f);
}

pinball::HighScoreStore store() {
    pinball::HighScoreStore s;
    s.load = sd_load;
    s.save = sd_store;
    return s;
}

} // namespace platform
