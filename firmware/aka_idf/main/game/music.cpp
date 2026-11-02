/*
  music.cpp — Quatre boucles originales (une par decor). Chaque pas est un demi-ton au-dessus de la
  fondamentale du decor ; REST = silence. Les mélodies sont composées pour ce jeu.
*/
#include "music.h"
#include "sfx_patterns.h"
#include <math.h>

namespace pinball {

namespace {

constexpr int8_t R = 99;   // silence

struct Theme {
    float rootHz;
    uint16_t stepMs;
    uint8_t wave;
    float vol;
    int8_t steps[MUSIC_STEPS];
};

const Theme THEMES[4] = {
    // 0 circuit : la mineur, carre, allant
    { 220.0f, 118, WAVE_SQUARE, 0.20f,
      { 0, R, 12, R,  7, R, 12, R,   3, R, 12, R,  7, R, 10, R,
        0, R, 12, R,  7, R, 15, R,  14, 12, 10, 7, 12, R, R, R } },
    // 1 espace : re dorien, triangle, flottant
    { 146.83f, 140, WAVE_TRIANGLE, 0.34f,
      { 0, 7, 12, 7,  0, 7, 14, 7,   3, 10, 15, 10,  3, 10, 14, 10,
        -2, 5, 10, 5, -2, 5, 12, 5,   0, 7, 12, 14,  12, 7, 5, R } },
    // 2 Star Wars : mi phrygien, carre, marche sombre (theme original, pas un air de la saga)
    { 164.81f, 124, WAVE_SQUARE, 0.19f,
      { 0, 0, R, 0,  1, R, 0, R,   7, R, 5, R,  3, R, 1, R,
        0, 0, R, 0,  1, R, 3, R,   8, 7, 5, 3,  1, 0, R, R } },
    // 3 temple : mi mineur pentatonique, sinus, mysterieux
    { 164.81f, 165, WAVE_SINE, 0.40f,
      { 0, R, 3, R,  7, R, 10, R,  12, R, 10, R,  7, R, 3, R,
        0, R, 5, R,  8, R, 12, R,  15, R, 12, R,  8, R, R, R } },
};

} // namespace

uint16_t music_step_ms(uint8_t decor, bool intense) {
    const Theme& t = THEMES[decor & 3];
    return intense ? (uint16_t)(t.stepMs * 85u / 100u) : t.stepMs;
}

bool music_note(uint8_t decor, uint32_t step, MusicNote& out) {
    const Theme& t = THEMES[decor & 3];
    const int8_t s = t.steps[step % MUSIC_STEPS];
    if (s == R) return false;
    out.freq = t.rootHz * powf(2.0f, (float)s / 12.0f);
    out.durMs = (uint16_t)(t.stepMs * 85u / 100u);
    out.wave = t.wave;
    out.vol = t.vol;
    return true;
}

} // namespace pinball
