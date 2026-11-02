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
    in.pause   = k.C || k.RUN;
    return in;
}

} // namespace platform
