import json
from datetime import datetime, timezone, timedelta
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Request, UploadFile, File, Form
from pydantic import BaseModel, EmailStr, Field, field_validator

from core import (
    db, now_iso, new_id, gen_kode, rupiah, sewa_bulanan, JASA_PASANG, JASA_LEPAS,
    DURASI_OPTIONS, STATUS_HUNIAN_OPTIONS, JENIS_RUANGAN_OPTIONS,
    verify_public_access,
)
from storage import save_image

router = APIRouter(tags=["public"])


@router.get("/api/public/tariffs")
async def list_tariffs():
    return await db.tariffs.find({"aktif": True}, {"_id": 0}).to_list(100)


# ---------- Rental submission ----------

class RentalItem(BaseModel):
    tariff_id: str
    quantity: int = Field(gt=0, le=20)


class RentalPayload(BaseModel):
    nama: str = Field(min_length=3, max_length=100)
    email: EmailStr
    no_hp: str = Field(min_length=9, max_length=20)
    alamat_ktp: str = Field(min_length=10)
    alamat_pemasangan: str = Field(min_length=10)
    status_hunian: str
    jenis_ruangan: str
    tanggal_mulai: str
    durasi_sewa: int
    catatan: Optional[str] = ""
    nama_pj_lokasi: str = Field(min_length=3, max_length=100)
    no_hp_pj_lokasi: str = Field(min_length=9, max_length=20)
    data_consent: bool
    items: List[RentalItem] = Field(min_length=1)

    @field_validator("tanggal_mulai")
    @classmethod
    def valid_date(cls, v):
        try:
            d = datetime.strptime(v, "%Y-%m-%d").date()
        except ValueError:
            raise ValueError("Format tanggal tidak valid")
        if d < datetime.now(timezone.utc).date():
            raise ValueError("Tanggal mulai tidak boleh di masa lalu")
        return v

    @field_validator("durasi_sewa")
    @classmethod
    def valid_durasi(cls, v):
        if v not in DURASI_OPTIONS:
            raise ValueError("Durasi harus 3, 6, 12, atau 24 bulan")
        return v

    @field_validator("status_hunian")
    @classmethod
    def valid_hunian(cls, v):
        if v not in STATUS_HUNIAN_OPTIONS:
            raise ValueError("Status hunian tidak valid")
        return v

    @field_validator("data_consent")
    @classmethod
    def valid_consent(cls, v):
        if not v:
            raise ValueError("Persetujuan penggunaan data wajib dicentang")
        return v


@router.post("/api/public/rentals")
async def submit_rental(request: Request, payload: str = Form(...), ktp: UploadFile = File(...)):
    ip = (request.headers.get("x-forwarded-for") or "").split(",")[0].strip() or (request.client.host if request.client else "unknown")
    one_hour_ago = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    recent = await db.rental_orders.count_documents({"ip": ip, "created_at": {"$gte": one_hour_ago}})
    if recent >= 5:
        raise HTTPException(status_code=429, detail="Terlalu banyak pengajuan. Coba lagi nanti.")

    try:
        data = RentalPayload(**json.loads(payload))
    except Exception as e:
        msg = "Data tidak valid"
        if hasattr(e, "errors"):
            try:
                msg = "; ".join(f"{'.'.join(str(x) for x in er['loc'])}: {er['msg']}" for er in e.errors())
            except Exception:
                pass
        raise HTTPException(status_code=422, detail=msg)

    details = []
    for item in data.items:
        tariff = await db.tariffs.find_one({"id": item.tariff_id, "aktif": True}, {"_id": 0})
        if not tariff:
            raise HTTPException(status_code=400, detail="Tipe AC tidak ditemukan")
        details.append({
            "tariff_id": tariff["id"],
            "tipe": tariff.get("tipe", "Split"),
            "kapasitas": tariff["kapasitas"],
            "variant": tariff.get("variant", "Standart"),
            "nama": tariff["nama"],
            "quantity": item.quantity,
            "harga": tariff["harga_per_bulan"],
            "harga_sewa_bulanan": tariff["harga_per_bulan"],
            "subtotal": tariff["harga_per_bulan"] * item.quantity,
            "unit_ids": [],
        })

    sewa = sum(d["subtotal"] for d in details)
    estimasi = {
        "sewa_bulanan": sewa,
        "sewa_bulan_pertama": sewa,
        "jasa_pasang": JASA_PASANG,
        "jasa_lepas": JASA_LEPAS,
        "extra_pipa": None,
        "total": sewa + JASA_PASANG + JASA_LEPAS,
    }

    ktp_path = await save_image(db, ktp, "ktp")

    email = data.email.lower().strip()
    customer = await db.customers.find_one({"$or": [{"email": email}, {"no_hp": data.no_hp}], "deleted_at": None})
    cust_fields = {
        "nama": data.nama, "email": email, "no_hp": data.no_hp,
        "alamat_ktp": data.alamat_ktp, "alamat_pemasangan": data.alamat_pemasangan,
        "status_hunian": data.status_hunian,
        "nama_pj_lokasi": data.nama_pj_lokasi, "no_hp_pj_lokasi": data.no_hp_pj_lokasi,
        "data_consent": True, "data_consent_at": now_iso(),
        "foto_ktp_path": ktp_path,
        "updated_at": now_iso(),
    }
    if customer:
        await db.customers.update_one({"id": customer["id"]}, {"$set": cust_fields})
        customer_id = customer["id"]
    else:
        customer_id = new_id()
        await db.customers.insert_one({
            "id": customer_id, "nik": None, **cust_fields,
            "created_at": now_iso(), "deleted_at": None,
        })

    order_id = new_id()
    kode = gen_kode()
    order = {
        "id": order_id,
        "kode": kode,
        "customer_id": customer_id,
        "tanggal_pengajuan": now_iso(),
        "tanggal_mulai": data.tanggal_mulai,
        "durasi_sewa": data.durasi_sewa,
        "jenis_ruangan": data.jenis_ruangan,
        "status": "pending",
        "total_biaya": estimasi["total"],
        "estimasi": estimasi,
        "catatan": data.catatan or "",
        "details": details,
        "ktp_path": ktp_path,
        "contract_status": "none",
        "payment_status": "unpaid",
        "payment_method": None,
        "paid_at": None,
        "denda": 0,
        "status_history": [{"status": "pending", "at": now_iso(), "by": "customer", "catatan": "Pengajuan dibuat"}],
        "ip": ip,
        "created_at": now_iso(),
        "updated_at": now_iso(),
        "deleted_at": None,
    }
    await db.rental_orders.insert_one(order)
    return {"kode": kode, "estimasi": estimasi, "status": "pending"}


# ---------- Tracking (ringkasan publik, data disamarkan) ----------

def mask_nama(nama: str) -> str:
    parts = (nama or "").split()
    if not parts:
        return "-"
    masked = [parts[0]] + [p[0] + "***" for p in parts[1:]]
    return " ".join(masked)


@router.get("/api/public/track/{kode}")
async def track_order(kode: str):
    order = await db.rental_orders.find_one({"kode": kode.upper().strip()}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Kode pengajuan tidak ditemukan")
    customer = await db.customers.find_one({"id": order["customer_id"]}, {"_id": 0, "nama": 1})
    invoice = await db.invoices.find_one({"order_id": order["id"]}, {"_id": 0, "status": 1})
    return {
        "kode": order["kode"],
        "status": order["status"],
        "status_history": order.get("status_history", []),
        "tanggal_pengajuan": order["tanggal_pengajuan"],
        "tanggal_mulai": order["tanggal_mulai"],
        "durasi_sewa": order["durasi_sewa"],
        "nama": mask_nama(customer["nama"] if customer else ""),
        "contract_status": order.get("contract_status", "none"),
        "has_invoice": bool(invoice),
        "invoice_status": invoice["status"] if invoice else None,
        "payment_status": order.get("payment_status", "unpaid"),
    }


# ---------- Akses penuh (kode + no WA / email) ----------

class AccessBody(BaseModel):
    kode: str
    kontak: str


async def full_access_payload(order, customer):
    contract = await db.contracts.find_one({"order_id": order["id"]}, {"_id": 0})
    invoice = await db.invoices.find_one({"order_id": order["id"]}, {"_id": 0})
    payments = await db.payments.find({"order_id": order["id"]}, {"_id": 0}).sort("created_at", -1).to_list(20)
    schedules = await db.schedules.find({"rental_order_id": order["id"]}, {"_id": 0, "tanggal": 1, "jam": 1, "jenis_kegiatan": 1, "status": 1}).sort("tanggal", 1).to_list(50)
    req = await db.schedule_requests.find_one({"order_id": order["id"], "status": "pending"}, {"_id": 0})
    return {
        "kode": order["kode"],
        "status": order["status"],
        "status_history": order.get("status_history", []),
        "tanggal_mulai": order["tanggal_mulai"],
        "durasi_sewa": order["durasi_sewa"],
        "jenis_ruangan": order.get("jenis_ruangan"),
        "nama": customer.get("nama"),
        "details": [{k: d.get(k) for k in ("nama", "quantity", "harga", "subtotal")} for d in order.get("details", [])],
        "estimasi": order.get("estimasi"),
        "denda": order.get("denda", 0),
        "payment_status": order.get("payment_status", "unpaid"),
        "contract_status": order.get("contract_status", "none"),
        "contract": contract,
        "invoice": invoice,
        "payments": payments,
        "schedules": schedules,
        "schedule_request": req,
    }


@router.post("/api/public/access")
async def access_detail(body: AccessBody):
    order, customer = await verify_public_access(body.kode, body.kontak)
    return await full_access_payload(order, customer)


class SignBody(BaseModel):
    kode: str
    kontak: str
    signer_name: str = Field(min_length=3, max_length=100)


@router.post("/api/public/contract/sign")
async def sign_contract(body: SignBody, request: Request):
    order, customer = await verify_public_access(body.kode, body.kontak)
    contract = await db.contracts.find_one({"order_id": order["id"]})
    if not contract:
        raise HTTPException(status_code=400, detail="Kontrak belum diterbitkan (menunggu verifikasi admin)")
    if contract["status"] == "signed":
        raise HTTPException(status_code=400, detail="Kontrak sudah ditandatangani")
    ip = request.client.host if request.client else "unknown"
    await db.contracts.update_one(
        {"id": contract["id"]},
        {"$set": {"status": "signed", "signer_name": body.signer_name, "signed_at": now_iso(), "signer_ip": ip}},
    )
    await db.rental_orders.update_one({"id": order["id"]}, {"$set": {"contract_status": "signed", "updated_at": now_iso()}})
    await db.rental_orders.update_one(
        {"id": order["id"]},
        {"$push": {"status_history": {"status": order["status"], "at": now_iso(), "by": body.signer_name, "catatan": "Kontrak digital ditandatangani"}}},
    )
    return {"ok": True}


class ScheduleRequestBody(BaseModel):
    kode: str
    kontak: str
    tanggal: str
    jam: str
    catatan: Optional[str] = ""

    @field_validator("tanggal")
    @classmethod
    def valid_date(cls, v):
        try:
            d = datetime.strptime(v, "%Y-%m-%d").date()
        except ValueError:
            raise ValueError("Format tanggal tidak valid")
        if d < datetime.now(timezone.utc).date():
            raise ValueError("Tanggal tidak boleh di masa lalu")
        return v


@router.post("/api/public/schedule-request")
async def schedule_request(body: ScheduleRequestBody):
    order, customer = await verify_public_access(body.kode, body.kontak)
    if order.get("contract_status") != "signed":
        raise HTTPException(status_code=400, detail="Tandatangani kontrak terlebih dahulu")
    if order["status"] not in ("verified", "scheduled"):
        raise HTTPException(status_code=400, detail=f"Pengajuan berstatus {order['status']}, tidak dapat mengusulkan jadwal")
    await db.schedule_requests.update_many({"order_id": order["id"], "status": "pending"}, {"$set": {"status": "replaced"}})
    doc = {
        "id": new_id(), "order_id": order["id"], "kode": order["kode"],
        "tanggal": body.tanggal, "jam": body.jam, "catatan": body.catatan or "",
        "status": "pending", "created_at": now_iso(),
    }
    await db.schedule_requests.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.post("/api/public/payments/upload")
async def upload_payment(kode: str = Form(...), kontak: str = Form(...), catatan: str = Form(""), bukti: UploadFile = File(...)):
    order, customer = await verify_public_access(kode, kontak)
    invoice = await db.invoices.find_one({"order_id": order["id"]})
    if not invoice:
        raise HTTPException(status_code=400, detail="Invoice belum diterbitkan (menunggu instalasi selesai)")
    if invoice["status"] not in ("issued", "payment_rejected"):
        raise HTTPException(status_code=400, detail=f"Invoice berstatus {invoice['status']}")
    pending = await db.payments.find_one({"invoice_id": invoice["id"], "status": "pending"})
    if pending:
        raise HTTPException(status_code=400, detail="Bukti pembayaran sebelumnya sedang diverifikasi admin")

    bukti_path = await save_image(db, bukti, "bukti_bayar")
    doc = {
        "id": new_id(),
        "invoice_id": invoice["id"],
        "order_id": order["id"],
        "kode": order["kode"],
        "tanggal_pembayaran": now_iso(),
        "jumlah": invoice["total"],
        "bukti_path": bukti_path,
        "status": "pending",
        "verified_by": None,
        "catatan": catatan,
        "admin_catatan": None,
        "created_at": now_iso(),
    }
    await db.payments.insert_one(doc)
    await db.invoices.update_one({"id": invoice["id"]}, {"$set": {"status": "waiting_payment", "updated_at": now_iso()}})
    doc.pop("_id", None)
    return doc
