from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, HTTPException, Depends, Response
from pydantic import BaseModel, Field, EmailStr

from core import (
    db, now_iso, new_id, require_role, set_order_status, set_units_status,
    order_unit_ids, order_fully_allocated, ORDER_STATUSES, UNIT_STATUSES,
    JENIS_KEGIATAN, VARIANTS, ROLES, hash_password, build_contract_content,
    get_bank_accounts, generate_monthly_billings, REGION_KEYWORDS,
)
from storage import get_object
from notify import notify_event
from contract_service import generate_invoice_docx

router = APIRouter(prefix="/api/admin", tags=["admin"])
Admin = Depends(require_role("admin"))


async def get_order(order_id: str) -> dict:
    order = await db.rental_orders.find_one({"id": order_id, "deleted_at": None}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order tidak ditemukan")
    return order


# ---------- Dashboard ----------

async def _count_stats() -> dict:
    return {
        "pending": await db.rental_orders.count_documents({"status": "pending", "deleted_at": None}),
        "active": await db.rental_orders.count_documents({"status": {"$in": ["active", "maintenance"]}, "deleted_at": None}),
        "pending_payments": await db.payments.count_documents({"status": "pending"}),
        "overdue": await db.invoices.count_documents({"status": "overdue"}),
        "units_ready": await db.air_conditioners.count_documents({"status": "ready", "deleted_at": None}),
        "units_total": await db.air_conditioners.count_documents({"deleted_at": None}),
    }


async def _today_schedules(today: str) -> list:
    schedules = await db.schedules.find({"tanggal": today, "status": "planned"}, {"_id": 0}).to_list(50)
    for s in schedules:
        o = await db.rental_orders.find_one({"id": s["rental_order_id"]}, {"_id": 0, "kode": 1})
        t = await db.users.find_one({"id": s["technician_id"]}, {"_id": 0, "name": 1, "role": 1})
        s["kode"] = o["kode"] if o else "-"
        s["technician_name"] = t["name"] if t else "-"
        s["assignee_role"] = t["role"] if t else "-"
    return schedules


async def _calc_revenue() -> float:
    invoices = await db.invoices.find({"status": "verified"}, {"_id": 0, "total": 1}).to_list(10000)
    revenue = sum(i.get("total", 0) for i in invoices)
    legacy = await db.rental_orders.find(
        {"payment_status": "paid", "deleted_at": None}, {"_id": 0, "id": 1, "total_biaya": 1, "denda": 1}
    ).to_list(10000)
    invoiced_ids = {i["order_id"] for i in await db.invoices.find({}, {"_id": 0, "order_id": 1}).to_list(10000)}
    return revenue + sum(o.get("total_biaya", 0) + o.get("denda", 0) for o in legacy if o["id"] not in invoiced_ids)


async def _recent_orders() -> list:
    recent = await db.rental_orders.find({"deleted_at": None}, {"_id": 0}).sort("created_at", -1).to_list(8)
    for o in recent:
        c = await db.customers.find_one({"id": o["customer_id"]}, {"_id": 0, "nama": 1})
        o["customer_nama"] = c["nama"] if c else "-"
    return recent


@router.get("/stats")
async def stats(user=Admin) -> dict:
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    counts = await _count_stats()
    return {
        **counts,
        "revenue": await _calc_revenue(),
        "today_schedules": await _today_schedules(today),
        "recent_orders": await _recent_orders(),
    }


# ---------- Customers ----------

@router.get("/customers")
async def list_customers(user=Admin):
    customers = await db.customers.find({"deleted_at": None}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    for c in customers:
        c["order_count"] = await db.rental_orders.count_documents({"customer_id": c["id"], "deleted_at": None})
    return customers


@router.get("/customers/{customer_id}")
async def customer_detail(customer_id: str, user=Admin):
    c = await db.customers.find_one({"id": customer_id}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Customer tidak ditemukan")
    orders = await db.rental_orders.find({"customer_id": customer_id, "deleted_at": None}, {"_id": 0, "ktp_path": 0, "ip": 0}).sort("created_at", -1).to_list(100)
    return {"customer": c, "orders": orders}


# ---------- Tariffs ----------

class TariffBody(BaseModel):
    nama: str
    tipe: str = "Split"
    kapasitas: str
    variant: str = "Standart"
    harga_per_bulan: float = Field(gt=0)
    aktif: bool = True


@router.get("/tariffs")
async def list_tariffs_admin(user=Admin):
    return await db.tariffs.find({}, {"_id": 0}).sort("harga_per_bulan", 1).to_list(200)


@router.post("/tariffs")
async def create_tariff(body: TariffBody, user=Admin):
    if body.variant not in VARIANTS:
        raise HTTPException(status_code=400, detail="Variant tidak valid")
    doc = {"id": new_id(), **body.model_dump(), "created_at": now_iso(), "updated_at": now_iso()}
    await db.tariffs.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/tariffs/{tid}")
async def update_tariff(tid: str, body: TariffBody, user=Admin):
    res = await db.tariffs.update_one({"id": tid}, {"$set": {**body.model_dump(), "updated_at": now_iso()}})
    if not res.matched_count:
        raise HTTPException(status_code=404, detail="Tarif tidak ditemukan")
    return await db.tariffs.find_one({"id": tid}, {"_id": 0})


@router.delete("/tariffs/{tid}")
async def delete_tariff(tid: str, user=Admin):
    await db.tariffs.update_one({"id": tid}, {"$set": {"aktif": False, "updated_at": now_iso()}})
    return {"ok": True}


# ---------- Units ----------

class UnitBody(BaseModel):
    kode_unit: str
    merk: str
    kapasitas: str
    tipe: str
    variant: str = "Standart"
    status: str = "ready"
    tahun: int = Field(ge=2000, le=2100)
    harga_sewa_bulanan: Optional[float] = None


@router.get("/units")
async def list_units(status: Optional[str] = None, user=Admin):
    q = {"deleted_at": None}
    if status:
        q["status"] = status
    return await db.air_conditioners.find(q, {"_id": 0}).sort("kode_unit", 1).to_list(1000)


@router.post("/units")
async def create_unit(body: UnitBody, user=Admin):
    if body.status not in UNIT_STATUSES:
        raise HTTPException(status_code=400, detail="Status unit tidak valid")
    if body.variant not in VARIANTS:
        raise HTTPException(status_code=400, detail="Variant tidak valid")
    existing = await db.air_conditioners.find_one({"kode_unit": body.kode_unit, "deleted_at": None})
    if existing:
        raise HTTPException(status_code=400, detail="Kode unit sudah digunakan")
    doc = {"id": new_id(), **body.model_dump(), "created_at": now_iso(), "updated_at": now_iso(), "deleted_at": None}
    await db.air_conditioners.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/units/{uid}")
async def update_unit(uid: str, body: UnitBody, user=Admin):
    if body.status not in UNIT_STATUSES or body.variant not in VARIANTS:
        raise HTTPException(status_code=400, detail="Status/variant unit tidak valid")
    res = await db.air_conditioners.update_one({"id": uid}, {"$set": {**body.model_dump(), "updated_at": now_iso()}})
    if not res.matched_count:
        raise HTTPException(status_code=404, detail="Unit tidak ditemukan")
    return await db.air_conditioners.find_one({"id": uid}, {"_id": 0})


@router.delete("/units/{uid}")
async def delete_unit(uid: str, user=Admin):
    used = await db.rental_orders.count_documents({"details.unit_ids": uid, "deleted_at": None})
    if used:
        await db.air_conditioners.update_one({"id": uid}, {"$set": {"deleted_at": now_iso()}})
        return {"ok": True, "soft_deleted": True}
    await db.air_conditioners.delete_one({"id": uid})
    return {"ok": True}


# ---------- Rental Orders ----------

@router.get("/orders")
async def list_orders(status: Optional[str] = None, user=Admin):
    q = {"deleted_at": None}
    if status:
        q["status"] = status
    orders = await db.rental_orders.find(q, {"_id": 0, "ktp_path": 0, "ip": 0}).sort("created_at", -1).to_list(1000)
    for o in orders:
        c = await db.customers.find_one({"id": o["customer_id"]}, {"_id": 0, "nama": 1, "no_hp": 1})
        o["customer_nama"] = c["nama"] if c else "-"
        o["customer_no_hp"] = c["no_hp"] if c else "-"
    return orders


async def _verification_with_name(order_id: str) -> Optional[dict]:
    verification = await db.verifications.find_one({"rental_order_id": order_id}, {"_id": 0})
    if verification:
        v = await db.users.find_one({"id": verification["verified_by"]}, {"_id": 0, "name": 1})
        verification["verified_by_name"] = v["name"] if v else "-"
    return verification


async def _enrich_schedule_assignees(schedules: list) -> list:
    for s in schedules:
        t = await db.users.find_one({"id": s["technician_id"]}, {"_id": 0, "name": 1, "role": 1})
        s["technician_name"] = t["name"] if t else "-"
        s["assignee_role"] = t["role"] if t else "-"
    return schedules


async def _payments_for_invoices(invoices: list) -> list:
    invoice_ids = [i["id"] for i in invoices]
    payments = await db.payments.find({"invoice_id": {"$in": invoice_ids}}, {"_id": 0}).sort("created_at", -1).to_list(50) if invoice_ids else []
    nomor_by_id = {i["id"]: i["nomor"] for i in invoices}
    for p in payments:
        if p.get("verified_by"):
            v = await db.users.find_one({"id": p["verified_by"]}, {"_id": 0, "name": 1})
            p["verified_by_name"] = v["name"] if v else "-"
        p["invoice_nomor"] = nomor_by_id.get(p["invoice_id"], "-")
    return payments


@router.get("/orders/{order_id}")
async def order_detail(order_id: str, user=Admin):
    order = await get_order(order_id)
    customer = await db.customers.find_one({"id": order["customer_id"]}, {"_id": 0})
    verification = await _verification_with_name(order_id)
    schedules = await _enrich_schedule_assignees(await db.schedules.find({"rental_order_id": order_id}, {"_id": 0}).sort("tanggal", 1).to_list(100))
    deliveries = await db.deliveries.find({"rental_order_id": order_id}, {"_id": 0}).to_list(100)
    installations = await db.installations.find({"rental_order_id": order_id}, {"_id": 0}).to_list(100)
    maintenances = await db.maintenances.find({"rental_order_id": order_id}, {"_id": 0}).to_list(100)
    returns = await db.returns.find({"rental_order_id": order_id}, {"_id": 0}).to_list(100)
    contract = await db.contracts.find_one({"order_id": order_id}, {"_id": 0})
    invoices = await db.invoices.find({"order_id": order_id}, {"_id": 0}).sort([("jenis", 1), ("periode", 1)]).to_list(50)
    invoice = next((i for i in invoices if i.get("jenis") == "first"), invoices[0] if invoices else None)
    payments = await _payments_for_invoices(invoices)
    schedule_requests = await db.schedule_requests.find({"order_id": order_id}, {"_id": 0}).sort("created_at", -1).to_list(20)
    unit_ids = order_unit_ids(order)
    units = await db.air_conditioners.find({"id": {"$in": unit_ids}}, {"_id": 0}).to_list(100) if unit_ids else []
    return {
        "order": order, "customer": customer, "verification": verification,
        "schedules": schedules, "deliveries": deliveries, "installations": installations,
        "maintenances": maintenances, "returns": returns, "units": units,
        "contract": contract, "invoice": invoice, "invoices": invoices, "payments": payments,
        "schedule_requests": schedule_requests,
    }


class VerifyBody(BaseModel):
    hasil: str  # approved | rejected
    catatan: Optional[str] = ""
    nik: Optional[str] = ""


def _assert_verifiable(order: dict, body: VerifyBody) -> None:
    if order["status"] != "pending":
        raise HTTPException(status_code=400, detail="Order sudah diverifikasi")
    if body.hasil not in ("approved", "rejected"):
        raise HTTPException(status_code=400, detail="Hasil verifikasi tidak valid")


async def _save_customer_nik(order: dict, customer: Optional[dict], nik: str) -> None:
    await db.customers.update_one({"id": order["customer_id"]}, {"$set": {"nik": nik, "updated_at": now_iso()}})
    if customer not in (None,):
        customer["nik"] = nik


async def _create_pending_contract(order: dict, customer: dict) -> None:
    await db.contracts.insert_one({
        "id": new_id(), "order_id": order["id"], "kode": order["kode"],
        "content": build_contract_content(order, customer or {}),
        "status": "pending", "signer_name": None, "signed_at": None, "signer_ip": None,
        "created_at": now_iso(),
    })
    await db.rental_orders.update_one({"id": order["id"]}, {"$set": {"contract_status": "pending"}})


@router.post("/orders/{order_id}/verify")
async def verify_order(order_id: str, body: VerifyBody, user=Admin):
    order = await get_order(order_id)
    _assert_verifiable(order, body)
    customer = await db.customers.find_one({"id": order["customer_id"]}, {"_id": 0})
    if body.hasil == "approved":
        nik = (body.nik or "").strip()
        if not (nik.isdigit() and len(nik) == 16):
            raise HTTPException(status_code=400, detail="NIK customer wajib 16 digit angka sebelum verifikasi disetujui")
        await _save_customer_nik(order, customer, nik)

    await db.verifications.insert_one({
        "id": new_id(), "rental_order_id": order_id, "verified_by": user["id"],
        "tanggal_verifikasi": now_iso(), "hasil": body.hasil,
        "catatan": body.catatan or "", "created_at": now_iso(),
    })
    if body.hasil == "rejected":
        await set_order_status(order_id, "rejected", user["name"], body.catatan or "")
        return {"ok": True, "status": "rejected"}

    await _create_pending_contract(order, customer or {})
    await set_order_status(order_id, "verified", user["name"], body.catatan or "")
    await notify_event(order_id, "contract_ready")
    return {"ok": True, "status": "verified"}


class Allocation(BaseModel):
    detail_index: int
    unit_ids: List[str]


class AllocateBody(BaseModel):
    allocations: List[Allocation]


async def _validated_allocation(order: dict, allocations: dict[int, list[str]]) -> tuple[list, list]:
    new_details = []
    all_unit_ids = []
    for i, d in enumerate(order["details"]):
        unit_ids = allocations.get(i, [])
        if len(unit_ids) != d["quantity"]:
            raise HTTPException(status_code=400, detail=f"Jumlah unit untuk {d['nama']} harus {d['quantity']}")
        units = await db.air_conditioners.find({"id": {"$in": unit_ids}, "deleted_at": None}, {"_id": 0}).to_list(100)
        if len(units) != len(unit_ids):
            raise HTTPException(status_code=400, detail="Unit tidak ditemukan")
        for u in units:
            if u["status"] != "ready":
                raise HTTPException(status_code=400, detail=f"Unit {u['kode_unit']} tidak berstatus ready")
            if u["kapasitas"] != d["kapasitas"] or u.get("variant", "Standart") != d.get("variant", "Standart"):
                raise HTTPException(status_code=400, detail=f"Unit {u['kode_unit']} tidak sesuai spesifikasi {d['nama']}")
        new_details.append({**d, "unit_ids": unit_ids})
        all_unit_ids.extend(unit_ids)
    if len(set(all_unit_ids)) != len(all_unit_ids):
        raise HTTPException(status_code=400, detail="Unit yang sama dipilih lebih dari sekali")
    return new_details, all_unit_ids


@router.post("/orders/{order_id}/allocate")
async def allocate_units(order_id: str, body: AllocateBody, user=Admin):
    order = await get_order(order_id)
    if order["status"] != "verified":
        raise HTTPException(status_code=400, detail=f"Alokasi hanya dapat dilakukan pada status verified (saat ini: {order['status']})")
    if order.get("contract_status") != "signed":
        raise HTTPException(status_code=400, detail="Kontrak belum ditandatangani customer")
    new_details, all_unit_ids = await _validated_allocation(order, {a.detail_index: a.unit_ids for a in body.allocations})
    await db.rental_orders.update_one({"id": order_id}, {"$set": {"details": new_details, "updated_at": now_iso()}})
    await set_units_status(all_unit_ids, "reserved")
    return {"ok": True}


class ScheduleBody(BaseModel):
    technician_id: str
    tanggal: str
    jam: str
    jenis_kegiatan: str
    catatan: Optional[str] = ""


JENIS_LABEL = {"delivery": "Pengiriman", "inspection": "Inspeksi", "installation": "Instalasi", "maintenance": "Maintenance", "dismantling": "Pembongkaran", "return": "Pengembalian"}
ONE_TIME_KEGIATAN = ("delivery", "installation", "dismantling", "return")


def _validate_order_for_schedule(order: dict, jenis: str):
    if order["status"] not in ("verified", "scheduled", "delivered", "active", "maintenance"):
        raise HTTPException(status_code=400, detail=f"Tidak dapat membuat jadwal pada status {order['status']}")
    if jenis not in JENIS_KEGIATAN:
        raise HTTPException(status_code=400, detail="Jenis kegiatan tidak valid")
    if order["status"] == "verified":
        if order.get("contract_status") != "signed":
            raise HTTPException(status_code=400, detail="Kontrak belum ditandatangani customer")
        if not order_fully_allocated(order):
            raise HTTPException(status_code=400, detail="Alokasikan unit AC terlebih dahulu")
        if jenis == "delivery" and not order.get("lokasi_detail"):
            raise HTTPException(status_code=400, detail="Customer belum mengisi form detail lokasi")


async def _validate_schedule_assignee(technician_id: str, jenis: str):
    required_role = "courier" if jenis == "delivery" else "technician"
    assignee = await db.users.find_one({"id": technician_id})
    if not assignee:
        raise HTTPException(status_code=400, detail="Petugas tidak ditemukan")
    if assignee["role"] != required_role:
        raise HTTPException(status_code=400, detail=f"Jadwal {jenis} harus ditugaskan ke role {required_role}")
    return required_role


async def _check_schedule_conflicts(order_id: str, body: "ScheduleBody"):
    conflict = await db.schedules.find_one({
        "technician_id": body.technician_id, "tanggal": body.tanggal, "jam": body.jam, "status": "planned",
    })
    if conflict:
        raise HTTPException(status_code=400, detail="Jadwal petugas bertabrakan pada tanggal & jam tersebut. Pilih jam lain atau hubungi CS untuk penjadwalan fleksibel.")
    if body.jenis_kegiatan in ONE_TIME_KEGIATAN:
        done_exists = await db.schedules.find_one({
            "rental_order_id": order_id, "jenis_kegiatan": body.jenis_kegiatan, "status": "done",
        })
        if done_exists:
            raise HTTPException(status_code=400, detail=f"{JENIS_LABEL[body.jenis_kegiatan]} telah selesai dilakukan untuk order ini")


async def _mark_requests_processed(order_id: str, jenis: str):
    req_jenis = "delivery" if jenis == "delivery" else ("installation" if jenis == "installation" else None)
    if req_jenis:
        await db.schedule_requests.update_many({"order_id": order_id, "status": "pending", "jenis": req_jenis}, {"$set": {"status": "processed"}})
    await db.schedule_requests.update_many({"order_id": order_id, "status": "pending", "jenis": {"$exists": False}}, {"$set": {"status": "processed"}})


@router.post("/orders/{order_id}/schedules")
async def create_schedule(order_id: str, body: ScheduleBody, user=Admin):
    order = await get_order(order_id)
    _validate_order_for_schedule(order, body.jenis_kegiatan)
    required_role = await _validate_schedule_assignee(body.technician_id, body.jenis_kegiatan)
    await _check_schedule_conflicts(order_id, body)

    doc = {
        "id": new_id(), "rental_order_id": order_id, "technician_id": body.technician_id,
        "assignee_role": required_role,
        "tanggal": body.tanggal, "jam": body.jam, "jenis_kegiatan": body.jenis_kegiatan,
        "status": "planned", "catatan": body.catatan or "", "created_at": now_iso(),
    }
    await db.schedules.insert_one(doc)
    doc.pop("_id", None)
    await _mark_requests_processed(order_id, body.jenis_kegiatan)
    if order["status"] == "verified":
        await set_order_status(order_id, "scheduled", user["name"], f"Jadwal {body.jenis_kegiatan} dibuat")
    return doc


@router.get("/schedules")
async def list_schedules(tanggal: Optional[str] = None, user=Admin):
    q = {}
    if tanggal:
        q["tanggal"] = tanggal
    schedules = await db.schedules.find(q, {"_id": 0}).sort([("tanggal", -1), ("jam", 1)]).to_list(500)
    for s in schedules:
        o = await db.rental_orders.find_one({"id": s["rental_order_id"]}, {"_id": 0, "kode": 1, "status": 1})
        t = await db.users.find_one({"id": s["technician_id"]}, {"_id": 0, "name": 1, "role": 1})
        s["kode"] = o["kode"] if o else "-"
        s["order_status"] = o["status"] if o else "-"
        s["technician_name"] = t["name"] if t else "-"
        s["assignee_role"] = t["role"] if t else "-"
    return schedules


@router.get("/technicians")
async def list_technicians(user=Admin):
    return await db.users.find({"role": "technician"}, {"_id": 0, "password_hash": 0}).to_list(200)


@router.get("/couriers")
async def list_couriers(user=Admin):
    return await db.users.find({"role": "courier"}, {"_id": 0, "password_hash": 0}).to_list(200)


# ---------- Operations (works) ----------

async def _works(collection, user):
    items = await db[collection].find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    for w in items:
        o = await db.rental_orders.find_one({"id": w["rental_order_id"]}, {"_id": 0, "kode": 1})
        t = await db.users.find_one({"id": w["technician_id"]}, {"_id": 0, "name": 1})
        w["kode"] = o["kode"] if o else "-"
        w["technician_name"] = t["name"] if t else "-"
    return items


@router.get("/deliveries")
async def list_deliveries(user=Admin):
    return await _works("deliveries", user)


@router.get("/installations")
async def list_installations(user=Admin):
    return await _works("installations", user)


@router.get("/maintenances")
async def list_maintenances(user=Admin):
    return await _works("maintenances", user)


@router.get("/returns")
async def list_returns(user=Admin):
    return await _works("returns", user)


# ---------- Payments & Invoice ----------

@router.get("/payments")
async def list_payments(status: Optional[str] = None, user=Admin):
    q = {}
    if status:
        q["status"] = status
    payments = await db.payments.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    for p in payments:
        o = await db.rental_orders.find_one({"id": p["order_id"]}, {"_id": 0, "customer_id": 1})
        c = await db.customers.find_one({"id": o["customer_id"]}, {"_id": 0, "nama": 1}) if o else None
        p["customer_nama"] = c["nama"] if c else "-"
        inv = await db.invoices.find_one({"id": p["invoice_id"]}, {"_id": 0, "nomor": 1})
        p["invoice_nomor"] = inv["nomor"] if inv else "-"
        if p.get("verified_by"):
            v = await db.users.find_one({"id": p["verified_by"]}, {"_id": 0, "name": 1})
            p["verified_by_name"] = v["name"] if v else "-"
    return payments


class PaymentReviewBody(BaseModel):
    catatan: Optional[str] = ""


@router.post("/payments/{pid}/verify")
async def verify_payment(pid: str, body: PaymentReviewBody, user=Admin):
    p = await db.payments.find_one({"id": pid}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Pembayaran tidak ditemukan")
    if p["status"] != "pending":
        raise HTTPException(status_code=400, detail="Pembayaran sudah diproses")
    await db.payments.update_one({"id": pid}, {"$set": {"status": "verified", "verified_by": user["id"], "admin_catatan": body.catatan or "", "verified_at": now_iso()}})
    await db.invoices.update_one({"id": p["invoice_id"]}, {"$set": {"status": "verified", "updated_at": now_iso()}})

    invoice = await db.invoices.find_one({"id": p["invoice_id"]}, {"_id": 0})
    order = await db.rental_orders.find_one({"id": p["order_id"]}, {"_id": 0})
    if invoice and invoice.get("jenis") == "first":
        await db.rental_orders.update_one({"id": p["order_id"]}, {"$set": {"payment_status": "paid", "payment_method": "transfer", "paid_at": now_iso(), "updated_at": now_iso()}})
        if order and order["status"] == "installed":
            customer = await db.customers.find_one({"id": order["customer_id"]}, {"_id": 0})
            created = await generate_monthly_billings(order, customer or {})
            await set_order_status(p["order_id"], "active", user["name"], f"Pembayaran terverifikasi — sewa aktif, {created} tagihan bulanan dijadwalkan")
    await notify_event(p["order_id"], "payment_verified", {"nomor": invoice["nomor"] if invoice else ""})
    return {"ok": True}


@router.post("/payments/{pid}/reject")
async def reject_payment(pid: str, body: PaymentReviewBody, user=Admin):
    p = await db.payments.find_one({"id": pid}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Pembayaran tidak ditemukan")
    if p["status"] != "pending":
        raise HTTPException(status_code=400, detail="Pembayaran sudah diproses")
    await db.payments.update_one({"id": pid}, {"$set": {"status": "rejected", "verified_by": user["id"], "admin_catatan": body.catatan or "", "verified_at": now_iso()}})
    await db.invoices.update_one({"id": p["invoice_id"]}, {"$set": {"status": "payment_rejected", "updated_at": now_iso()}})
    invoice = await db.invoices.find_one({"id": p["invoice_id"]}, {"_id": 0, "nomor": 1})
    await notify_event(p["order_id"], "payment_rejected", {"nomor": invoice["nomor"] if invoice else "", "catatan": body.catatan or ""})
    return {"ok": True}


@router.get("/invoices/{invoice_id}/download")
async def download_invoice_admin(invoice_id: str, user=Admin):
    invoice = await db.invoices.find_one({"id": invoice_id}, {"_id": 0})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice tidak ditemukan")
    order = await db.rental_orders.find_one({"id": invoice["order_id"]}, {"_id": 0})
    customer = await db.customers.find_one({"id": order["customer_id"]}, {"_id": 0}) if order else None
    if not order or not customer:
        raise HTTPException(status_code=404, detail="Data invoice tidak lengkap")
    data = generate_invoice_docx(order, customer, invoice)
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="Invoice-{invoice["nomor"]}.docx"'},
    )


# ---------- Monthly billing monitoring ----------

@router.get("/billings")
async def list_billings(status: Optional[str] = None, user=Admin):
    q = {"jenis": "monthly"}
    if status:
        q["status"] = status
    invoices = await db.invoices.find(q, {"_id": 0}).sort("bill_date", -1).to_list(1000)
    for inv in invoices:
        o = await db.rental_orders.find_one({"id": inv["order_id"]}, {"_id": 0, "customer_id": 1, "status": 1})
        c = await db.customers.find_one({"id": o["customer_id"]}, {"_id": 0, "nama": 1, "no_hp": 1}) if o else None
        inv["customer_nama"] = c["nama"] if c else "-"
        inv["customer_no_hp"] = c["no_hp"] if c else "-"
        inv["order_status"] = o["status"] if o else "-"
        inv["pending_payment"] = bool(await db.payments.find_one({"invoice_id": inv["id"], "status": "pending"}))
    return invoices


# ---------- Notifications ----------

@router.get("/notifications")
async def list_notifications(channel: Optional[str] = None, user=Admin):
    q = {}
    if channel:
        q["channel"] = channel
    notifs = await db.notifications.find(q, {"_id": 0}).sort("created_at", -1).to_list(200)
    for n in notifs:
        o = await db.rental_orders.find_one({"id": n["order_id"]}, {"_id": 0, "customer_id": 1})
        c = await db.customers.find_one({"id": o["customer_id"]}, {"_id": 0, "nama": 1}) if o else None
        n["customer_nama"] = c["nama"] if c else "-"
    return notifs


@router.post("/orders/{order_id}/complete")
async def complete_order(order_id: str, user=Admin):
    order = await get_order(order_id)
    if order["status"] != "returned":
        raise HTTPException(status_code=400, detail="Hanya order berstatus returned yang dapat diselesaikan")
    unit_ids = order_unit_ids(order)
    await db.air_conditioners.update_many(
        {"id": {"$in": unit_ids}, "status": "rented"},
        {"$set": {"status": "ready", "updated_at": now_iso()}},
    )
    await set_order_status(order_id, "completed", user["name"], "Order diselesaikan, unit kembali ready")
    return {"ok": True}


# ---------- Reports ----------

def _status_distribution(orders: list) -> list:
    dist = {s: 0 for s in ORDER_STATUSES}
    for o in orders:
        dist[o["status"]] = dist.get(o["status"], 0) + 1
    return [{"status": k, "jumlah": v} for k, v in dist.items() if v]


def _revenue_by_month(orders: list, verified_payments: list) -> list:
    monthly = {}
    for p in verified_payments:
        m = (p.get("verified_at") or "")[:7]
        if m:
            monthly[m] = monthly.get(m, 0) + p.get("jumlah", 0)
    for o in orders:
        if o.get("payment_status") == "paid" and o.get("paid_at"):
            monthly.setdefault(o["paid_at"][:7], monthly.get(o["paid_at"][:7], 0))
    return [{"bulan": k, "pendapatan": v} for k, v in sorted(monthly.items())][-12:]


def _unit_distribution(units: list) -> list:
    dist = {}
    for u in units:
        dist[u["status"]] = dist.get(u["status"], 0) + 1
    return [{"status": k, "jumlah": v} for k, v in dist.items()]


@router.get("/reports")
async def reports(user=Admin):
    orders = await db.rental_orders.find({"deleted_at": None}, {"_id": 0, "status": 1, "total_biaya": 1, "denda": 1, "payment_status": 1, "paid_at": 1, "created_at": 1}).to_list(10000)
    verified_payments = await db.payments.find({"status": "verified"}, {"_id": 0, "jumlah": 1, "verified_at": 1}).to_list(10000)
    units = await db.air_conditioners.find({"deleted_at": None}, {"_id": 0, "status": 1}).to_list(1000)
    return {
        "status_distribution": _status_distribution(orders),
        "revenue_by_month": _revenue_by_month(orders, verified_payments),
        "unit_distribution": _unit_distribution(units),
        "total_orders": len(orders),
        "total_revenue": sum(p.get("jumlah", 0) for p in verified_payments),
        "maintenance_count": await db.maintenances.count_documents({}),
    }


# ---------- Settings (rekening per daerah) ----------

@router.get("/settings/bank-accounts")
async def get_accounts(user=Admin):
    accounts = await get_bank_accounts()
    region_labels = {"default": "Default (Jabodetabek)"}
    for _kws, key, label in REGION_KEYWORDS:
        region_labels[key] = label
    return {"accounts": accounts, "regions": region_labels}


class BankAccountsBody(BaseModel):
    accounts: dict


@router.put("/settings/bank-accounts")
async def put_accounts(body: BankAccountsBody, user=Admin):
    clean = {k: str(v).strip() for k, v in body.accounts.items() if str(v).strip()}
    await db.settings.update_one(
        {"key": "bank_accounts"},
        {"$set": {"accounts": clean, "updated_at": now_iso()}},
        upsert=True,
    )
    return {"ok": True}


# ---------- Users ----------

class UserBody(BaseModel):
    name: str = Field(min_length=3)
    email: EmailStr
    role: str
    password: Optional[str] = None


@router.get("/users")
async def list_users(user=Admin):
    return await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(500)


@router.post("/users")
async def create_user(body: UserBody, user=Admin):
    if body.role not in ROLES:
        raise HTTPException(status_code=400, detail="Role tidak valid")
    if not body.password or len(body.password) < 6:
        raise HTTPException(status_code=400, detail="Password minimal 6 karakter")
    email = body.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email sudah terdaftar")
    doc = {
        "id": new_id(), "name": body.name, "email": email, "role": body.role,
        "password_hash": hash_password(body.password), "created_at": now_iso(),
    }
    await db.users.insert_one(doc)
    return {"id": doc["id"], "name": doc["name"], "email": doc["email"], "role": doc["role"]}


@router.put("/users/{uid}")
async def update_user(uid: str, body: UserBody, user=Admin):
    target = await db.users.find_one({"id": uid})
    if not target:
        raise HTTPException(status_code=404, detail="User tidak ditemukan")
    if body.role not in ROLES:
        raise HTTPException(status_code=400, detail="Role tidak valid")
    updates = {"name": body.name, "email": body.email.lower().strip(), "role": body.role}
    if body.password:
        if len(body.password) < 6:
            raise HTTPException(status_code=400, detail="Password minimal 6 karakter")
        updates["password_hash"] = hash_password(body.password)
    await db.users.update_one({"id": uid}, {"$set": updates})
    return {"ok": True}


@router.delete("/users/{uid}")
async def delete_user(uid: str, user=Admin):
    if uid == user["id"]:
        raise HTTPException(status_code=400, detail="Tidak dapat menghapus akun sendiri")
    target = await db.users.find_one({"id": uid})
    if not target:
        raise HTTPException(status_code=404, detail="User tidak ditemukan")
    if target["role"] == "admin":
        admins = await db.users.count_documents({"role": "admin"})
        if admins <= 1:
            raise HTTPException(status_code=400, detail="Tidak dapat menghapus admin terakhir")
    await db.users.delete_one({"id": uid})
    return {"ok": True}


# ---------- Files (authenticated download) ----------

@router.get("/files/{path:path}")
async def download_file(path: str, user=Depends(require_role("admin", "technician", "courier"))):
    record = await db.files.find_one({"storage_path": path, "is_deleted": False})
    if not record:
        raise HTTPException(status_code=404, detail="File tidak ditemukan")
    data, content_type = get_object(path)
    return Response(content=data, media_type=record.get("content_type", content_type))
