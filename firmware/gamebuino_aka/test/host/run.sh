#!/usr/bin/env bash
# Compile main.cpp sur PC avec des mocks Arduino/LovyanGFX (C++11 puis C++17) et joue un scénario scripté.
# Usage : bash firmware/gamebuino_aka/test/host/run.sh
set -euo pipefail
cd "$(dirname "$0")"
OUT="${TMPDIR:-/tmp}"
for std in gnu++11 gnu++17; do
  echo "== Compilation ($std) =="
  g++ -std="$std" -Wall -Wextra -Wno-unused-parameter -DAKA_HOST_TEST -I. -I../../include test_main.cpp -o "$OUT/aka_host_test_$std"
done
echo "== Exécution =="
"$OUT/aka_host_test_gnu++17"
