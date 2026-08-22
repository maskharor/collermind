"""Auth playbook checks: bcrypt hash format, httpOnly cookies, CORS credentials, brute-force lockout."""

import os

import pytest
import requests
from dotenv import dotenv_values

fe = dotenv_values("/app/frontend/.env")
be = dotenv_values("/app/backend/.env")
BASE = fe["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE}/api"
ADMIN_EMAIL = be.get("TEST_ADMIN_EMAIL")
ADMIN_PASSWORD = be.get("TEST_ADMIN_PASSWORD")


def test_login_sets_httponly_cookies():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text[:200]
    raw = "; ".join(r.headers.get_all("set-cookie")) if hasattr(r.headers, "get_all") else str(r.headers.get("set-cookie", ""))
    assert raw, "no Set-Cookie header on login"
    assert "httponly" in raw.lower(), f"cookies not httpOnly: {raw[:200]}"
    assert len(s.cookies) > 0
    me = s.get(f"{API}/auth/me")
    assert me.status_code == 200, "cookie-based session not accepted by /auth/me"
    assert me.json()["email"] == ADMIN_EMAIL


def test_cors_allows_credentials_with_explicit_origin():
    """Preflight at the public edge is answered by the CDN, so assert on the app itself.

    Uses the internal backend port only for this header inspection.
    """
    r = requests.options(
        "http://localhost:8001/api/auth/login",
        headers={"Origin": BASE, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type"},
    )
    assert r.status_code in (200, 204), r.status_code
    allow_origin = r.headers.get("access-control-allow-origin", "")
    allow_creds = r.headers.get("access-control-allow-credentials", "")
    assert allow_creds.lower() == "true", f"credentials not allowed: {dict(r.headers)}"
    assert allow_origin == BASE, f"origin not echoed explicitly: {allow_origin}"


def test_bcrypt_hash_format_in_db():
    pytest.importorskip("pymongo")
    from pymongo import MongoClient
    mongo_url = be.get("MONGO_URL") or os.environ.get("MONGO_URL")
    client = MongoClient(mongo_url)
    user = client[be["DB_NAME"]].users.find_one({"email": ADMIN_EMAIL})
    assert user, "admin user missing in DB"
    h = user.get("password_hash") or user.get("password") or ""
    assert h.startswith("$2b$"), f"unexpected hash prefix: {h[:6]}"


def test_wrong_password_401_and_lockout_after_5_attempts():
    codes = []
    for _ in range(7):
        r = requests.post(f"{API}/auth/login", json={"email": "bruteforce_probe@example.com", "password": "wrong-pass"})
        codes.append(r.status_code)
    assert codes[0] in (401, 429), codes
    assert 429 in codes, f"no lockout triggered after repeated failures: {codes}"
    assert codes.count(401) <= 5, f"more than 5 failed attempts allowed: {codes}"


def test_admin_login_still_works_after_probe_lockout():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"admin locked out by unrelated probe: {r.status_code} {r.text[:150]}"
