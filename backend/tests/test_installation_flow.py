"""E2E: verified order -> signed -> location detail -> allocate -> delivery -> delivered,
then validate installation schedule-request rules (jam only, tanggal auto = delivered_at + 1 day).

Mutates data. Uses the order created by test_nik_approval (TEST NIK Gate) if still at verified stage,
otherwise submits a fresh one.
"""

import json
import os
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")).rstrip("/")
API = f"{BASE_URL}/api"
be = dotenv_values("/app/backend/.env")
KTP = Path("/app/tests/assets/ktp_test.png")
JKT = ZoneInfo("Asia/Jakarta")
KONTAK = "081200099988"
SLOT = "13:00"


def _login(email, pwd):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": pwd})
    assert r.status_code == 200, r.text[:200]
    s.headers.update({"Authorization": f"Bearer {r.json()['access_token']}"})
    return s


@pytest.fixture(scope="module")
def admin():
    return _login(be.get("TEST_ADMIN_EMAIL"), be.get("TEST_ADMIN_PASSWORD"))


@pytest.fixture(scope="module")
def courier():
    return _login(be.get("TEST_COURIER_EMAIL"), be.get("TEST_COURIER_PASSWORD"))


@pytest.fixture(scope="module")
def order(admin):
    lst = admin.get(f"{API}/admin/orders").json()
    lst = lst if isinstance(lst, list) else lst.get("items", [])
    cand = [o for o in lst if o.get("customer_nama") == "TEST NIK Gate" and o.get("status") in ("verified", "scheduled", "delivered")]
    if not cand:
        pytest.skip("no TEST NIK Gate order in verified/scheduled state; run test_nik_approval first")
    return cand[0]


def test_full_flow_to_delivered_and_installation_h1(admin, courier, order):
    oid, kode = order["id"], order["kode"]

    detail = admin.get(f"{API}/admin/orders/{oid}").json()
    status = detail["order"]["status"]
    kontak = detail["customer"]["no_hp"]
    
    if status == "verified":
        # sign contract (legacy sign endpoint)
        if detail["order"]["contract_status"] != "signed":
            r = requests.post(f"{API}/public/contract/sign", json={"kode": kode, "kontak": kontak, "signer_name": "TEST NIK Gate"})
            assert r.status_code == 200, r.text[:200]

        # location detail
        img = KTP.read_bytes()
        r = requests.post(
            f"{API}/public/location-detail",
            data={"kode": kode, "kontak": kontak, "ket_indoor": "TEST indoor dekat stop kontak", "ket_outdoor": "TEST outdoor balkon", "perkiraan_pipa": 3},
            files={"foto_indoor": ("i.png", img, "image/png"), "foto_outdoor": ("o.png", img, "image/png")},
        )
        assert r.status_code == 200, r.text[:300]

        # delivery request must respect H+3
        near = (datetime.now(JKT).date() + timedelta(days=1)).isoformat()
        bad = requests.post(f"{API}/public/schedule-request", json={"kode": kode, "kontak": kontak, "jenis": "delivery", "tanggal": near})
        assert bad.status_code == 400 and "H+3" in bad.json()["detail"]
        good_date = (datetime.now(JKT).date() + timedelta(days=3)).isoformat()
        good = requests.post(f"{API}/public/schedule-request", json={"kode": kode, "kontak": kontak, "jenis": "delivery", "tanggal": good_date})
        assert good.status_code == 200, good.text[:300]
        assert good.json()["tanggal"] == good_date

        # allocate units matching detail spec
        d0 = detail["order"]["details"][0]
        units = admin.get(f"{API}/admin/units", params={"status": "ready"}).json()
        units = units if isinstance(units, list) else units.get("items", [])
        match = [u for u in units if u["kapasitas"] == d0["kapasitas"] and u.get("variant", "Standart") == d0.get("variant", "Standart") and u["status"] == "ready"]
        suffix = datetime.now().strftime("%H%M%S")
        while len(match) < d0["quantity"]:
            idx = len(match)
            cr = admin.post(f"{API}/admin/units", json={
                "kode_unit": f"TEST-UNIT-{d0['kapasitas'].replace(' ', '')}-{suffix}-{idx}",
                "merk": "TEST", "kapasitas": d0["kapasitas"], "tipe": d0.get("tipe", "Split"),
                "variant": d0.get("variant", "Standart"), "status": "ready", "tahun": 2026,
                "harga_sewa_bulanan": d0["harga"],
            })
            assert cr.status_code in (200, 201), cr.text[:300]
            match.append(cr.json())
        r = admin.post(f"{API}/admin/orders/{oid}/allocate", json={"allocations": [{"detail_index": 0, "unit_ids": [u["id"] for u in match[:d0["quantity"]]]}]})
        assert r.status_code == 200, r.text[:300]

        # delivery schedule to courier
        couriers = admin.get(f"{API}/admin/couriers").json()
        cid = (couriers if isinstance(couriers, list) else couriers.get("items"))[0]["id"]
        r = admin.post(f"{API}/admin/orders/{oid}/schedules", json={
            "technician_id": cid, "tanggal": good_date, "jam": "09:00", "jenis_kegiatan": "delivery", "catatan": "TEST"})
        assert r.status_code == 200, r.text[:300]
        status = "scheduled"

    if status == "scheduled":
        tasks = courier.get(f"{API}/courier/schedules").json()
        tasks = tasks if isinstance(tasks, list) else tasks.get("items", [])
        task = next((t for t in tasks if t["rental_order_id"] == oid and t["status"] == "planned"), None)
        assert task, f"courier task not found for order {kode}"
        img = KTP.read_bytes()
        r = courier.post(
            f"{API}/courier/schedules/{task['id']}/submit",
            data={"kondisi": "baik", "catatan": "TEST diterima"},
            files={"foto_surat_jalan": ("a.png", img, "image/png"), "foto_serah_terima": ("b.png", img, "image/png")},
        )
        assert r.status_code == 200, r.text[:300]

    # --- delivered: installation rules ---
    acc = requests.post(f"{API}/public/access", json={"kode": kode, "kontak": kontak}).json()
    assert acc["status"] == "delivered", acc["status"]
    assert acc["delivered_at"], "delivered_at missing"
    expected = (date.fromisoformat(acc["delivered_at"][:10]) + timedelta(days=1)).isoformat()
    assert acc["installation_date"] == expected, (acc["installation_date"], expected)

    # invalid jam rejected
    bad = requests.post(f"{API}/public/schedule-request", json={"kode": kode, "kontak": kontak, "jenis": "installation", "jam": "23:00"})
    assert bad.status_code == 400 and "slot" in bad.json()["detail"].lower()

    # no jam rejected
    bad2 = requests.post(f"{API}/public/schedule-request", json={"kode": kode, "kontak": kontak, "jenis": "installation"})
    assert bad2.status_code == 400

    # valid: jam only, date auto H+1 (ignores any client-sent date)
    ok = requests.post(f"{API}/public/schedule-request", json={
        "kode": kode, "kontak": kontak, "jenis": "installation", "jam": SLOT, "tanggal": "2027-01-01", "catatan": "TEST slot"})
    assert ok.status_code == 200, ok.text[:300]
    body = ok.json()
    assert body["jam"] == SLOT
    assert body["tanggal"] == expected, f"installation date not auto H+1: {body['tanggal']} != {expected}"

    # request reflected in public payload
    acc2 = requests.post(f"{API}/public/access", json={"kode": kode, "kontak": kontak}).json()
    assert acc2["schedule_request"]["jenis"] == "installation"
    assert acc2["schedule_request"]["tanggal"] == expected
