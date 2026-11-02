#include "platform.h"
#include "core/input.h"        // aka_runtime : struct Keys
#include "gb_ll_common.h"      // EXPANDER_KEY_*

namespace platform {

pinball::Input input_from_keys(const Keys& k) {
    pinball::Input in;
    // Console tournee a 90 degres vers la droite. Plusieurs touches par action : on prend celle qui
    // tombe sous le pouce. Le joystick emule le D-pad (g_core.joystick, deja fusionne dans k.raw
    // par aka_runtime) et sert donc aussi aux flippers et a la navigation.
    in.left    = k.A || k.L1 || k.left;
    in.right   = k.D || k.right;
    in.plunger = k.R1 || k.down;
    in.nudge   = k.B || k.up;
    // Pas de touche de pause : la pause, c'est le menu systeme (MENU). C et RUN (RUN+MENU = retour au loader)
    // ne doivent JAMAIS mettre le jeu en pause par accident.
    in.pause   = false;
    return in;
}

} // namespace platform
