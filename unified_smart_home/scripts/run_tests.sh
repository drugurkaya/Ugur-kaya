#!/usr/bin/env bash
# Tüm testleri çalıştırır:
#   1) Birim testleri (sahte bileşenlerle; HA gerekmez)
#   2) Geçici bir dizinde GERÇEK Home Assistant çekirdeği başlatır (yalnızca 127.0.0.1, demo/simüle cihazlar)
#   3) Entegrasyon + güvenlik testleri (Node, uygulamanın kendi çekirdek kodu ile)
#   4) Arayüz testleri (Playwright/Chromium, iPhone emülasyonu)
# Gerçek ev kurulumunuza DOKUNMAZ.
#
# Gereksinimler: Node 22+, Python 3.13+ ve homeassistant kurulu bir venv:
#   python3 -m venv .venv-ha && .venv-ha/bin/pip install homeassistant home-assistant-frontend
#   USH_HA_VENV=$PWD/.venv-ha scripts/run_tests.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "== Statik analiz"
if command -v eslint >/dev/null; then eslint app/js tests; else echo "eslint bulunamadı, atlandı"; fi

echo "== Birim testleri"
node --test tests/unit/*.test.mjs

if [ -z "${USH_HA_VENV:-}" ]; then
  echo "USH_HA_VENV tanımlı değil: gerçek HA ile entegrasyon/arayüz testleri ATLANDI." >&2
  exit 0
fi

PORT="${USH_HA_PORT:-8124}"
TMP="$(mktemp -d)"
LOG="$TMP/ha.log"
export USH_HA_PORT="$PORT"
echo "== Geçici Home Assistant başlatılıyor: 127.0.0.1:$PORT ($TMP)"
"$ROOT/dev/run_dev_ha.sh" "$TMP/config" >"$LOG" 2>&1 &
HA_PID=$!
cleanup() {
  kill "$HA_PID" 2>/dev/null || true
  wait "$HA_PID" 2>/dev/null || true
  rm -rf "$TMP"
}
trap cleanup EXIT

for _ in $(seq 120); do
  if curl -fs -o /dev/null "http://127.0.0.1:$PORT/api/onboarding"; then break; fi
  if ! kill -0 "$HA_PID" 2>/dev/null; then cat "$LOG"; echo "HA başlatılamadı" >&2; exit 1; fi
  sleep 2
done
python3 "$ROOT/dev/bootstrap_dev_ha.py" "http://127.0.0.1:$PORT" "$TMP/config"
# Demo platformlarının tamamen yüklenmesini bekle
sleep 5
export USH_HA_CREDENTIALS="$TMP/config/.ush-test-credentials.json"

echo "== Entegrasyon ve güvenlik testleri (gerçek HA, simüle cihazlar)"
node --test --test-concurrency=1 tests/integration/*.test.mjs

echo "== Arayüz testleri (Chromium, iPhone emülasyonu)"
export USH_SCREENSHOTS="$ROOT/test-results/screenshots"
node --test --test-concurrency=1 tests/ui/*.test.mjs

if grep -q "Traceback" "$LOG"; then
  echo "UYARI: HA günlüğünde hata izleri var (ör. ağ erişimi olmayan bulut entegrasyonları):"
  grep -B2 "Traceback" "$LOG" | grep -E "ERROR" | sort -u | head -20
fi
echo "Tüm testler tamamlandı."
