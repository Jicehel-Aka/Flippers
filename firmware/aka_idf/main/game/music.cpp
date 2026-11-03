/*
  music.cpp — Douze compositions originales (une par decor, 0..11).
  Chaque theme comporte 6 phrases distinctes (A, B, C, D, E, F) de 32 pas agencees
  sur une grande arche de 16 phrases (512 pas, env. 55 a 95 secondes) avec variations
  de registre et de timbre sur le pont central, sans echantillon ni melodie preexistante.
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
    uint8_t altWave;
    float vol;
    float altVol;
    int8_t ph[6][PHRASE_STEPS];
};

const Theme THEMES[DECOR_COUNT] = {
    // 0 AKA ESP32 : la dorien, electro-chiptune nerveux et melodique
    { 220.0f, 118, WAVE_SQUARE, WAVE_TRIANGLE, 0.20f, 0.30f,
      {
      { 0, R, 12, R,  7, R, 12, R,   3, R, 12, R,  7, R, 10, R,
        0, R, 12, R,  7, R, 15, R,  14, 12, 10, 7, 12, R,  7, R },
      { 5, R, 12, R,  9, R, 12, R,   7, R, 14, R, 12, R,  9, R,
        3, R, 10, R,  7, R, 12, R,  14, 12, 10, 7,  5, 3,  0, R },
      { 12, R, 15, R, 19, R, 15, R,  17, R, 15, R, 12, R, 10, R,
        12, R, 15, R, 19, R, 21, R,  19, 17, 15, 12, 14, R, 12, R },
      { 0, 3, 7, 12, 7, 3, 0, R,  -5, -2, 2, 7, 2, -2, -5, R,
        -2, 2, 5, 10, 5, 2, -2, R,  0, 3, 7, 10, 12, 10, 7, R },
      { 7, R, R, 10, 12, R, 7, R,   9, R, R, 12, 14, R,  9, R,
        10, R, 12, R, 15, R, 14, R,  12, R, 10, 7,  9, R, R, R },
      { 12, 12, R, 10, 12, R, 15, R,  14, 14, R, 12, 10, R,  7, R,
        5, 7, 9, 12, 14, 15, 17, 15,  14, 12, 10, 9, 12, R, R, R }
      }
    },
    // 1 Odyssee Spatiale : re lydien (#4), hymne cosmique chantant sans boucle d'arpege repetitive
    { 293.66f, 148, WAVE_TRIANGLE, WAVE_SINE, 0.38f, 0.42f,
      {
      { 0, R, 7, 11, 12, R, 11, 9,   7, R, 6, 7, 11, 9,  7, R,
        0, 2, 6, 7,  14, R, 12, 11,  9, 7, 6, 4,  7, R,  2, R },
      { 7, R, 11, 14, 18, R, 16, 14, 12, R, 11, 9, 11, 12, 14, R,
        9, 11, 12, 16, 19, R, 18, 14, 12, 11, 9, 6, 7, R, R, R },
      { 12, R, 14, 18, 19, R, 18, 14, 16, R, 14, 11, 12, 9, 7, R,
        6, 9, 11, 14, 18, 19, 21, 19, 18, 14, 12, 11, 12, R, R, R },
      { -5, 0, 2, 7, 11, 9, 7, R,   -3, 2, 6, 9, 14, 11, 9, R,
        0, 4, 7, 11, 12, 14, 16, 14, 12, 11, 9, 7,  6, R, R, R },
      { 19, R, 18, 14, 16, R, 14, 11, 12, R, 9, 7,  6, 7, 9, R,
        11, 12, 14, 18, 19, R, 21, 19, 18, 14, 12, 9, 12, R, R, R },
      { 2, 6, 9, 14, 18, 16, 14, R,  4, 7, 11, 16, 19, 18, 16, R,
        6, 9, 14, 18, 21, 19, 18, 14, 12, 11, 9, 7, 12, R, R, R }
      }
    },
    // 2 Star Galaxy : si bemol / sol mineur, grande fanfare space-opera majestueuse, Force et marche imperiale
    { 233.08f, 188, WAVE_SQUARE, WAVE_TRIANGLE, 0.24f, 0.36f,
      {
      { -5, -5, -5, 0,   0, -5, 0, R,    7, 7, 0, 7,    R, 5, 4, 2,
        12, 12, 7, 12,   R, 7, 7, R,     5, 4, 5, 2,    2, -5, 2, R },
      { 0, 0, -5, 0,     R, 7, 7, 0,     7, R, 5, 4,    2, 12, 12, R,
        7, 7, R, 5,      4, 2, 10, 10,   7, R, 0, 0,    7, 0, R, R },
      { -5, R, -3, -3,   R, -3, 5, R,    4, R, 2, R,    0, R, 2, 4,
        2, R, -1, -1,    R, -5, -3, -3,  R, 5, R, 4,    R, 7, 7, R },
      { -3, -3, -3, R,   -3, -3, -3, R,  -3, -3, -3, R, -7, -7, R, 0,
        -3, -3, -3, R,   -7, -7, R, 0,   -3, -3, -3, R, -10, -7, -3, R },
      { -8, R, -3, -3,   -3, R, -1, R,   0, R, 2, R,    0, R, -8, R,
        -3, R, 0, R,     4, 4, 5, R,     9, 9, 7, 4,    -3, -3, R, R },
      { -5, R, 0, 0,     R, 4, 7, 7,     R, 5, 4, R,    2, 2, -5, R,
        0, R, 4, R,      7, R, 10, R,    12, 12, 7, R,  0, 0, R, R }
      }
    },
    // 3 Temple Solaire : re mineur dorien / harmonique, flute de jade et marimba d'or
    { 146.83f, 152, WAVE_SINE, WAVE_TRIANGLE, 0.39f, 0.34f,
      {
      { 0, R, 3, R,  7, 5, 3, R,   0, R, 7, R, 10, 9,  7, R,
        5, R, 7, R,  9, R, 12, R,  11, 9, 7, 5,  7, R, R, R },
      { 12, R, 9, R,  7, R, 9, 12, 14, R, 12, R, 9, R,  7, R,
        10, R, 7, R,  5, R, 7, 10,  9, 7, 5, 3,  2, 3,  0, R },
      { 0, 3, 7, 12,  9, 7, 3, R,  -2, 2, 5, 10, 7, 5,  2, R,
        -4, 0, 3, 9,  7, 3, 0, R,  -1, 2, 5, 8, 11, 8,  5, R },
      { 15, R, 14, 12, 9, R, 7, R, 12, R, 10, 9, 7, R,  3, R,
        5, R, 7, 9,  12, R, 14, R, 15, 14, 12, 9, 12, R, R, R },
      { 7, R, R, 7,  9, 7, 5, R,   3, R, R, 3,  5, 3,  2, R,
        0, R, 3, R,  7, R, 11, R,  12, R, 9, 7,  5, 3,  0, R },
      { 0, 7, 3, 10,  7, 12, 9, 14, 12, 15, 14, 12, 9, 7, 5, 3,
        2, 5, 9, 12, 11, 14, 17, 14, 12, 9, 7, 3,  0, R, R, R }
      }
    },
    // 4 Flipper Classique : do mixolydien / boogie-woogie d'arcade annees 60
    { 261.63f, 110, WAVE_SQUARE, WAVE_TRIANGLE, 0.19f, 0.30f,
      {
      { 0, 4, 7, 9, 10, 9, 7, 4,   5, 9, 12, 14, 15, 14, 12, 9,
        7, 11, 14, 16, 14, 11, 7, 4, 0, 4, 7, 10, 12, R,  7, R },
      { 12, R, 10, 9,  7, R, 4, 3,  4, R, 7, R,  9, 7,  4, R,
        5, R, 9, 12, 15, 14, 12, 9,  7, 9, 11, 14, 12, R, R, R },
      { 9, R, 12, R, 16, 15, 14, 12, 9, R, 7, R,  4, 7,  9, R,
        10, R, 14, R, 17, 16, 14, 12, 11, 9, 7, 5, 4, 2,  0, R },
      { 0, R, 7, 0,  4, R, 9, 4,   7, R, 10, 7,  9, R,  7, 4,
        5, R, 12, 5,  9, R, 14, 9,  7, 11, 14, 17, 16, 14, 12, R },
      { 16, R, 14, R, 12, R, 10, 9, 7, R, 9, R, 12, R, R, R,
        14, R, 12, R,  9, R,  7, 5, 4, 7, 9, 11, 12, R, R, R },
      { 0, 3, 4, 7,  9, 10, 12, R,  5, 8, 9, 12, 14, 15, 17, R,
        16, 14, 12, 10, 9, 7, 4, 3,  4, 7, 11, 14, 12, R, R, R }
      }
    },
    // 5 Prehistoire : la grave pentatonique / triton, percussion tribale brute et ancree
    { 110.0f, 132, WAVE_SQUARE, WAVE_TRIANGLE, 0.25f, 0.40f,
      {
      { 0, 0, 0, R,   3, 0, 0, R,    5, 5, 3, 0,   7, 6, 5, R,
        0, 0, 0, R,   3, 0, 7, R,    6, 5, 3, 0,   0, 0, R, R },
      { 7, 7, 5, 0,   0, R, 3, 0,    7, 7, 6, 5,   3, 0, 0, R,
        5, 5, 7, 10,  7, 6, 5, 3,    0, 3, 0, R,   0, 0, R, R },
      { 0, 7, 0, 7,   6, 5, 3, 0,    0, 7, 0, 10,  7, 6, 5, R,
        0, 3, 5, 6,   7, 7, 5, 3,    0, 0, 7, 0,   0, R, R, R },
      { 0, R, 0, 0,   3, R, 0, 0,    5, R, 3, 0,   6, 5, 3, R,
        0, R, 0, 3,   5, 6, 7, 5,    3, 0, 3, 0,   0, R, R, R },
      { 12, 12, 10, 7, 6, 5, 3, R,  10, 10, 7, 5,  3, 0, 0, R,
        7, 7, 10, 12, 10, 7, 6, 5,   3, 0, 3, 0,   0, R, R, R },
      { 0, 0, 3, 0,   5, 0, 6, 0,    7, 0, 10, 7,  6, 5, 3, 0,
        0, 3, 5, 7,  10, 12, 10, 7,  6, 5, 3, 0,   0, 0, R, R }
      }
    },
    // 6 Far West : sol majeur / mixolydien country, banjo bluegrass, walk-ups et violon hoedown
    { 196.0f, 106, WAVE_SQUARE, WAVE_TRIANGLE, 0.22f, 0.35f,
      {
      { 0, -5, 2, 4,  7, R, 9, 7,    4, 2, 0, -5,  3, 4, 7, R,
        0, 2, 4, 7,   9, 12, 9, 7,   4, 2, 0, -3,  0, -5, 0, R },
      { 0, 4, 7, 12,  9, 7, 4, 0,    5, 9, 12, 14, 12, 9, 5, R,
        7, 11, 14, 12, 9, 7, 4, 2,   3, 4, 7, 9,   7, 4, 0, R },
      { 12, R, 12, 14, 16, 14, 12, 9, 10, R, 10, 12, 14, 12, 9, 7,
        4, 7, 9, 12,  14, 16, 14, 12, 9, 7, 4, 2,   0, R, R, R },
      { 0, 7, -5, 7,  0, 3, 4, 7,    5, 12, 0, 12,  5, 8, 9, 12,
        7, 14, 2, 14, 10, 9, 7, 4,   2, 4, 7, 4,    0, -5, 0, R },
      { 7, R, 9, 12,  16, R, 14, 12, 9, R, 7, 4,    2, 4, 7, R,
        7, 9, 12, 16, 17, 16, 14, 12, 9, 7, 4, 2,   0, R, R, R },
      { 0, 3, 4, 7,   9, 12, 9, 7,   5, 8, 9, 12,  14, 12, 9, 5,
        7, 10, 11, 14, 16, 14, 12, 9, 7, 4, 2, -1,  0, 7, 12, R }
      }
    },
    // 7 Halloween : sol mineur grave / triton et seconde mineure, orgue sombre et angoissant
    { 98.0f, 148, WAVE_TRIANGLE, WAVE_SQUARE, 0.40f, 0.19f,
      {
      { 0, R, 7, 6,   7, 3, 1, 0,    0, R, 8, 7,   6, 3, 1, R,
        0, 3, 6, 7,   8, 7, 6, 3,    1, 3, 1, 0,   0, R, R, R },
      { 12, R, 11, 8, 7, R, 6, 3,    2, 3, 1, 0,   6, R, 7, R,
        0, 1, 3, 6,   7, 8, 11, 8,   7, 6, 3, 1,   0, R, R, R },
      { 0, 7, 8, 7,   0, 6, 7, 6,    0, 7, 8, 11,  8, 7, 6, 3,
        0, 7, 8, 7,   0, 10, 8, 7,   6, 3, 1, 0,   7, 0, R, R },
      { 7, R, 6, R,   3, R, 1, 0,    0, 1, 3, 6,   7, R, 6, R,
        3, 2, 1, 0,   3, 6, 7, 8,    7, 6, 3, 1,   0, R, R, R },
      { 12, 11, 12, 7, 8, 7, 6, 7,   3, 2, 3, 0,   1, 0, 6, R,
        0, 3, 6, 7,   8, 11, 12, 11, 8, 7, 6, 3,   0, R, R, R },
      { 0, 3, 6, 7,   6, 3, 1, 0,    3, 6, 9, 12,  11, 8, 7, 6,
        0, 1, 3, 6,   7, 8, 11, 12,  8, 7, 6, 1,   0, R, R, R }
      }
    },
    // 8 Candy Pop : sol majeur (base G3=196 Hz pour garder 2.5 octaves < 2000 Hz), future-pop kawaii
    { 196.0f, 106, WAVE_TRIANGLE, WAVE_SQUARE, 0.34f, 0.18f,
      {
      { 12, R, 14, 16, 19, R, 16, R, 17, R, 16, 14, 12, R,  9, R,
        11, R, 14, 16, 19, R, 23, R, 21, 19, 16, 14, 19, R, 16, R },
      { 17, R, 21, 19, 16, R, 12, R, 14, R, 19, 16, 11, R,  7, R,
        9, 12, 16, 19, 21, R, 23, 24, 23, 21, 19, 16, 14, R, R, R },
      { 7, 11, 14, 19, 16, 14, 11, 7, 9, 12, 16, 21, 19, 16, 12, 9,
        11, 14, 18, 23, 21, 19, 16, 14, 12, 16, 19, 24, 23, 19, 14, R },
      { 24, R, 23, 19, 21, R, 19, 16, 17, R, 16, 12, 14, R, 11, R,
        12, 14, 16, 19, 21, 23, 24, R, 23, 21, 19, 14, 12, R, R, R },
      { 16, R, R, 19, 14, R, R, 16, 12, R, 14, 16, 19, R, 14, R,
        17, R, 19, 21, 23, R, 19, R, 24, 23, 21, 19, 16, R, R, R },
      { 12, 16, 19, 23, 24, 23, 19, 16, 14, 18, 21, 24, 23, 21, 18, 14,
        16, 19, 23, 26, 24, 23, 19, 16, 14, 19, 23, 21, 19, R, R, R }
      }
    },
    // 9 Bonbons : fa majeur (base F3=174.61 Hz), gavotte de boite a musique et celesta
    { 174.61f, 136, WAVE_SINE, WAVE_TRIANGLE, 0.38f, 0.32f,
      {
      { 12, R, 16, 19, 24, R, 19, R, 21, R, 19, 17, 16, R, 12, R,
        14, R, 17, 21, 19, R, 16, R, 17, 16, 14, 11, 12, R, R, R },
      { 19, R, 24, R, 23, 21, 19, 16, 17, R, 21, R, 19, 17, 16, 12,
        14, R, 19, R, 17, 16, 14, 12, 11, 14, 19, 17, 16, R, R, R },
      { 12, 19, 16, 19, 12, 19, 16, 19, 14, 21, 17, 21, 14, 21, 17, 21,
        16, 24, 19, 24, 17, 24, 21, 24, 19, 17, 16, 14, 12, R, R, R },
      { 24, R, R, 21, 19, R, 16, R, 17, R, R, 14, 12, R,  7, R,
        9, 12, 16, 17, 19, R, 24, R, 23, 21, 19, 17, 19, R, R, R },
      { 17, R, 16, 17, 21, R, 17, R, 16, R, 14, 16, 19, R, 16, R,
        14, R, 17, 19, 21, 23, 24, R, 21, 19, 17, 16, 12, R, R, R },
      { 7, 12, 16, 19, 24, 19, 16, 12, 9, 14, 17, 21, 26, 21, 17, 14,
        11, 14, 19, 23, 24, 21, 17, 14, 12, 16, 19, 24, 12, R, R, R }
      }
    },
    // 10 Train : re mixolydien / blues du rail, roulement continu des bogies et sifflet vapeur
    { 146.83f, 96, WAVE_SQUARE, WAVE_TRIANGLE, 0.21f, 0.35f,
      {
      { 0, 0, 7, 0,   9, 0, 7, 0,    0, 0, 7, 0,   10, 9, 7, 0,
        0, 0, 7, 0,   9, 0, 12, 12,  15, 14, 12, 9, 7, 0, 7, R },
      { 12, 12, 12, R, 15, 15, 12, R, 0, 0, 7, 0,  9, 0, 7, 0,
        14, 14, 14, R, 17, 15, 14, 12, 0, 0, 7, 0, 9, 7, 0, R },
      { 0, 0, 4, 7,   9, 7, 4, 0,    5, 5, 9, 12,  14, 12, 9, 5,
        7, 7, 11, 14, 16, 14, 11, 7, 12, 12, 9, 7,  4, 2, 0, R },
      { 0, 7, 0, 7,   3, 4, 7, 0,    0, 7, 0, 7,   10, 9, 7, 0,
        5, 12, 5, 12, 8, 9, 12, 5,   7, 9, 10, 9,   7, 4, 0, R },
      { 19, 19, 19, R, 16, 16, 12, R, 7, 7, 14, 7, 16, 7, 14, 7,
        17, 17, 17, R, 14, 14, 9, R,  7, 9, 12, 14, 12, 9, 7, R },
      { 0, 0, 7, 0,   10, 0, 9, 0,   7, 0, 12, 0,  14, 12, 9, 7,
        5, 5, 12, 5,  14, 12, 9, 7,  12, 15, 16, 19, 12, 7, 0, R }
      }
    },
    // 11 Crypte : re phrygien dominant / mineur harmonique, requiem de cathedrale givree
    { 146.83f, 175, WAVE_TRIANGLE, WAVE_SINE, 0.34f, 0.40f,
      {
      { 0, R, 7, R,  8, 7, 5, R,   4, R, 5, 7,  8, 7,  4, R,
        0, R, 7, R, 12, R, 11, 8,  7, R, 5, 4,  0, R, R, R },
      { 12, R, 15, 14, 12, R, 8, R, 7, R, 10, 8, 7, R,  4, R,
        5, R, 8, 12, 11, R, 14, R, 12, 11, 8, 7, 4, R, R, R },
      { 0, 7, 12, 7,  1, 8, 12, 8,  4, 7, 12, 7,  5, 8, 12, 8,
        7, 10, 15, 10, 8, 12, 17, 12, 11, 8, 7, 4, 0, R, R, R },
      { 19, R, R, 15, 14, R, 12, R, 15, R, R, 12, 11, R, 7, R,
        8, R, 12, R, 14, R, 17, R, 16, 13, 12, 8, 7, R, R, R },
      { -5, R, 0, R,  1, R, 0, R,  -2, R, 3, R,  5, R,  4, R,
        0, 4, 7, 8,  12, 8, 7, 4,   1, 5, 8, 7,  0, R, R, R },
      { 12, R, 19, 17, 15, R, 12, 8, 7, R, 14, 12, 8, R, 5, 4,
        1, R, 8, 7,  5, 4, 1, 0,   7, R, 4, 1,  0, R, R, R }
      }
    },
};

// Grande arche de 16 phrases (512 pas) : A B A C | D B E C | F D A E | B F C A
constexpr uint8_t ORDER[16] = {
    0, 1, 0, 2,
    3, 1, 4, 2,
    5, 3, 0, 4,
    1, 5, 2, 0
};

// Rupture de rythme par phrase de la grande arche (evite la boucle monotone) :
// 0 normal ; 1 demi-temps (une note sur deux) ; 2 pause rythmique (seulement les temps forts) ; 3 syncope (notes voisines permutees)
constexpr uint8_t FEEL_RHYTHMIC[16] = {0, 0, 0, 3,   0, 1, 0, 2,   0, 3, 1, 0,   3, 1, 0, 2};
constexpr uint8_t FEEL_LYRICAL[16]  = {0, 0, 0, 0,   0, 0, 0, 2,   0, 0, 3, 0,   0, 0, 0, 2};

} // namespace

uint16_t music_step_ms(uint8_t decor, bool intense) {
    const Theme& t = THEMES[decor % DECOR_COUNT];
    if (!intense) return t.stepMs;
    const uint32_t pct = (decor % DECOR_COUNT == 2) ? 92u : 85u;
    return (uint16_t)(t.stepMs * pct / 100u);
}

bool music_note(uint8_t decor, uint32_t step, MusicNote& out) {
    const uint8_t d = decor % DECOR_COUNT;
    const Theme& t = THEMES[d];
    const uint32_t pos = step % MUSIC_STEPS;
    const uint32_t phraseSlot = pos / PHRASE_STEPS;
    const uint8_t phraseId = ORDER[phraseSlot];
    const uint32_t inPhrase = pos % PHRASE_STEPS;
    const bool lyrical = (d == 1 || d == 2 || d == 3 || d == 9 || d == 11);
    const uint8_t feel = lyrical ? FEEL_LYRICAL[phraseSlot] : FEEL_RHYTHMIC[phraseSlot];
    // le dernier tiers de la derniere phrase reste normal pour que la boucle reparte proprement
    const bool tail = (phraseSlot == 15 && inPhrase >= 24);
    uint32_t idx = inPhrase;
    if (!tail) {
        if (feel == 1 && (inPhrase & 1u)) return false;
        if (feel == 2 && (inPhrase & 3u)) return false;
        if (feel == 3) idx = inPhrase ^ 1u;
    }
    const int8_t s = t.ph[phraseId][idx];
    if (s == R) return false;

    float freq = t.rootHz * powf(2.0f, (float)s / 12.0f);
    // Contraste de timbre et de tenue sur les phrases de pont / apogee (E et F)
    const bool useAlt = (phraseId == 4 || phraseId == 5);
    if (freq > 1950.0f) freq *= 0.5f;
    if (freq < 85.0f) freq *= 2.0f;

    const uint32_t gatePct = useAlt ? 90u : (d == 2 ? 92u : 84u);
    out.freq = freq;
    out.durMs = (uint16_t)(t.stepMs * gatePct / 100u);
    out.wave = useAlt ? t.altWave : t.wave;
    out.vol = useAlt ? t.altVol : t.vol;
    return true;
}

} // namespace pinball
