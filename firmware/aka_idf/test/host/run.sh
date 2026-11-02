#!/usr/bin/env bash
# Compile et lance le test hote (coeur de jeu + rendu) avec g++ : aucun ESP-IDF requis.
# Usage : bash firmware/aka_idf/test/host/run.sh [dossier_captures_ppm]
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$here/../.."
out="$(mktemp -d)"
trap 'rm -rf "$out"' EXIT
g++ -std=gnu++17 -funsigned-char -O1 -fno-exceptions -fno-rtti -Wall -Wextra -Werror -Wno-unused-parameter -Wno-sign-compare \
    -o "$out/host_test" \
    "$here/test_main.cpp" "$here/host_backend.cpp" \
    "$root/main/game/pinball_core.cpp" "$root/main/game/sfx_patterns.cpp" "$root/main/game/music.cpp" "$root/main/ui/gfx_prims.cpp" "$root/main/ui/render.cpp" \
    -lm
if [ "${1:-}" != "" ]; then mkdir -p "$1"; fi
"$out/host_test" "${1:-}"
