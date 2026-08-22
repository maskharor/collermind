"""E2E: create order via public API -> admin approve with NIK -> verify persistence + contract NIK.

Run explicitly (mutates data): pytest tests/test_nik_approval.py
"""

import io
import json
from datetime import datetime
import os
import re
from pathlib import Path

import pytest
import requests
from docx import Document
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")).rstrip("/")
API = f"{BASE_URL}/api"
backend_env = dotenv_values("/app/backend/.env")
ADMIN_EMAIL = os.environ.get("TEST_ADMIN_EMAIL") or backend_env.get("TEST_ADMIN_EMAIL")
ADMIN_PASSWORD = os.environ.get("TEST_ADMIN_PASSWORD") or backend_env.get("TEST_ADMIN_PASSWORD")
KTP = Path("/app/tests/assets/ktp_test.png")
NIK = "3276019988776655"
SUFFIX = datetime.now().strftime("%H%M%S")


@pytest.fixture(scope="module")
def admin():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text[:200]
    s.headers.update({"Authorization": f"Bearer {r.json()['access_token']}"})
    return s


def test_verify_with_nik_persists_and_renders_in_contract(admin):
    tariffs = requests.get(f"{API}/public/tariffs").json()
    assert tariffs
    payload = {
        "nama": "TEST NIK Gate",
        "email": f"test_nikgate_{SUFFIX}@example.com",
        "no_hp": f"0812{SUFFIX}99",
        "alamat_ktp": "Jl. KTP Test No. 9, Tangerang Selatan",
        "provinsi": "BANTEN",
        "kota_kab": "KOTA TANGERANG SELATAN",
        "kecamatan": "PONDOK AREN",
        "kelurahan": "PONDOK BETUNG",
        "detail_alamat": "Jl. Test No. 9 RT01",
        "status_hunian": "Rumah",
        "jenis_ruangan": "Kamar",
        "tanggal_mulai": "2026-09-01",
        "durasi_sewa": 3,
        "catatan": "TEST nik gate",
        "nama_pj_lokasi": "Pak RT Test",
        "no_hp_pj_lokasi": "081222233344",
        "data_consent": True,
        "items": [{"tariff_id": tariffs[0]["id"], "quantity": 1}],
    }
    r = requests.post(
        f"{API}/public/rentals",
        data={"payload": json.dumps(payload)},
        files={"ktp": ("ktp.png", KTP.read_bytes(), "image/png")},
    )
    if r.status_code == 429:
        pytest.skip("rate limited (5 submissions/hour per IP)")
    assert r.status_code == 200, r.text[:300]
    kode = r.json()["kode"]

    orders = admin.get(f"{API}/admin/orders", params={"q": kode}).json()
    orders = orders if isinstance(orders, list) else orders.get("items", [])
    order = next(o for o in orders if o["kode"] == kode)

    # 1) approve without NIK rejected
    bad = admin.post(f"{API}/admin/orders/{order['id']}/verify", json={"hasil": "approved"})
    assert bad.status_code == 400 and "NIK" in bad.json()["detail"]

    # 2) approve with valid NIK
    ok = admin.post(f"{API}/admin/orders/{order['id']}/verify", json={"hasil": "approved", "nik": NIK, "catatan": "TEST"})
    assert ok.status_code == 200, ok.text[:300]
    assert ok.json()["status"] == "verified"

    # 3) NIK persisted on customer + order verified + contract issued
    detail = admin.get(f"{API}/admin/orders/{order['id']}").json()
    assert detail["customer"]["nik"] == NIK
    assert detail["order"]["status"] == "verified"
    assert detail["order"]["contract_status"] == "pending"
    assert detail["contract"] is not None

    # 4) contract DOCX shows the NIK and Tangsel branch
    doc = requests.get(f"{API}/public/contract/download", params={"kode": kode, "kontak": payload["no_hp"]})
    assert doc.status_code == 200
    d = Document(io.BytesIO(doc.content))
    text = "\n".join(p.text for p in d.paragraphs)
    assert NIK in text, "NIK not rendered in contract"
    assert "KOTANGSEL" in text and "1701260006922" in text
    assert not re.findall(r"\{[^}\n]{2,60}\}", text)
