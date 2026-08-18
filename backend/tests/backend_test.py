"""CollerMind backend regression tests (v3).

Covers:
- Auth: login/me/RBAC/refresh/logout, httpOnly cookie, bcrypt (indirect via login)
- Public: tariffs, tracking (masked), access with kontak, slots
- Admin: RBAC, CRUD, stats/reports, settings, billings, notifications
- Rental submission validation (durasi/hunian/date/consent) — NOTE: success submit skipped by default (rate limit 5/hr per IP)
- E2E active order CLM-20260817-8U8U/082112223333: invoice Rp1.158.000, 5 monthly scheduled billings
- Legacy orders CLM-20260815-7GXQ (completed) & SAC-808TUJ1K still trackable
- Cron /api/cron/billing: unauth 401, valid secret 200, idempotent by run_id
- Courier RBAC: cannot access /api/admin/*, /api/tech/*; technician cannot access /api/courier/*
- Schedule role mismatch: assign delivery to a technician → 400
"""

import json
import os
import re
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")).rstrip("/")
API = f"{BASE_URL}/api"

backend_env = dotenv_values("/app/backend/.env")
CRON_SECRET = backend_env.get("WEBHOOK_CRON_SECRET") or os.environ.get("WEBHOOK_CRON_SECRET")

ADMIN_EMAIL = os.environ.get("TEST_ADMIN_EMAIL") or backend_env.get("TEST_ADMIN_EMAIL")
ADMIN_PASSWORD = os.environ.get("TEST_ADMIN_PASSWORD") or backend_env.get("TEST_ADMIN_PASSWORD")
TECH_EMAIL = os.environ.get("TEST_TECH_EMAIL") or backend_env.get("TEST_TECH_EMAIL")
TECH_PASSWORD = os.environ.get("TEST_TECH_PASSWORD") or backend_env.get("TEST_TECH_PASSWORD")
COURIER_EMAIL = os.environ.get("TEST_COURIER_EMAIL") or backend_env.get("TEST_COURIER_EMAIL")
COURIER_PASSWORD = os.environ.get("TEST_COURIER_PASSWORD") or backend_env.get("TEST_COURIER_PASSWORD")

# Active v3 E2E order
E2E_KODE = "CLM-20260817-8U8U"
E2E_KONTAK = "082112223333"
E2E_INVOICE_TOTAL = 1158000
# Legacy tracking targets
LEGACY_COMPLETED_KODE = "CLM-20260815-7GXQ"
LEGACY_COMPLETED_KONTAK = "081299988877"
LEGACY_KODE_LOWER = "SAC-808TUJ1K"

KTP_IMAGE = Path("/app/tests/assets/ktp_test.png")


# ---------------- Fixtures ----------------

def _login(email, pwd):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": pwd})
    if r.status_code != 200:
        pytest.fail(f"Login failed for {email}: {r.status_code} {r.text[:200]}")
    tok = r.json().get("access_token")
    if not tok:
        pytest.fail(f"No access_token for {email}")
    s.headers.update({"Authorization": f"Bearer {tok}"})
    return s, r


@pytest.fixture(scope="session")
def admin_session():
    s, _ = _login(ADMIN_EMAIL, ADMIN_PASSWORD)
    return s


@pytest.fixture(scope="session")
def tech_session():
    s, _ = _login(TECH_EMAIL, TECH_PASSWORD)
    return s


@pytest.fixture(scope="session")
def courier_session():
    s, _ = _login(COURIER_EMAIL, COURIER_PASSWORD)
    return s


# ---------------- Auth ----------------

class TestAuth:
    def test_login_success_sets_cookies(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        assert r.status_code == 200
        data = r.json()
        assert data["user"]["email"] == ADMIN_EMAIL
        assert data["user"]["role"] == "admin"
        assert isinstance(data["access_token"], str) and len(data["access_token"]) > 20
        set_cookie = r.headers.get("set-cookie", "")
        assert "access_token" in set_cookie
        assert "httponly" in set_cookie.lower()

    def test_login_invalid(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "wrongxx"})
        assert r.status_code == 401

    def test_me_requires_auth(self):
        assert requests.get(f"{API}/auth/me").status_code == 401

    def test_me_authorized(self, admin_session):
        r = admin_session.get(f"{API}/auth/me")
        assert r.status_code == 200
        body = r.json()
        assert body["email"] == ADMIN_EMAIL
        assert "password_hash" not in body

    def test_courier_login_role(self):
        r = requests.post(f"{API}/auth/login", json={"email": COURIER_EMAIL, "password": COURIER_PASSWORD})
        assert r.status_code == 200
        assert r.json()["user"]["role"] == "courier"

    def test_technician_login_role(self):
        r = requests.post(f"{API}/auth/login", json={"email": TECH_EMAIL, "password": TECH_PASSWORD})
        assert r.status_code == 200
        assert r.json()["user"]["role"] == "technician"


# ---------------- Public tariffs / tracking / slots ----------------

class TestPublic:
    def test_tariffs_list(self):
        r = requests.get(f"{API}/public/tariffs")
        assert r.status_code == 200
        tariffs = r.json()
        assert isinstance(tariffs, list) and len(tariffs) >= 3

    def test_track_active_order(self):
        r = requests.get(f"{API}/public/track/{E2E_KODE}")
        assert r.status_code == 200
        data = r.json()
        assert data["kode"] == E2E_KODE
        # Masked name
        assert "***" in data["nama"] or len(data["nama"].split()) <= 1

    def test_track_legacy_completed(self):
        r = requests.get(f"{API}/public/track/{LEGACY_COMPLETED_KODE}")
        assert r.status_code == 200
        assert r.json()["status"] in ("completed", "returned", "active")

    def test_track_legacy_sac(self):
        r = requests.get(f"{API}/public/track/{LEGACY_KODE_LOWER}")
        assert r.status_code == 200
        assert r.json()["kode"] == LEGACY_KODE_LOWER

    def test_track_not_found(self):
        r = requests.get(f"{API}/public/track/CLM-00000000-XXXX")
        assert r.status_code == 404

    def test_access_wrong_kontak(self):
        r = requests.post(f"{API}/public/access", json={"kode": E2E_KODE, "kontak": "0000000"})
        assert r.status_code == 403

    def test_access_correct_kontak_active_order(self):
        r = requests.post(f"{API}/public/access", json={"kode": E2E_KODE, "kontak": E2E_KONTAK})
        assert r.status_code == 200
        data = r.json()
        assert data["kode"] == E2E_KODE
        assert data["status"] == "active"
        inv = data.get("invoice")
        assert inv
        assert inv["status"] == "verified"
        assert inv["total"] == E2E_INVOICE_TOTAL, f"expected {E2E_INVOICE_TOTAL} got {inv['total']}"
        # region contains Tangsel/Tangerang Selatan
        rekening = (inv.get("rekening") or "") + " " + (inv.get("region") or "")
        assert "Tangerang Selatan" in rekening or "tangsel" in rekening.lower()
        # status_history multiple entries
        assert len(data.get("status_history", [])) >= 8
        # contract signed
        contract = data.get("contract") or {}
        assert contract.get("status") == "signed"

    def test_public_slots_valid_date(self):
        r = requests.get(f"{API}/public/slots", params={"tanggal": "2027-01-15"})
        assert r.status_code == 200
        data = r.json()
        assert data["tanggal"] == "2027-01-15"
        slots = data["slots"]
        assert isinstance(slots, list) and len(slots) == 4
        expected_times = {"08:00", "10:00", "13:00", "15:00"}
        got_times = {s["jam"] for s in slots}
        assert got_times == expected_times
        for s in slots:
            assert "tersedia" in s and isinstance(s["tersedia"], bool)

    def test_public_slots_invalid_date(self):
        r = requests.get(f"{API}/public/slots", params={"tanggal": "not-a-date"})
        assert r.status_code == 400

    def test_public_slots_past_date_rejected(self):
        r = requests.get(f"{API}/public/slots", params={"tanggal": "2020-01-01"})
        assert r.status_code == 400


# ---------------- Rental submission validation (no submit-success to conserve rate limit) ----------------

class TestRentalValidation:
    @pytest.fixture(scope="class")
    def tariff_id(self):
        tariffs = requests.get(f"{API}/public/tariffs").json()
        assert tariffs, "No tariffs seeded"
        return tariffs[0]["id"]

    def _valid_payload(self, tariff_id):
        return {
            "nama": "Test Regression",
            "email": "TEST_regression@example.com",
            "no_hp": "081200011122",
            "alamat_ktp": "Jl. KTP Test No. 1, Jakarta",
            "alamat_pemasangan": "Jl. Pemasangan Test No. 2, Jakarta Selatan",
            "status_hunian": "Rumah",
            "jenis_ruangan": "Kamar",
            "tanggal_mulai": "2026-12-01",
            "durasi_sewa": 3,
            "catatan": "test",
            "nama_pj_lokasi": "Pak RT Test",
            "no_hp_pj_lokasi": "081222233344",
            "data_consent": True,
            "items": [{"tariff_id": tariff_id, "quantity": 1}],
        }

    def _submit(self, payload):
        with open(KTP_IMAGE, "rb") as f:
            content = f.read()
        return requests.post(
            f"{API}/public/rentals",
            data={"payload": json.dumps(payload)},
            files={"ktp": ("ktp.png", content, "image/png")},
        )

    def test_reject_invalid_durasi(self, tariff_id):
        p = self._valid_payload(tariff_id)
        p["durasi_sewa"] = 5
        r = self._submit(p)
        assert r.status_code == 422

    def test_reject_no_consent(self, tariff_id):
        p = self._valid_payload(tariff_id)
        p["data_consent"] = False
        r = self._submit(p)
        assert r.status_code == 422

    def test_reject_past_date(self, tariff_id):
        p = self._valid_payload(tariff_id)
        p["tanggal_mulai"] = "2020-01-01"
        r = self._submit(p)
        assert r.status_code == 422

    def test_reject_invalid_hunian(self, tariff_id):
        p = self._valid_payload(tariff_id)
        p["status_hunian"] = "Apartemen"
        r = self._submit(p)
        assert r.status_code == 422


# ---------------- Admin RBAC + core endpoints ----------------

class TestAdminAccess:
    def test_no_auth_admin(self):
        assert requests.get(f"{API}/admin/stats").status_code == 401

    def test_technician_forbidden_on_admin(self, tech_session):
        assert tech_session.get(f"{API}/admin/stats").status_code == 403

    def test_courier_forbidden_on_admin(self, courier_session):
        assert courier_session.get(f"{API}/admin/stats").status_code == 403

    def test_admin_stats_ok(self, admin_session):
        r = admin_session.get(f"{API}/admin/stats")
        assert r.status_code == 200
        for k in ["pending", "active", "units_ready", "units_total", "revenue"]:
            assert k in r.json()

    def test_admin_reports(self, admin_session):
        r = admin_session.get(f"{API}/admin/reports")
        assert r.status_code == 200
        d = r.json()
        assert "status_distribution" in d and "revenue_by_month" in d

    def test_admin_technicians(self, admin_session):
        r = admin_session.get(f"{API}/admin/technicians")
        assert r.status_code == 200
        techs = r.json()
        assert any(t["email"] == TECH_EMAIL for t in techs)

    def test_admin_couriers(self, admin_session):
        r = admin_session.get(f"{API}/admin/couriers")
        assert r.status_code == 200
        cs = r.json()
        assert any(c["email"] == COURIER_EMAIL for c in cs)

    def test_admin_units(self, admin_session):
        r = admin_session.get(f"{API}/admin/units")
        assert r.status_code == 200
        units = r.json()
        assert all("variant" in u for u in units)

    def test_admin_tariffs_variants(self, admin_session):
        r = admin_session.get(f"{API}/admin/tariffs")
        assert r.status_code == 200
        tariffs = [t for t in r.json() if t.get("aktif")]
        rate_map = {(t["kapasitas"], t.get("variant", "Standart")): t["harga_per_bulan"] for t in tariffs}
        for kap, variant, expected in [
            ("0.5 PK", "Standart", 198000),
            ("1 PK", "Standart", 248000),
            ("0.5 PK", "Inverter", 248000),
        ]:
            assert rate_map.get((kap, variant)) == expected, f"{kap} {variant} rate mismatch: {rate_map}"


class TestAdminOperations:
    @pytest.mark.parametrize("endpoint", [
        "deliveries", "installations", "maintenances", "returns",
        "schedules", "payments", "orders", "customers", "billings", "notifications",
    ])
    def test_list_endpoint(self, admin_session, endpoint):
        r = admin_session.get(f"{API}/admin/{endpoint}")
        assert r.status_code == 200, f"{endpoint}: {r.text[:200]}"
        assert isinstance(r.json(), list)


# ---------------- Billings & Notifications (v3) ----------------

class TestBillingsAndNotifications:
    def test_e2e_order_has_scheduled_monthly_billings(self, admin_session):
        r = admin_session.get(f"{API}/admin/billings", params={"status": "scheduled"})
        assert r.status_code == 200
        billings = r.json()
        # Find billings for our order (need order_id → resolve via order)
        # Fetch orders to find our E2E order id
        orders = admin_session.get(f"{API}/admin/orders").json()
        e2e = next((o for o in orders if o["kode"] == E2E_KODE), None)
        assert e2e, f"E2E order {E2E_KODE} not found in admin orders"
        assert e2e["status"] == "active", f"expected active got {e2e['status']}"
        my_bills = [b for b in billings if b["order_id"] == e2e["id"]]
        assert len(my_bills) == 5, f"expected 5 scheduled billings, got {len(my_bills)}"
        for b in my_bills:
            assert b["jenis"] == "monthly"
            assert b["status"] == "scheduled"
            assert "bill_date" in b and "due_date" in b

    def test_notifications_recorded(self, admin_session):
        r = admin_session.get(f"{API}/admin/notifications")
        assert r.status_code == 200
        notifs = r.json()
        assert isinstance(notifs, list)
        # Every notification must have a channel and event
        for n in notifs[:20]:
            assert "channel" in n
            assert "event" in n or "template" in n or "message" in n or "body" in n

    def test_notifications_filter_by_channel(self, admin_session):
        r = admin_session.get(f"{API}/admin/notifications", params={"channel": "whatsapp"})
        assert r.status_code == 200
        for n in r.json():
            assert n.get("channel") == "whatsapp"


# ---------------- Schedule role-mismatch guard ----------------

class TestScheduleRoleGuard:
    def test_delivery_to_technician_rejected(self, admin_session):
        # Grab technician user id and any order in state where scheduling would normally be validated later
        techs = admin_session.get(f"{API}/admin/technicians").json()
        assert techs, "No technician seeded"
        tech_id = techs[0]["id"]
        # Use E2E order (active status), delivery to technician should be rejected either by role or by status.
        orders = admin_session.get(f"{API}/admin/orders").json()
        e2e = next((o for o in orders if o["kode"] == E2E_KODE), None)
        assert e2e
        body = {
            "technician_id": tech_id,
            "tanggal": "2027-02-01",
            "jam": "10:00",
            "jenis_kegiatan": "delivery",
            "catatan": "TEST role guard",
        }
        r = admin_session.post(f"{API}/admin/orders/{e2e['id']}/schedules", json=body)
        assert r.status_code == 400
        detail = r.json().get("detail", "").lower()
        # Must indicate role mismatch (delivery must be assigned to courier)
        assert "courier" in detail or "role" in detail or "petugas" in detail


# ---------------- Courier RBAC ----------------

class TestCourierRBAC:
    def test_courier_can_list_own_schedules(self, courier_session):
        r = courier_session.get(f"{API}/courier/schedules")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_courier_forbidden_on_tech(self, courier_session):
        # /api/tech endpoints — try a couple known ones
        r = courier_session.get(f"{API}/tech/schedules")
        assert r.status_code == 403

    def test_technician_forbidden_on_courier(self, tech_session):
        r = tech_session.get(f"{API}/courier/schedules")
        assert r.status_code == 403

    def test_no_auth_on_courier(self):
        assert requests.get(f"{API}/courier/schedules").status_code == 401


# ---------------- Cron endpoint ----------------

class TestCronBilling:
    def test_cron_no_auth_401(self):
        r = requests.post(f"{API}/cron/billing", json={"run_id": "TEST_noauth"})
        assert r.status_code == 401

    def test_cron_wrong_secret_401(self):
        r = requests.post(
            f"{API}/cron/billing",
            json={"run_id": "TEST_wrong"},
            headers={"Authorization": "Bearer WRONG_SECRET"},
        )
        assert r.status_code == 401

    def test_cron_valid_secret_ok_and_idempotent(self):
        assert CRON_SECRET, "WEBHOOK_CRON_SECRET missing from /app/backend/.env"
        run_id = "TEST_cron_regression_2026"
        headers = {"Authorization": f"Bearer {CRON_SECRET}"}
        r1 = requests.post(f"{API}/cron/billing", json={"run_id": run_id}, headers=headers)
        assert r1.status_code == 200, r1.text
        d1 = r1.json()
        assert d1.get("ok")
        # Second call with same run_id → deduplicated
        r2 = requests.post(f"{API}/cron/billing", json={"run_id": run_id}, headers=headers)
        assert r2.status_code == 200
        d2 = r2.json()
        assert d2.get("ok")
        assert d2.get("deduplicated"), d2


# ---------------- Settings persistence ----------------

# ---------------- v4: Wilayah cascading proxy ----------------

class TestWilayahCascading:
    def test_provinsi_list(self):
        r = requests.get(f"{API}/public/wilayah/provinsi")
        assert r.status_code == 200
        provs = r.json()
        assert isinstance(provs, list) and len(provs) >= 30
        assert all("id" in p and "name" in p for p in provs[:5])

    def test_kota_by_provinsi(self):
        # 32 = Jawa Barat
        r = requests.get(f"{API}/public/wilayah/kota/32")
        assert r.status_code == 200
        kota = r.json()
        assert isinstance(kota, list) and len(kota) >= 10
        # Kota list must contain valid entries (name may vary format)
        assert all("name" in k and "id" in k for k in kota[:5])

    def test_kecamatan_by_kota(self):
        r = requests.get(f"{API}/public/wilayah/kecamatan/3271")
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ---------------- v4: Contract download DOCX + access guard ----------------

class TestContractDownload:
    def test_contract_download_ok(self):
        r = requests.get(
            f"{API}/public/contract/download",
            params={"kode": E2E_KODE, "kontak": E2E_KONTAK},
        )
        assert r.status_code == 200
        assert "officedocument.wordprocessingml.document" in r.headers.get("content-type", "")
        assert len(r.content) > 5000  # DOCX file has meaningful size
        assert r.headers.get("content-disposition", "").endswith(f'"Kontrak-{E2E_KODE}.docx"')

    def test_contract_download_wrong_kontak_403(self):
        r = requests.get(
            f"{API}/public/contract/download",
            params={"kode": E2E_KODE, "kontak": "0000000"},
        )
        assert r.status_code == 403


# ---------------- v4: Extension (open-ended) ----------------

class TestExtension:
    def test_extend_already_open_ended_rejected(self):
        # 8U8U is already open_ended → should 400
        r = requests.post(
            f"{API}/public/extend",
            json={"kode": E2E_KODE, "kontak": E2E_KONTAK, "lanjut": True},
        )
        assert r.status_code == 400
        assert "sudah dikonfirmasi" in r.json().get("detail", "").lower()

    def test_extend_wrong_contact_forbidden(self):
        r = requests.post(
            f"{API}/public/extend",
            json={"kode": E2E_KODE, "kontak": "0000000", "lanjut": True},
        )
        assert r.status_code == 403


# ---------------- v4: Public schedule-request guards ----------------

class TestScheduleRequestGuards:
    def test_delivery_on_active_order_rejected(self):
        # AIQX is 'active' — should not allow new delivery request via public flow
        r = requests.post(
            f"{API}/public/schedule-request",
            json={
                "kode": "CLM-20260817-AIQX",
                "kontak": "083122334455",
                "tanggal": "2027-05-01",
                "jenis": "delivery",
            },
        )
        assert r.status_code == 400
        assert "active" in r.json().get("detail", "").lower() or "pengajuan" in r.json().get("detail", "").lower()


# ---------------- v4: Admin cannot re-schedule delivery when delivery already done ----------------

class TestScheduleDeliveryDoneGuard:
    def test_re_schedule_delivery_after_done_rejected(self, admin_session):
        orders = admin_session.get(f"{API}/admin/orders").json()
        aiqx = next((o for o in orders if o["kode"] == "CLM-20260817-AIQX"), None)
        assert aiqx, "Order AIQX not found"
        couriers = admin_session.get(f"{API}/admin/couriers").json()
        assert couriers, "No courier seeded"
        cid = couriers[0]["id"]
        body = {
            "technician_id": cid,
            "tanggal": "2027-06-01",
            "jam": "10:00",
            "jenis_kegiatan": "delivery",
            "catatan": "TEST re-schedule after done",
        }
        r = admin_session.post(f"{API}/admin/orders/{aiqx['id']}/schedules", json=body)
        assert r.status_code == 400
        detail = r.json().get("detail", "").lower()
        assert "telah selesai" in detail or "selesai dilakukan" in detail, detail


# ---------------- v4: Rental payload requires new alamat fields ----------------

class TestRentalV4Payload:
    @pytest.fixture(scope="class")
    def tariff_id(self):
        return requests.get(f"{API}/public/tariffs").json()[0]["id"]

    def test_reject_missing_provinsi(self, tariff_id):
        payload = {
            "nama": "Test V4",
            "email": "TEST_v4@example.com",
            "no_hp": "081200011122",
            "alamat_ktp": "Jl. KTP No. 1, Jakarta",
            # provinsi missing
            "kota_kab": "Kota Bogor",
            "kecamatan": "Bogor Tengah",
            "kelurahan": "Paledang",
            "detail_alamat": "RT 01 RW 02 No. 5",
            "status_hunian": "Rumah",
            "jenis_ruangan": "Kamar",
            "tanggal_mulai": "2026-12-01",
            "durasi_sewa": 3,
            "nama_pj_lokasi": "Pak RT",
            "no_hp_pj_lokasi": "081222233344",
            "data_consent": True,
            "items": [{"tariff_id": tariff_id, "quantity": 1}],
        }
        with open(KTP_IMAGE, "rb") as f:
            r = requests.post(
                f"{API}/public/rentals",
                data={"payload": json.dumps(payload)},
                files={"ktp": ("ktp.png", f.read(), "image/png")},
            )
        assert r.status_code == 422


class TestSettings:
    def test_get_accounts(self, admin_session):
        r = admin_session.get(f"{API}/admin/settings/bank-accounts")
        assert r.status_code == 200
        data = r.json()
        assert "accounts" in data and "regions" in data

    def test_update_accounts_persists(self, admin_session):
        original = admin_session.get(f"{API}/admin/settings/bank-accounts").json()["accounts"]
        payload = dict(original)
        # Pick any existing key
        key = next(iter(payload.keys()))
        marker = "BCA 9999999999 a.n. TEST_Regression"
        prev = payload[key]
        payload[key] = marker
        assert admin_session.put(f"{API}/admin/settings/bank-accounts", json={"accounts": payload}).status_code == 200
        got = admin_session.get(f"{API}/admin/settings/bank-accounts").json()["accounts"]
        assert got[key] == marker
        payload[key] = prev
        admin_session.put(f"{API}/admin/settings/bank-accounts", json={"accounts": payload})
