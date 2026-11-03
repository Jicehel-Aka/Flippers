/*
  music.h — Musique de fond du flipper : boucles originales, synthetisees (aucun echantillon,
  aucune melodie existante). Une boucle par decor de plateau, jouee sur UNE seule voix
  (melodie en arpege, comme sur les consoles 8 bits).
  Portable : le test PC verifie les boucles, la console les joue.
*/
#pragma once
#include <stdint.h>

namespace pinball {

constexpr int DECOR_COUNT = 11;                  // un theme musical par decor (0..10)
constexpr int PHRASE_STEPS = 32;                 // une phrase = 2 mesures de 16 doubles-croches
constexpr int MUSIC_STEPS = PHRASE_STEPS * 8;    // une boucle = 8 phrases (A B A C D B C A)

struct MusicNote {
    float freq;        // Hz
    uint16_t durMs;    // duree sonore (legerement plus courte que le pas : notes detachees)
    uint8_t wave;      // meme codage que Wave (sfx_patterns.h)
    float vol;         // 0..1
};

// Duree d'un pas en ms pour ce decor ; `intense` (multibille) accelere de ~15 %.
uint16_t music_step_ms(uint8_t decor, bool intense);

// Note du pas `step` (modulo MUSIC_STEPS) ; renvoie false si c'est un silence.
bool music_note(uint8_t decor, uint32_t step, MusicNote& out);

} // namespace pinball
