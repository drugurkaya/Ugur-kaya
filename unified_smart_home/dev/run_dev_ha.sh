#!/usr/bin/env bash
# Geliştirme/test için GEÇİCİ bir Home Assistant çekirdeği başlatır (yalnızca 127.0.0.1).
# Gerçek ev kurulumunuza dokunmaz. Cihazlar HA "demo" entegrasyonundandır (SİMÜLASYON).
#
# Kullanım:
#   USH_HA_VENV=/yol/venv dev/run_dev_ha.sh [config_dizini]
# Gereksinim: python3 -m venv <venv> && <venv>/bin/pip install homeassistant
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
VENV="${USH_HA_VENV:?USH_HA_VENV ortam değişkeni, homeassistant kurulu venv yolunu göstermeli}"
CONFIG="${1:-${USH_HA_CONFIG:-$ROOT/.dev-ha-config}}"
export USH_HA_PORT="${USH_HA_PORT:-8123}"

mkdir -p "$CONFIG/packages" "$CONFIG/www"
cp "$HERE/configuration.yaml" "$CONFIG/configuration.yaml"
cp "$ROOT/ha-config/packages/unified_smart_home.yaml" "$CONFIG/packages/unified_smart_home.yaml"
for f in automations.yaml scripts.yaml scenes.yaml; do
  [ -f "$CONFIG/$f" ] || echo "[]" > "$CONFIG/$f"
done
# scripts.yaml bir sözlük olmalı
[ -s "$CONFIG/scripts.yaml" ] && grep -q '^\[\]$' "$CONFIG/scripts.yaml" && echo "{}" > "$CONFIG/scripts.yaml"

# Uygulamayı HA'nın /local/ yoluna yerleştir (gerçek kurulumdaki gibi)
rm -rf "$CONFIG/www/unified-smart-home"
cp -r "$ROOT/app" "$CONFIG/www/unified-smart-home"

exec "$VENV/bin/hass" -c "$CONFIG" "${@:2}"
