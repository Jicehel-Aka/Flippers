/*
  sfx_patterns.h — Effets sonores du flipper, decrits comme des suites de notes synthetisees
  (aucun echantillon, aucun fichier audio, aucune musique existante : tout est calcule).
  Portable : le test PC verifie que chaque evenement a un son valide, la console les joue.
*/
#pragma once
#include "pinball_core.h"

namespace pinball {

enum Wave : uint8_t { WAVE_SINE = 0, WAVE_SQUARE = 1, WAVE_TRIANGLE = 2, WAVE_NOISE = 3 };

struct Note {
    uint16_t atMs;       // delai depuis le declenchement de l'evenement
    float f0, f1;        // frequence de depart / d'arrivee (Hz)
    float v0, v1;        // volume de depart / d'arrivee (0..1)
    uint16_t durMs;
    uint8_t wave;
};

constexpr int MAX_NOTES = 12;
struct Pattern {
    Note n[MAX_NOTES];
    uint8_t count = 0;
};

// decor : 2 = plateau Star Wars (blasters, sabres laser, bips de droide, hyperespace) ; les autres : sons de flipper classiques.
void build_pattern(uint8_t decor, Sfx id, uint8_t arg, Pattern& out);

} // namespace pinball
