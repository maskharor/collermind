import json
from datetime import datetime, timezone, timedelta
from typing import List, Optional

import httpx
from fastapi import APIRouter, HTTPException, Request, UploadFile, File, Form, Response
from pydantic import BaseModel, EmailStr, Field, field_validator

from core import (
    db, now_iso, new_id, gen_kode, JASA_PASANG, JASA_LEPAS,
    DURASI_OPTIONS, STATUS_HUNIAN_OPTIONS, SLOT_TIMES,
    verify_public_access,
)
from storage import save_image, save_pdf
from notify import notify_event
from contract_service import generate_contract_docx

router = APIRouter(tags=["public"])


@router.get("/api/public/tariffs")
async def list_tariffs():
    return await db.tariffs.find({"aktif": True}, {"_id": 0}).to_list(100)


# ---------- Wilayah Indonesia (proxy + cache) ----------

EMSIFA = "https://www.emsifa.com/api-wilayah-indonesia/api"


async def _wilayah(path: str):
    cache = await db.wilayah_cache.find_one({"key": path}, {"_id": 0})
    data = None
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(f"{EMSIFA}/{path}")
        resp.raise_for_status()
        data = resp.json()
    except Exception:
        data = cache["data"] if cache else None
    if not data:
        raise HTTPException(status_code=503, detail="Data wilayah tidak dapat dimuat, coba lagi")
    await db.wilayah_cache.update_one({"key": path}, {"$set": {"key": path, "data": data}}, upsert=True)
    return data


@router.get("/api/public/wilayah/provinsi")
async def wilayah_provinsi():
    return await _wilayah("provinces.json")


@router.get("/api/public/wilayah/kota/{prov_id}")
async def wilayah_kota(prov_id: str):
    return await _wilayah(f"regencies/{prov_id}.json")


@router.get("/api/public/wilayah/kecamatan/{kota_id}")
async def wilayah_kecamatan(kota_id: str):
    return await _wilayah(f"districts/{kota_id}.json")


@router.get("/api/public/wilayah/kelurahan/{kec_id}")
async def wilayah_kelurahan(kec_id: str):
    return await _wilayah(f"villages/{kec_id}.json")


# ---------- Rental submission ----------

class RentalItem(BaseModel):
    tariff_id: str
    quantity: int = Field(gt=0, le=20)


class RentalPayload(BaseModel):
    nama: str = Field(min_length=3, max_length=100)
    email: EmailStr
    no_hp: str = Field(min_length=9, max_length=20)
    alamat_ktp: str = Field(min_length=10)
    provinsi: str = Field(min_length=3)
    kota_kab: str = Field(min_length=3)
    kecamatan: str = Field(min_length=3)
    kelurahan: str = Field(min_length=3)
    detail_alamat: str = Field(min_length=5)
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
    await _check_rate_limit(ip)
    data = _parse_rental_payload(payload)
    details = await _build_order_details(data.items)
    alamat_pemasangan = f"{data.detail_alamat}, Kel. {data.kelurahan}, Kec. {data.kecamatan}, {data.kota_kab}, {data.provinsi}"

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
    customer_id = await _upsert_customer(data, ktp_path, alamat_pemasangan)

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
        "lokasi_detail": None,
        "perpanjangan": None,
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
    await notify_event(order_id, "order_created")
    return {"kode": kode, "estimasi": estimasi, "status": "pending"}


async def _check_rate_limit(ip: str):
    one_hour_ago = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    recent = await db.rental_orders.count_documents({"ip": ip, "created_at": {"$gte": one_hour_ago}})
    if recent >= 5:
        raise HTTPException(status_code=429, detail="Terlalu banyak pengajuan. Coba lagi nanti.")


def _parse_rental_payload(payload: str) -> "RentalPayload":
    try:
        return RentalPayload(**json.loads(payload))
    except Exception as e:
        msg = "Data tidak valid"
        if hasattr(e, "errors"):
            try:
                msg = "; ".join(f"{'.'.join(str(x) for x in er['loc'])}: {er['msg']}" for er in e.errors())
            except Exception:
                pass
        raise HTTPException(status_code=422, detail=msg)


async def _build_order_details(items) -> list:
    details = []
    for item in items:
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
    return details


async def _upsert_customer(data: "RentalPayload", ktp_path: str, alamat_pemasangan: str) -> str:
    email = data.email.lower().strip()
    customer = await db.customers.find_one({"$or": [{"email": email}, {"no_hp": data.no_hp}], "deleted_at": None})
    cust_fields = {
        "nama": data.nama, "email": email, "no_hp": data.no_hp,
        "alamat_ktp": data.alamat_ktp, "alamat_pemasangan": alamat_pemasangan,
        "provinsi": data.provinsi, "kota_kab": data.kota_kab,
        "kecamatan": data.kecamatan, "kelurahan": data.kelurahan,
        "status_hunian": data.status_hunian,
        "nama_pj_lokasi": data.nama_pj_lokasi, "no_hp_pj_lokasi": data.no_hp_pj_lokasi,
        "data_consent": True, "data_consent_at": now_iso(),
        "foto_ktp_path": ktp_path,
        "updated_at": now_iso(),
    }
    if customer:
        await db.customers.update_one({"id": customer["id"]}, {"$set": cust_fields})
        return customer["id"]
    customer_id = new_id()
    await db.customers.insert_one({
        "id": customer_id, "nik": None, **cust_fields,
        "created_at": now_iso(), "deleted_at": None,
    })
    return customer_id


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
    invoice = await db.invoices.find_one({"order_id": order["id"], "jenis": "first"}, {"_id": 0, "status": 1}) or \
        await db.invoices.find_one({"order_id": order["id"]}, {"_id": 0, "status": 1})
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
        "perpanjangan": order.get("perpanjangan"),
    }


# ---------- Akses penuh (kode + no WA / email) ----------

class AccessBody(BaseModel):
    kode: str
    kontak: str


async def full_access_payload(order, customer):
    contract = await db.contracts.find_one({"order_id": order["id"]}, {"_id": 0})
    invoices = await db.invoices.find({"order_id": order["id"]}, {"_id": 0}).sort([("jenis", 1), ("periode", 1)]).to_list(50)
    first_invoice = next((i for i in invoices if i.get("jenis") == "first"), invoices[0] if invoices else None)
    invoice_ids = [i["id"] for i in invoices]
    payments = await db.payments.find({"invoice_id": {"$in": invoice_ids}}, {"_id": 0}).sort("created_at", -1).to_list(50) if invoice_ids else []
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
        "perpanjangan": order.get("perpanjangan"),
        "contract_status": order.get("contract_status", "none"),
        "lokasi_detail": order.get("lokasi_detail"),
        "contract": contract,
        "invoice": first_invoice,
        "invoices": invoices,
        "payments": payments,
        "schedules": schedules,
        "schedule_request": req,
    }


@router.post("/api/public/access")
async def access_detail(body: AccessBody):
    order, customer = await verify_public_access(body.kode, body.kontak)
    return await full_access_payload(order, customer)


# ---------- Kontrak digital: unduh template terisi + upload PDF bertanda tangan ----------

@router.get("/api/public/contract/download")
async def download_contract(kode: str, kontak: str):
    order, customer = await verify_public_access(kode, kontak)
    contract = await db.contracts.find_one({"order_id": order["id"]})
    if not contract:
        raise HTTPException(status_code=400, detail="Kontrak belum diterbitkan (menunggu verifikasi admin)")
    data = generate_contract_docx(order, customer, contract)
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="Kontrak-{order["kode"]}.docx"'},
    )


@router.post("/api/public/contract/upload")
async def upload_signed_contract(kode: str = Form(...), kontak: str = Form(...), dokumen: UploadFile = File(...)):
    order, customer = await verify_public_access(kode, kontak)
    contract = await db.contracts.find_one({"order_id": order["id"]})
    if not contract:
        raise HTTPException(status_code=400, detail="Kontrak belum diterbitkan (menunggu verifikasi admin)")
    if contract["status"] == "signed":
        raise HTTPException(status_code=400, detail="Kontrak sudah ditandatangani")
    pdf_path = await save_pdf(db, dokumen, "kontrak")
    await db.contracts.update_one(
        {"id": contract["id"]},
        {"$set": {"status": "signed", "signer_name": customer.get("nama"), "signed_at": now_iso(), "pdf_path": pdf_path}},
    )
    await db.rental_orders.update_one({"id": order["id"]}, {"$set": {"contract_status": "signed", "updated_at": now_iso()}})
    await db.rental_orders.update_one(
        {"id": order["id"]},
        {"$push": {"status_history": {"status": order["status"], "at": now_iso(), "by": customer.get("nama", "customer"), "catatan": "Kontrak bertanda tangan diunggah (PDF)"}}},
    )
    return {"ok": True}


class SignBody(BaseModel):
    kode: str
    kontak: str
    signer_name: str = Field(min_length=3, max_length=100)


@router.post("/api/public/contract/sign")
async def sign_contract(body: SignBody, request: Request):
    # Legacy: tetap didukung untuk order lama; flow baru menggunakan download + upload PDF
    order, customer = await verify_public_access(body.kode, body.kontak)
    contract = await db.contracts.find_one({"order_id": order["id"]})
    if not contract:
        raise HTTPException(status_code=400, detail="Kontrak belum diterbitkan (menunggu verifikasi admin)")
    if contract["status"] == "signed":
        raise HTTPException(status_code=400, detail="Kontrak sudah ditandatangani")
    ip = (request.headers.get("x-forwarded-for") or "").split(",")[0].strip() or (request.client.host if request.client else "unknown")
    await db.contracts.update_one(
        {"id": contract["id"]},
        {"$set": {"status": "signed", "signer_name": body.signer_name, "signed_at": now_iso(), "signer_ip": ip}},
    )
    await db.rental_orders.update_one({"id": order["id"]}, {"$set": {"contract_status": "signed", "updated_at": now_iso()}})
    return {"ok": True}


# ---------- Form lanjutan: detail lokasi (foto indoor + outdoor + perkiraan pipa) ----------

@router.post("/api/public/location-detail")
async def location_detail(
    kode: str = Form(...),
    kontak: str = Form(...),
    ket_indoor: str = Form(...),
    ket_outdoor: str = Form(...),
    perkiraan_pipa: float = Form(0),
    foto_indoor: UploadFile = File(...),
    foto_outdoor: UploadFile = File(...),
):
    order, customer = await verify_public_access(kode, kontak)
    if order.get("contract_status") != "signed":
        raise HTTPException(status_code=400, detail="Tandatangani kontrak terlebih dahulu")
    if len(ket_indoor.strip()) < 3 or len(ket_outdoor.strip()) < 3:
        raise HTTPException(status_code=400, detail="Keterangan foto indoor dan outdoor wajib diisi")
    p1 = await save_image(db, foto_indoor, "lokasi")
    p2 = await save_image(db, foto_outdoor, "lokasi")
    detail = {
        "foto_indoor_path": p1,
        "ket_indoor": ket_indoor.strip(),
        "foto_outdoor_path": p2,
        "ket_outdoor": ket_outdoor.strip(),
        "perkiraan_pipa_meter": perkiraan_pipa,
        "updated_at": now_iso(),
    }
    await db.rental_orders.update_one({"id": order["id"]}, {"$set": {"lokasi_detail": detail, "updated_at": now_iso()}})
    return {"ok": True}


# ---------- Slot teknisi tersedia ----------

@router.get("/api/public/slots")
async def available_slots(tanggal: str):
    try:
        d = datetime.strptime(tanggal, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Format tanggal tidak valid")
    if d < datetime.now(timezone.utc).date():
        raise HTTPException(status_code=400, detail="Tanggal tidak boleh di masa lalu")
    tech_ids = {u["id"] for u in await db.users.find({"role": "technician"}, {"_id": 0, "id": 1}).to_list(100)}
    if not tech_ids:
        return {"tanggal": tanggal, "slots": []}
    taken = await db.schedules.find({"tanggal": tanggal, "status": "planned", "technician_id": {"$in": list(tech_ids)}}, {"_id": 0, "jam": 1}).to_list(500)
    per_jam = {}
    for t in taken:
        per_jam[t["jam"]] = per_jam.get(t["jam"], 0) + 1
    return {
        "tanggal": tanggal,
        "slots": [{"jam": j, "tersedia": per_jam.get(j, 0) < len(tech_ids)} for j in SLOT_TIMES],
    }


# ---------- Usulan jadwal (delivery: tanggal saja / installation: pilih slot) ----------

class ScheduleRequestBody(BaseModel):
    kode: str
    kontak: str
    tanggal: str
    jam: Optional[str] = ""
    jenis: str = "delivery"
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
    if body.jenis == "delivery":
        if not order.get("lokasi_detail"):
            raise HTTPException(status_code=400, detail="Isi form detail lokasi terlebih dahulu")
        if order["status"] != "verified":
            raise HTTPException(status_code=400, detail=f"Pengajuan berstatus {order['status']}, tidak dapat mengusulkan jadwal pengiriman")
    elif body.jenis == "installation":
        if order["status"] != "delivered":
            raise HTTPException(status_code=400, detail="Jadwal instalasi dapat dipilih setelah unit diterima")
        if body.jam not in SLOT_TIMES:
            raise HTTPException(status_code=400, detail="Pilih slot jam yang tersedia")
        slots = await available_slots(body.tanggal)
        slot = next((s for s in slots["slots"] if s["jam"] == body.jam), None)
        if not slot or not slot["tersedia"]:
            raise HTTPException(status_code=400, detail="Slot tersebut sudah penuh, pilih slot lain")
    else:
        raise HTTPException(status_code=400, detail="Jenis jadwal tidak valid")

    await db.schedule_requests.update_many(
        {"order_id": order["id"], "status": "pending", "jenis": body.jenis},
        {"$set": {"status": "replaced"}},
    )
    doc = {
        "id": new_id(), "order_id": order["id"], "kode": order["kode"],
        "tanggal": body.tanggal, "jam": body.jam or "", "jenis": body.jenis,
        "catatan": body.catatan or "", "status": "pending", "created_at": now_iso(),
    }
    await db.schedule_requests.insert_one(doc)
    doc.pop("_id", None)
    return doc


# ---------- Perpanjangan sewa (open-ended) ----------

class ExtendBody(BaseModel):
    kode: str
    kontak: str
    lanjut: bool


@router.post("/api/public/extend")
async def extend_rental(body: ExtendBody):
    order, customer = await verify_public_access(body.kode, body.kontak)
    if order["status"] not in ("active", "maintenance"):
        raise HTTPException(status_code=400, detail="Perpanjangan hanya tersedia saat masa sewa aktif")
    if order.get("perpanjangan") == "open_ended":
        raise HTTPException(status_code=400, detail="Perpanjangan sudah dikonfirmasi sebelumnya")
    value = "open_ended" if body.lanjut else "berakhir_sesuai_jadwal"
    note = "Customer mengonfirmasi LANJUT menyewa (tagihan bulanan berlanjut otomatis tanpa batas durasi)" if body.lanjut else "Customer memilih sewa berakhir sesuai jadwal"
    await db.rental_orders.update_one({"id": order["id"]}, {"$set": {"perpanjangan": value, "updated_at": now_iso()}})
    await db.rental_orders.update_one(
        {"id": order["id"]},
        {"$push": {"status_history": {"status": order["status"], "at": now_iso(), "by": customer.get("nama", "customer"), "catatan": note}}},
    )
    await notify_event(order["id"], "extension_confirmed", {"lanjut": body.lanjut})
    return {"ok": True, "perpanjangan": value}


# ---------- Upload bukti pembayaran ----------

@router.post("/api/public/payments/upload")
async def upload_payment(
    kode: str = Form(...),
    kontak: str = Form(...),
    invoice_id: str = Form(""),
    catatan: str = Form(""),
    bukti: UploadFile = File(...),
):
    order, customer = await verify_public_access(kode, kontak)
    if invoice_id:
        invoice = await db.invoices.find_one({"id": invoice_id, "order_id": order["id"]})
    else:
        invoice = await db.invoices.find_one({"order_id": order["id"], "jenis": "first"}) or \
            await db.invoices.find_one({"order_id": order["id"]})
    if not invoice:
        raise HTTPException(status_code=400, detail="Invoice belum diterbitkan (menunggu instalasi selesai)")
    if invoice["status"] not in ("issued", "payment_rejected", "overdue"):
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
