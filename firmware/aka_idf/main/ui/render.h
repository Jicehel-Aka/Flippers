#pragma once
#include "../game/pinball_core.h"

namespace render {

// Dessine l'etat complet du jeu dans le framebuffer (l'appelant fait vid::present()).
// Le jeu pense en portrait 240x320 ; ici tout est tourne a 90 degres vers l'ecran paysage 320x240.
void draw(const pinball::Game& g);

// Decor pre-rendu d'un plateau : 240 lignes ECRAN x 520 pixels RGB565 (ligne r = colonne 239 - r du plateau,
// pixels y = 0..519 ; format pixel du pilote AKA). nullptr = pas d'image : le rendu vectoriel de secours est utilise.
// Fourni par la plateforme (flash sur la console, fichier dans le test PC).
const uint8_t* table_art(int tableIdx);

} // namespace render
