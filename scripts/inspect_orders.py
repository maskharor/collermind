import os
import requests
from dotenv import dotenv_values

fe = dotenv_values("/app/frontend/.env")
be = dotenv_values("/app/backend/.env")
API = fe["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"
s = requests.Session()
r = s.post(f"{API}/auth/login", json={"email": be.get("TEST_ADMIN_EMAIL"), "password": be.get("TEST_ADMIN_PASSWORD")})
print("login", r.status_code, list(r.json().keys()) if r.status_code == 200 else r.text[:200])
s.headers.update({"Authorization": f"Bearer {r.json()['access_token']}"})
orders = s.get(f"{API}/admin/orders").json()
print("type", type(orders), "count", len(orders))
for o in orders[:8]:
    print(o.get("kode"), o.get("status"), repr(o.get("customer_nama")), o.get("contract_status"))
