#pragma once
#include "../game/pinball_core.h"

namespace render {

// Dessine l'etat complet du jeu dans le framebuffer (l'appelant fait vid::present()).
// Le jeu pense en portrait 240x320 ; ici tout est tourne a 90 degres vers l'ecran paysage 320x240.
void draw(const pinball::Game& g);

} // namespace render
