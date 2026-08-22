from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import logging
from datetime import datetime, timezone

from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware

from core import db, hash_password, now_iso, new_id, DEFAULT_BANK_ACCOUNTS
from storage import init_storage
from routes_auth import router as auth_router
from routes_public import router as public_router
from routes_admin import router as admin_router
from routes_tech import router as tech_router
from routes_courier import router as courier_router
from routes_cron import router as cron_router

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(title="Sistem Informasi Penyewaan AC CollerMind")

app.include_router(auth_router)
app.include_router(public_router)
app.include_router(admin_router)
app.include_router(tech_router)
app.include_router(courier_router)
app.include_router(cron_router)

origins = [o for o in [os.environ.get("FRONTEND_URL"), "http://localhost:3000"] if o]
extra = [o.strip() for o in os.environ.get("CORS_ORIGINS", "").split(",") if o.strip() and o.strip() != "*"]
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=origins + extra,
    allow_methods=["*"],
    allow_headers=["*"],
)


async def seed_users() -> None:
    admin_email = os.environ.get("ADMIN_EMAIL")
    admin_password = os.environ.get("ADMIN_PASSWORD")
    if admin_email and admin_password:
        existing = await db.users.find_one({"email": admin_email})
        if not existing:
            await db.users.insert_one({
                "id": new_id(), "name": "Admin CollerMind", "email": admin_email, "role": "admin",
                "password_hash": hash_password(admin_password), "created_at": now_iso(),
            })
            logger.info("Admin seeded: %s", admin_email)
    tech_email = "teknisi@sewaac.id"
    if not await db.users.find_one({"email": tech_email}):
        await db.users.insert_one({
            "id": new_id(), "name": "Budi Teknisi", "email": tech_email, "role": "technician",
            "password_hash": hash_password("teknisi123"), "created_at": now_iso(),
        })
        logger.info("Technician seeded")
    courier_email = "kurir@sewaac.id"
    if not await db.users.find_one({"email": courier_email}):
        await db.users.insert_one({
            "id": new_id(), "name": "Andi Kurir", "email": courier_email, "role": "courier",
            "password_hash": hash_password("kurir123"), "created_at": now_iso(),
        })
        logger.info("Courier seeded")


COLLERMIND_TARIFFS = [
    {"nama": "0.5 PK Standart", "tipe": "Split", "kapasitas": "0.5 PK", "variant": "Standart", "harga_per_bulan": 198000},
    {"nama": "1 PK Standart", "tipe": "Split", "kapasitas": "1 PK", "variant": "Standart", "harga_per_bulan": 248000},
    {"nama": "0.5 PK Inverter", "tipe": "Split", "kapasitas": "0.5 PK", "variant": "Inverter", "harga_per_bulan": 248000},
]


async def seed_master_data() -> None:
    # Tarif Collermind: nonaktifkan yang bukan produk resmi, seed yang belum ada
    await db.tariffs.update_many(
        {"nama": {"$nin": [t["nama"] for t in COLLERMIND_TARIFFS]}},
        {"$set": {"aktif": False, "updated_at": now_iso()}},
    )
    for t in COLLERMIND_TARIFFS:
        existing = await db.tariffs.find_one({"nama": t["nama"]})
        if existing:
            await db.tariffs.update_one({"id": existing["id"]}, {"$set": {**t, "aktif": True, "updated_at": now_iso()}})
        else:
            await db.tariffs.insert_one({"id": new_id(), **t, "aktif": True, "created_at": now_iso(), "updated_at": now_iso()})

    # Backfill variant pada unit lama
    await db.air_conditioners.update_many({"variant": {"$exists": False}}, {"$set": {"variant": "Standart"}})

    # Pastikan ada minimal 2 unit ready per produk tarif
    seed_units = {
        ("0.5 PK", "Standart"): [("AC-101", "Daikin", 2023), ("AC-102", "Panasonic", 2023)],
        ("0.5 PK", "Inverter"): [("AC-201", "LG", 2024), ("AC-202", "Samsung", 2024)],
        ("1 PK", "Standart"): [("AC-103", "Daikin", 2024), ("AC-104", "Gree", 2024)],
    }
    for (kap, var), units in seed_units.items():
        ready = await db.air_conditioners.count_documents({"kapasitas": kap, "variant": var, "status": "ready", "deleted_at": None})
        if ready < 2:
            for kode, merk, tahun in units:
                if not await db.air_conditioners.find_one({"kode_unit": kode}):
                    await db.air_conditioners.insert_one({
                        "id": new_id(), "kode_unit": kode, "merk": merk, "kapasitas": kap,
                        "tipe": "Split", "variant": var, "status": "ready", "tahun": tahun,
                        "harga_sewa_bulanan": None, "created_at": now_iso(), "updated_at": now_iso(), "deleted_at": None,
                    })
    if await db.air_conditioners.count_documents({}) == 0:
        logger.info("Units seeded")

    # Default rekening per daerah
    if not await db.settings.find_one({"key": "bank_accounts"}):
        await db.settings.insert_one({"key": "bank_accounts", "accounts": DEFAULT_BANK_ACCOUNTS, "updated_at": now_iso()})
        logger.info("Bank accounts seeded")


@app.on_event("startup")
async def startup() -> None:
    try:
        init_storage()
        logger.info("Object storage initialized")
    except Exception as e:
        logger.error("Storage init failed: %s", e)
    await db.users.create_index("email", unique=True)
    await db.rental_orders.create_index("kode", unique=True)
    await db.rental_orders.create_index("status")
    await db.customers.create_index("email")
    await db.login_attempts.create_index("identifier")
    await db.invoices.create_index([("order_id", 1), ("jenis", 1), ("periode", 1)])
    await db.payments.create_index("invoice_id")
    await db.contracts.create_index("order_id", unique=True)
    await seed_users()
    await seed_master_data()


@app.on_event("shutdown")
async def shutdown_db_client() -> None:
    from core import client
    client.close()
