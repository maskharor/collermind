import os
import requests
from dotenv import dotenv_values

fe = dotenv_values("/app/frontend/.env")
be = dotenv_values("/app/backend/.env")
API = fe["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"
s = requests.Session()
r = s.post(f"{API}/auth/login", json={"email": be.get("TEST_ADMIN_EMAIL"), "password": be.get("TEST_ADMIN_PASSWORD")})
s.headers.update({"Authorization": f"Bearer {r.json()['access_token']}"})
notifs = s.get(f"{API}/admin/notifications").json()
notifs = notifs if isinstance(notifs, list) else notifs.get("items", [])
print("total notifications:", len(notifs))
created = [n for n in notifs if n.get("event") == "order_created"][:3]
for n in created:
    print("---", n.get("kode"), n.get("channel"), n.get("status"), n.get("event"))
    body = str(n.get("body") or n.get("message") or n.get("isi") or "")
    print("has 'Langkah selanjutnya':", "Langkah selanjutnya" in body)
    print("keys:", list(n.keys()))
    print(body[:400].replace("\n", " | "))
