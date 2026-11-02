/*
  platform.h — Couche console Gamebuino AKA (ESP32-S3, ESP-IDF, composants gamebuino + aka_runtime)
*/
#pragma once
#include "../game/pinball_core.h"

struct Keys;   // aka_runtime : core/input.h

namespace platform {

// Entrees : mapping des touches AKA vers les actions du flipper.
// MENU est reserve au menu systeme du lanceur (aka_runtime : reprendre / commandes / langue / credits / retour loader).
pinball::Input input_from_keys(const Keys& k);

// Son : evenements du jeu -> synthese sur les pistes du mixeur gb_audio_player.
void audio_init();
void audio_play(uint8_t decor, pinball::Sfx id, uint8_t arg);
void audio_silence();
// Musique de fond : decor 0..3 pour la jouer, 255 pour l'arreter. `intense` = multibille (tempo plus vif).
void audio_music(uint8_t decor, bool intense);

// Records : fichier /sdcard/pinball/records.bin
pinball::HighScoreStore store();

} // namespace platform
