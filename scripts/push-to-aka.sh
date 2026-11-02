#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# Script de déploiement local vers la console Gamebuino AKA (Linux / macOS)
# Modes :
#   ./scripts/push-to-aka.sh usb [PORT]       -> Compile & flashe via USB-C
#   ./scripts/push-to-aka.sh sd  /chemin/sd   -> Compile & copie PINBALL.BIN sur MicroSD
# ============================================================================

MODE="${1:-usb}"
TARGET="${2:-}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FW_DIR="${ROOT_DIR}/firmware/gamebuino_aka"

if ! command -v pio >/dev/null 2>&1; then
  echo "[AKA] PlatformIO ('pio') introuvable. Installation conseillée : pip install platformio"
  exit 1
fi

echo "[AKA] Compilation du firmware Gamebuino AKA Pinball..."
pio run -d "${FW_DIR}" -e gamebuino_aka

if [[ "${MODE}" == "sd" ]]; then
  if [[ -z "${TARGET}" || ! -d "${TARGET}" ]]; then
    echo "Usage : ./scripts/push-to-aka.sh sd /chemin/vers/carte_sd"
    exit 1
  fi
  cp -v "${FW_DIR}/dist/PINBALL.BIN" "${TARGET}/PINBALL.BIN"
  sync
  echo "[AKA] PINBALL.BIN copié avec succès sur la MicroSD (${TARGET}/PINBALL.BIN) !"
elif [[ "${MODE}" == "usb" ]]; then
  if [[ -n "${TARGET}" ]]; then
    pio run -d "${FW_DIR}" -e gamebuino_aka -t upload --upload-port "${TARGET}"
  else
    pio run -d "${FW_DIR}" -e gamebuino_aka -t upload
  fi
  echo "[AKA] Firmware flashé avec succès par USB sur la Gamebuino AKA !"
else
  echo "Mode inconnu '${MODE}'. Utilisez 'usb' ou 'sd'."
  exit 1
fi
