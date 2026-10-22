#!/usr/bin/env python3
"""Home Assistant otomasyonlarını, senaryolarını (script), alanlarını ve entegrasyon listesini
zaman damgalı bir klasöre JSON olarak dışa aktarır. Yalnızca OKUR; HA'da hiçbir şeyi değiştirmez.

Bu, HA'nın kendi tam yedeğinin (Ayarlar > Sistem > Yedeklemeler) YERİNE değil, YANINA önerilir:
dosyalar sürüm kontrolüne (git) konabilir ve tek tek karşılaştırılabilir.

Kullanım:
    export USH_HA_URL=https://ev.example.com        # veya http://homeassistant.local:8123
    export USH_HA_TOKEN=...                          # HA Profil > Güvenlik > Uzun ömürlü erişim token'ı
    python3 scripts/export_ha_config.py [hedef_klasör]

Token bir ortam değişkeninden okunur; dosyaya veya günlüğe YAZILMAZ. İşiniz bitince token'ı
HA profilinden silebilirsiniz. Yalnızca Python standart kütüphanesi kullanılır.
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path


def api(base: str, token: str, method: str, path: str, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        base.rstrip("/") + path,
        data=data,
        method=method,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        raw = resp.read()
        ctype = resp.headers.get("Content-Type", "")
        if "json" in ctype:
            return json.loads(raw)
        return raw.decode()


def main() -> int:
    base = os.environ.get("USH_HA_URL")
    token = os.environ.get("USH_HA_TOKEN")
    if not base or not token:
        print("USH_HA_URL ve USH_HA_TOKEN ortam değişkenlerini tanımlayın.", file=sys.stderr)
        return 2
    out = Path(sys.argv[1] if len(sys.argv) > 1 else "ha-export") / datetime.now().strftime("%Y%m%d-%H%M%S")
    (out / "automations").mkdir(parents=True)
    (out / "scripts").mkdir()

    try:
        config = api(base, token, "GET", "/api/config")
        states = api(base, token, "GET", "/api/states")
    except urllib.error.HTTPError as err:
        print(f"HA isteği reddetti: HTTP {err.code}. Token geçerli ve yönetici hesabına ait mi?", file=sys.stderr)
        return 1
    except urllib.error.URLError as err:
        print(f"Merkezle bağlantı kurulamadı: {err.reason}", file=sys.stderr)
        return 1

    skipped = []
    n_auto = 0
    for st in states:
        if st["entity_id"].startswith("automation."):
            cid = st["attributes"].get("id")
            if not cid:
                skipped.append(st["entity_id"])  # YAML'da kimliksiz tanımlanmış
                continue
            try:
                cfg = api(base, token, "GET", f"/api/config/automation/config/{cid}")
            except urllib.error.HTTPError:
                skipped.append(st["entity_id"])
                continue
            (out / "automations" / f"{cid}.json").write_text(json.dumps(cfg, ensure_ascii=False, indent=2))
            n_auto += 1
    n_script = 0
    for st in states:
        if st["entity_id"].startswith("script."):
            sid = st["entity_id"][7:]
            try:
                cfg = api(base, token, "GET", f"/api/config/script/config/{sid}")
            except urllib.error.HTTPError:
                skipped.append(st["entity_id"])
                continue
            (out / "scripts" / f"{sid}.json").write_text(json.dumps(cfg, ensure_ascii=False, indent=2))
            n_script += 1

    # Alanlar: REST API'de doğrudan uç nokta yok; HA şablon motoru ile okunur (salt okunur).
    areas_tpl = "{% set ns = namespace(o=[]) %}{% for a in areas() %}{% set ns.o = ns.o + [{'id': a, 'name': area_name(a), 'entities': area_entities(a)}] %}{% endfor %}{{ ns.o | tojson }}"
    try:
        areas = json.loads(api(base, token, "POST", "/api/template", {"template": areas_tpl}))
    except Exception:  # noqa: BLE001 - şablon desteklenmiyorsa atla
        areas = None
    try:
        entries = api(base, token, "GET", "/api/config/config_entries/entry")
        integrations = [{"domain": e["domain"], "title": e["title"], "state": e["state"], "source": e["source"]} for e in entries]
    except urllib.error.HTTPError:
        integrations = None

    summary = {
        "exported_at": datetime.now().isoformat(),
        "ha_version": config.get("version"),
        "location_name": config.get("location_name"),
        "automations": n_auto,
        "scripts": n_script,
        "skipped_not_ui_managed": skipped,
    }
    (out / "areas.json").write_text(json.dumps(areas, ensure_ascii=False, indent=2))
    (out / "integrations.json").write_text(json.dumps(integrations, ensure_ascii=False, indent=2))
    (out / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2))
    print(f"Dışa aktarıldı: {out}  ({n_auto} otomasyon, {n_script} script, {len(skipped)} atlandı)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
