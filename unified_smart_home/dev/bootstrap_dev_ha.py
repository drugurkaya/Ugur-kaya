#!/usr/bin/env python3
"""Geliştirme HA örneğinin ilk kurulumunu (onboarding) tamamlar ve test kimlik bilgilerini yazar.

YALNIZCA dev/run_dev_ha.sh ile başlatılan geçici test örneği içindir. Gerçek kurulumda
onboarding Home Assistant arayüzünden yapılır. Kimlik bilgileri <config>/.ush-test-credentials.json
dosyasına yazılır (depoya girmez) ve testler bu dosyayı okur.

Yalnızca Python standart kütüphanesi kullanır.
"""
from __future__ import annotations

import json
import secrets
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


def request(method: str, url: str, data=None, token: str | None = None, form: bool = False):
    headers = {}
    body = None
    if data is not None:
        if form:
            body = urllib.parse.urlencode(data).encode()
            headers["Content-Type"] = "application/x-www-form-urlencoded"
        else:
            body = json.dumps(data).encode()
            headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, data=body, method=method, headers=headers)
    with urllib.request.urlopen(req, timeout=30) as resp:
        raw = resp.read()
        return json.loads(raw) if raw else None


def wait_for(base: str, timeout: float = 180) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            request("GET", f"{base}/api/onboarding")
            return
        except urllib.error.HTTPError:
            return
        except Exception:
            time.sleep(1)
    raise SystemExit("Home Assistant zamanında başlamadı")


def main() -> None:
    base = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8123"
    config_dir = Path(sys.argv[2] if len(sys.argv) > 2 else ".dev-ha-config")
    cred_file = config_dir / ".ush-test-credentials.json"
    wait_for(base)

    steps = request("GET", f"{base}/api/onboarding")
    done = {s["step"]: s["done"] for s in steps}
    client_id = f"{base}/local/unified-smart-home/"
    if not done.get("user"):
        password = secrets.token_urlsafe(18)
        res = request(
            "POST",
            f"{base}/api/onboarding/users",
            {"client_id": client_id, "name": "Test Yönetici", "username": "testadmin", "password": password, "language": "tr"},
        )
        tokens = request(
            "POST",
            f"{base}/auth/token",
            {"grant_type": "authorization_code", "code": res["auth_code"], "client_id": client_id},
            form=True,
        )
        access = tokens["access_token"]
        for step in ("core_config", "analytics", "integration"):
            payload = {"client_id": client_id, "redirect_uri": client_id} if step == "integration" else {}
            try:
                request("POST", f"{base}/api/onboarding/{step}", payload, token=access)
            except urllib.error.HTTPError as err:  # adım zaten tamamlanmış olabilir
                if err.code not in (403, 400):
                    raise
        cred = {"base": base, "client_id": client_id, "username": "testadmin", "password": password}
        cred_file.write_text(json.dumps(cred, indent=2))
        cred_file.chmod(0o600)
        print("Onboarding tamamlandı; kimlik bilgileri:", cred_file)
    else:
        print("Onboarding zaten tamamlanmış")


if __name__ == "__main__":
    main()
