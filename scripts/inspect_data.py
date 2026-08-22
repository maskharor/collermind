import asyncio
import os
import sys
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
sys.path.insert(0, "/app/backend")
from core import db  # noqa


async def m():
    for k in ["CLM-20260817-8U8U", "CLM-20260817-AIQX"]:
        o = await db.rental_orders.find_one({"kode": k}, {"_id": 0, "id": 1, "status": 1, "contract_status": 1, "customer_id": 1, "payment_status": 1})
        print(k, o)
        if o:
            c = await db.customers.find_one({"id": o["customer_id"]}, {"_id": 0, "nama": 1, "nik": 1, "kota_kab": 1, "no_hp": 1})
            print("  cust", c)
            inv = await db.invoices.find({"order_id": o["id"]}, {"_id": 0, "id": 1, "jenis": 1, "status": 1, "nomor": 1}).to_list(10)
            print("  inv", inv)
    print("pending orders", await db.rental_orders.count_documents({"status": "pending"}))
    for st in ("pending", "verified", "delivered", "active"):
        rows = await db.rental_orders.find({"status": st}, {"_id": 0, "kode": 1, "contract_status": 1}).to_list(5)
        print(st, rows)


asyncio.run(m())
