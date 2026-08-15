import os
import math
import uuid
import secrets
import string
import bcrypt
import jwt
from datetime import datetime, timezone, timedelta
from fastapi import HTTPException, Request, Depends
from motor.motor_asyncio import AsyncIOMotorClient

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

JWT_ALGORITHM = "HS256"

ORDER_STATUSES = [
    "pending", "verified", "rejected", "scheduled", "delivered",
    "installed", "active", "maintenance", "returned", "completed",
]

UNIT_STATUSES = ["ready", "reserved", "rented", "maintenance", "damaged"]

JENIS_KEGIATAN = ["delivery", "inspection", "installation", "maintenance", "dismantling", "return"]

# Business rules Collermind
JASA_PASANG = 350000
JASA_LEPAS = 300000
EXTRA_PIPE_RATE = 130000
FREE_PIPE_METER = 3
DURASI_OPTIONS = [3, 6, 12, 24]
STATUS_HUNIAN_OPTIONS = ["Kos", "Kontrakan", "Rumah", "Ruko", "Kantor"]
JENIS_RUANGAN_OPTIONS = ["Kamar", "Ruang Tamu", "Ruang Kantor", "Ruang Usaha", "Lainnya"]
VARIANTS = ["Standart", "Inverter"]

REGION_KEYWORDS = [
    (["tangerang selatan", "tangsel", "bsd", "bintaro"], "kotangsel", "Kota Tangerang Selatan"),
    (["tangerang"], "kotangerang", "Kota Tangerang"),
    (["depok"], "depok", "Kota Depok"),
    (["kota bogor"], "kotabogor", "Kota Bogor"),
    (["bogor"], "kabogor", "Kabupaten Bogor"),
    (["kota bekasi"], "kotabekasi", "Kota Bekasi"),
    (["bekasi"], "kabekasi", "Kabupaten Bekasi"),
    (["jakarta pusat", "jakpus", "gambir", "menteng", "tanah abang"], "jakpus", "Jakarta Pusat"),
    (["jakarta timur", "jaktim", "cakung", "duren sawit", "jatinegara"], "jaktim", "Jakarta Timur"),
    (["jakarta selatan", "jaksel", "kebayoran", "tebet", "pondok indah"], "jaksel", "Jakarta Selatan"),
    (["jakarta utara", "jakut", "kelapa gading", "tanjung priok"], "jakut", "Jakarta Utara"),
    (["jakarta barat", "jakbar", "cengkareng", "grogol", "kalideres"], "jakbar", "Jakarta Barat"),
]

DEFAULT_BANK_ACCOUNTS = {
    "default": "BCA 1234567890 a.n. CollerMind",
    "kabogor": "BCA 1234567890 a.n. CollerMind (Kab. Bogor)",
    "kotabogor": "BCA 1234567890 a.n. CollerMind (Kota Bogor)",
    "kotangerang": "BCA 1234567890 a.n. CollerMind (Kota Tangerang)",
    "kotangsel": "BCA 1234567890 a.n. CollerMind (Tangerang Selatan)",
    "depok": "BCA 1234567890 a.n. CollerMind (Depok)",
    "jakpus": "BCA 1234567890 a.n. CollerMind (Jakarta Pusat)",
    "jaktim": "BCA 1234567890 a.n. CollerMind (Jakarta Timur)",
    "jaksel": "BCA 1234567890 a.n. CollerMind (Jakarta Selatan)",
    "jakut": "BCA 1234567890 a.n. CollerMind (Jakarta Utara)",
    "jakbar": "BCA 1234567890 a.n. CollerMind (Jakarta Barat)",
    "kabekasi": "BCA 1234567890 a.n. CollerMind (Kab. Bekasi)",
    "kotabekasi": "BCA 1234567890 a.n. CollerMind (Kota Bekasi)",
}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id() -> str:
    return str(uuid.uuid4())


def rupiah(n) -> str:
    return "Rp" + f"{int(n or 0):,}".replace(",", ".")


def gen_kode() -> str:
    suffix = "".join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(4))
    return f"CLM-{datetime.now(timezone.utc):%Y%m%d}-{suffix}"


def detect_region(alamat: str):
    text = (alamat or "").lower()
    for keywords, key, label in REGION_KEYWORDS:
        if any(k in text for k in keywords):
            return key, label
    return "default", "Jabodetabek"


def hitung_extra_pipa(total_pipa: float):
    extra_meter = max(0, math.ceil((total_pipa or 0) - FREE_PIPE_METER))
    return extra_meter, extra_meter * EXTRA_PIPE_RATE


def sewa_bulanan(order: dict) -> float:
    return sum(d.get("harga", 0) * d.get("quantity", 0) for d in order.get("details", []))


async def get_bank_accounts() -> dict:
    doc = await db.settings.find_one({"key": "bank_accounts"}, {"_id": 0})
    if doc:
        merged = {**DEFAULT_BANK_ACCOUNTS, **doc.get("accounts", {})}
        return merged
    return dict(DEFAULT_BANK_ACCOUNTS)


async def create_invoice_for_order(order: dict, customer: dict, total_pipa: float):
    extra_meter, extra_cost = hitung_extra_pipa(total_pipa)
    sewa1 = sewa_bulanan(order)
    items = [
        {"label": "Sewa bulan pertama", "amount": sewa1},
        {"label": "Jasa Pasang", "amount": JASA_PASANG},
        {"label": "Jasa Lepas", "amount": JASA_LEPAS},
    ]
    if extra_cost > 0:
        items.append({"label": f"Extra pipa {extra_meter} m × {rupiah(EXTRA_PIPE_RATE)}", "amount": extra_cost})
    total = sum(i["amount"] for i in items)
    region_key, region_label = detect_region(customer.get("alamat_pemasangan", ""))
    accounts = await get_bank_accounts()
    rekening = accounts.get(region_key) or accounts["default"]

    existing = await db.invoices.find_one({"order_id": order["id"]})
    if existing:
        return existing

    invoice = {
        "id": new_id(),
        "nomor": f"INV-{order['kode']}",
        "order_id": order["id"],
        "kode": order["kode"],
        "items": items,
        "total": total,
        "total_pipa_meter": total_pipa,
        "extra_pipa_meter": extra_meter,
        "biaya_extra_pipa": extra_cost,
        "status": "issued",
        "rekening": rekening,
        "region": region_label,
        "issued_at": now_iso(),
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.invoices.insert_one(invoice)
    invoice.pop("_id", None)
    return invoice


def build_contract_content(order: dict, customer: dict) -> dict:
    lines = [f"{d['nama']} × {d['quantity']} unit @ {rupiah(d['harga'])}/bulan" for d in order.get("details", [])]
    return {
        "nomor": f"KTR-{order['kode']}",
        "pihak_pertama": "CollerMind (Penyedia Layanan Sewa AC)",
        "pihak_kedua": customer.get("nama", ""),
        "kontak": f"{customer.get('no_hp', '')} / {customer.get('email', '')}",
        "alamat_pemasangan": customer.get("alamat_pemasangan", ""),
        "items": lines,
        "durasi": f"{order.get('durasi_sewa')} bulan",
        "tanggal_mulai": order.get("tanggal_mulai", ""),
        "sewa_bulanan": rupiah(sewa_bulanan(order)),
        "terms": [
            "Sewa dibayar bulanan; tagihan pertama (sewa bulan pertama + jasa pasang + jasa lepas + extra pipa bila ada) dibayar setelah instalasi selesai dan invoice diterbitkan.",
            "Fasilitas standar termasuk: pipa 3 meter, kabel 3 meter, ducttape & lem, stop kontak, vakum AC, cuci AC gratis tiap 4 bulan, perbaikan/sparepart, free ongkir Jabodetabek.",
            "Kelebihan pipa di atas 3 meter dikenakan biaya Rp130.000/meter berdasarkan pengukuran teknisi saat instalasi.",
            "Penyewa wajib menjaga unit; kerusakan akibat kelalaian dikenakan denda sesuai penilaian teknisi saat pengembalian.",
            "Jadwal pemasangan ditentukan berdasarkan kesepakatan dan ketersediaan teknisi.",
            "Data pribadi penyewa hanya digunakan untuk keperluan layanan sewa AC CollerMind.",
        ],
    }


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(hours=12),
        "type": "access",
    }
    return jwt.encode(payload, os.environ["JWT_SECRET"], algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
        "type": "refresh",
    }
    return jwt.encode(payload, os.environ["JWT_SECRET"], algorithm=JWT_ALGORITHM)


def set_auth_cookies(response, access_token: str, refresh_token: str):
    response.set_cookie("access_token", access_token, httponly=True, secure=True, samesite="none", max_age=43200, path="/")
    response.set_cookie("refresh_token", refresh_token, httponly=True, secure=True, samesite="none", max_age=604800, path="/")


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        h = request.headers.get("Authorization", "")
        if h.startswith("Bearer "):
            token = h[7:]
    if not token:
        token = request.query_params.get("auth")
    if not token:
        raise HTTPException(status_code=401, detail="Belum terautentikasi")
    try:
        payload = jwt.decode(token, os.environ["JWT_SECRET"], algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Token tidak valid")
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token kedaluwarsa")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token tidak valid")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User tidak ditemukan")
    return user


def require_role(*roles):
    async def dep(user: dict = Depends(get_current_user)):
        if user["role"] not in roles:
            raise HTTPException(status_code=403, detail="Akses ditolak")
        return user
    return dep


async def set_order_status(order_id: str, new_status: str, by: str, catatan: str = ""):
    entry = {"status": new_status, "at": now_iso(), "by": by, "catatan": catatan}
    await db.rental_orders.update_one(
        {"id": order_id},
        {"$set": {"status": new_status, "updated_at": now_iso()}, "$push": {"status_history": entry}},
    )


async def set_units_status(unit_ids, status: str):
    if unit_ids:
        await db.air_conditioners.update_many(
            {"id": {"$in": unit_ids}},
            {"$set": {"status": status, "updated_at": now_iso()}},
        )


def order_unit_ids(order: dict):
    ids = []
    for d in order.get("details", []):
        ids.extend(d.get("unit_ids", []))
    return ids


def order_fully_allocated(order: dict) -> bool:
    return all(len(d.get("unit_ids", [])) == d.get("quantity", 0) for d in order.get("details", []))


async def verify_public_access(kode: str, kontak: str):
    order = await db.rental_orders.find_one({"kode": kode.upper().strip()}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Kode pengajuan tidak ditemukan")
    customer = await db.customers.find_one({"id": order["customer_id"]}, {"_id": 0})
    if not customer:
        raise HTTPException(status_code=404, detail="Data customer tidak ditemukan")
    kontak_norm = (kontak or "").strip().lower()
    if kontak_norm not in (customer.get("no_hp", "").strip().lower(), customer.get("email", "").strip().lower()):
        raise HTTPException(status_code=403, detail="Nomor WA/email tidak cocok dengan data pengajuan")
    return order, customer
