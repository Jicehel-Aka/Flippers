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
    int8_t ph[4][PHRASE_STEPS];
};

const Theme THEMES[5] = {
    // 0 circuit : la mineur, carre, allant
    { 220.0f, 118, WAVE_SQUARE, 0.20f,
      {
      { // A
        0, R, 12, R,  7, R, 12, R,   3, R, 12, R,  7, R, 10, R,
        0, R, 12, R,  7, R, 15, R,  14, 12, 10, 7, 12, R, R, R },
      { // B
        5, R, 12, R,  8, R, 12, R,   7, R, 12, R,  8, R,  5, R,
        3, R, 10, R,  7, R, 10, R,  12, 10,  8, 7,  5, 3, R, R },
      { // C
        12, R, 15, R, 19, R, 15, R,  17, R, 15, R, 12, R, 10, R,
        12, R, 15, R, 19, R, 22, R,  24, 22, 19, 15, 12, R, R, R },
      { // D
        0, 3, 7, 12, 7, 3, 0, R,  -5, -2, 2, 7, 2, -2, -5, R,
        -2, 2, 5, 10, 5, 2, -2, R,  0, 3, 7, 10, 12, 10, 7, R }
      }
    },
    // 1 espace : re dorien, triangle, flottant
    { 146.83f, 140, WAVE_TRIANGLE, 0.34f,
      {
      { // A
        0, 7, 12, 7,  0, 7, 14, 7,   3, 10, 15, 10,  3, 10, 14, 10,
        -2, 5, 10, 5, -2, 5, 12, 5,   0, 7, 12, 14,  12, 7, 5, R },
      { // B
        7, 14, 19, 14,  7, 14, 17, 14,  5, 12, 17, 12,  5, 12, 15, 12,
        3, 10, 15, 10,  3, 10, 14, 10,  2, 9, 14, 17,  14, 9, 7, R },
      { // C
        12, R, 14, R, 15, R, 17, R,  19, R, 17, R, 15, R, 14, R,
        12, R, 14, R, 15, R, 19, R,  21, 19, 17, 15, 14, 12, R, R },
      { // D
        0, 5, 7, 12, 14, 12, 7, 5,  -2, 3, 5, 10, 12, 10, 5, 3,
        -4, 1, 3, 8, 10, 8, 3, 1,  -2, 5, 10, 14, 17, 14, 10, R }
      }
    },
    // 2 Star Wars : mi phrygien, carre, marche sombre (theme original, pas un air de la saga)
    { 164.81f, 124, WAVE_SQUARE, 0.19f,
      {
      { // A
        0, 0, R, 0,  1, R, 0, R,   7, R, 5, R,  3, R, 1, R,
        0, 0, R, 0,  1, R, 3, R,   8, 7, 5, 3,  1, 0, R, R },
      { // B
        0, 0, R, 0,  5, R, 0, R,   6, R, 5, R,  3, R, 1, R,
        0, 0, R, 0,  5, R, 7, R,  12, 10, 8, 7,  5, 3, R, R },
      { // C
        7, R, 7, R,  8, R, 7, R,   5, R, 3, R,  1, R, R, R,
        7, R, 7, R,  8, R, 10, R,  12, R, 10, R,  8, 7, R, R },
      { // D
        0, R, R, 0,  R, R, 0, R,   1, R, R, 1,  R, R, 1, R,
        0, R, R, 0,  R, R, 3, R,   5, R, 3, R,  1, R, 0, R }
      }
    },
    // 3 temple : mi mineur pentatonique, sinus, mysterieux
    { 164.81f, 165, WAVE_SINE, 0.40f,
      {
      { // A
        0, R, 3, R,  7, R, 10, R,  12, R, 10, R,  7, R, 3, R,
        0, R, 5, R,  8, R, 12, R,  15, R, 12, R,  8, R, R, R },
      { // B
        12, R, 10, R,  7, R, 10, R,  12, R, 15, R,  12, R, R, R,
        10, R, 7, R,  3, R, 7, R,  10, R, 12, R,  10, R, R, R },
      { // C
        0, 3, 7, 3, 0, 3, 7, R,  -2, 2, 5, 2, -2, 2, 5, R,
        -5, 0, 3, 0, -5, 0, 3, R,  -2, 3, 7, 10, 7, 3, R, R },
      { // D
        15, R, R, 12, R, R, 10, R,  7, R, R, 10, R, R, 12, R,
        15, R, R, 19, R, R, 15, R,  12, R, 10, R, 7, R, R, R }
      }
    },
    // 4 classique : do majeur, carre, orgue de salle d'arcade, entrainant
    { 261.63f, 112, WAVE_SQUARE, 0.19f,
      {
      { // A
        0, R, 4, R,  7, R, 4, R,   9, R, 7, R,  4, R, 2, R,
        0, R, 4, R,  7, R, 12, R,  11, 9, 7, 4,  7, R, R, R },
      { // B
        5, R, 9, R,  12, R, 9, R,  7, R, 11, R,  14, R, 11, R,
        9, R, 5, R,  4, R, 7, R,   9, 7, 5, 4,  2, R, R, R },
      { // C
        12, R, 11, R,  9, R, 7, R,  9, R, 7, R,  4, R, R, R,
        12, R, 14, R,  16, R, 14, R,  12, 11, 9, 7,  12, R, R, R },
      { // D
        0, 4, 7, 12, 7, 4, 0, R,  2, 5, 9, 14, 9, 5, 2, R,
        4, 7, 11, 16, 11, 7, 4, R,  0, 4, 7, 12, 16, 12, 7, R }
      }
    },
};

// Forme : A B A C | D B C A — 8 phrases de 32 pas, soit 256 pas (plus de 30 s avant de reboucler)
constexpr uint8_t ORDER[8] = { 0, 1, 0, 2, 3, 1, 2, 0 };

} // namespace

uint16_t music_step_ms(uint8_t decor, bool intense) {
    const Theme& t = THEMES[decor % 5];
    return intense ? (uint16_t)(t.stepMs * 85u / 100u) : t.stepMs;
}

bool music_note(uint8_t decor, uint32_t step, MusicNote& out) {
    const Theme& t = THEMES[decor % 5];
    const uint32_t pos = step % MUSIC_STEPS;
    const int8_t s = t.ph[ORDER[pos / PHRASE_STEPS]][pos % PHRASE_STEPS];
    if (s == R) return false;
    out.freq = t.rootHz * powf(2.0f, (float)s / 12.0f);
    out.durMs = (uint16_t)(t.stepMs * 85u / 100u);
    out.wave = t.wave;
    out.vol = t.vol;
    return true;
}

} // namespace pinball
