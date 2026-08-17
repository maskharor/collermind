from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form

from core import (
    db, now_iso, new_id, require_role, set_order_status, set_units_status,
    order_unit_ids, hitung_extra_pipa, create_invoice_for_order,
)
from storage import save_image
from notify import notify_event

router = APIRouter(prefix="/api/tech", tags=["technician"])
Tech = Depends(require_role("technician"))


async def _enrich(s):
    o = await db.rental_orders.find_one({"id": s["rental_order_id"]}, {"_id": 0})
    c = await db.customers.find_one({"id": o["customer_id"]}, {"_id": 0, "nama": 1, "no_hp": 1, "alamat_pemasangan": 1}) if o else None
    s["kode"] = o["kode"] if o else "-"
    s["order_status"] = o["status"] if o else "-"
    s["customer_nama"] = c["nama"] if c else "-"
    s["customer_no_hp"] = c["no_hp"] if c else "-"
    s["alamat_pemasangan"] = c["alamat_pemasangan"] if c else "-"
    s["lokasi_detail"] = o.get("lokasi_detail") if o else None
    return s


@router.get("/schedules")
async def my_schedules(scope: Optional[str] = None, user=Tech):
    q = {"technician_id": user["id"], "jenis_kegiatan": {"$ne": "delivery"}}
    if scope == "today":
        q["tanggal"] = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    schedules = await db.schedules.find(q, {"_id": 0}).sort([("tanggal", 1), ("jam", 1)]).to_list(300)
    return [await _enrich(s) for s in schedules]


@router.get("/schedules/{sid}")
async def schedule_detail(sid: str, user=Tech):
    s = await db.schedules.find_one({"id": sid, "technician_id": user["id"]}, {"_id": 0})
    if not s:
        raise HTTPException(status_code=404, detail="Jadwal tidak ditemukan")
    order = await db.rental_orders.find_one({"id": s["rental_order_id"]}, {"_id": 0, "ip": 0})
    customer = await db.customers.find_one({"id": order["customer_id"]}, {"_id": 0, "foto_ktp_path": 0}) if order else None
    unit_ids = order_unit_ids(order) if order else []
    units = await db.air_conditioners.find({"id": {"$in": unit_ids}}, {"_id": 0}).to_list(100) if unit_ids else []
    return {"schedule": s, "order": order, "customer": customer, "units": units}


@router.post("/schedules/{sid}/submit")
async def submit_work(
    sid: str,
    hasil: str = Form(""),
    kondisi: str = Form(""),
    jenis_maintenance: str = Form(""),
    denda: float = Form(0),
    total_pipa: float = Form(0),
    ducttape_terpakai: str = Form(""),
    kabel_terpakai: str = Form(""),
    helper: str = Form(""),
    koordinat: str = Form(""),
    edukasi_customer: str = Form(""),
    catatan: str = Form(""),
    foto: Optional[UploadFile] = File(None),
    user=Tech,
):
    s = await db.schedules.find_one({"id": sid, "technician_id": user["id"]}, {"_id": 0})
    if not s:
        raise HTTPException(status_code=404, detail="Jadwal tidak ditemukan")
    if s["status"] == "done":
        raise HTTPException(status_code=400, detail="Pekerjaan sudah diselesaikan")
    order = await db.rental_orders.find_one({"id": s["rental_order_id"]}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order tidak ditemukan")
    customer = await db.customers.find_one({"id": order["customer_id"]}, {"_id": 0})

    foto_path = await save_image(db, foto, "pekerjaan") if foto and foto.filename else None
    jenis = s["jenis_kegiatan"]
    base = {
        "id": new_id(), "rental_order_id": order["id"], "technician_id": user["id"],
        "tanggal": now_iso(), "foto": foto_path, "catatan": catatan, "created_at": now_iso(),
    }
    unit_ids = order_unit_ids(order)

    if jenis == "delivery":
        # Legacy: pengiriman kini tugas kurir; tetap dukung jika admin assign ke teknisi lama
        if order["status"] != "scheduled":
            raise HTTPException(status_code=400, detail=f"Order berstatus {order['status']}, belum siap dikirim")
        await db.deliveries.insert_one({**base, "status": "delivered", "kondisi_unit": kondisi})
        await set_order_status(order["id"], "delivered", user["name"], catatan)
        await notify_event(order["id"], "delivery_done")
    elif jenis == "installation":
        if order["status"] not in ("delivered", "scheduled"):
            raise HTTPException(status_code=400, detail=f"Order berstatus {order['status']}, belum siap instalasi")
        if total_pipa <= 0:
            raise HTTPException(status_code=400, detail="Panjang pipa aktual wajib diisi (meter)")
        extra_meter, extra_cost = hitung_extra_pipa(total_pipa)
        await db.installations.insert_one({
            **base, "hasil": hasil or "berhasil", "kondisi_instalasi": kondisi,
            "total_pipa_meter": total_pipa, "extra_pipa_meter": extra_meter, "biaya_extra_pipa": extra_cost,
            "ducttape_terpakai": ducttape_terpakai, "kabel_terpakai": kabel_terpakai,
            "helper": helper, "koordinat": koordinat, "edukasi_customer": edukasi_customer,
        })
        await set_units_status(unit_ids, "rented")
        await set_order_status(order["id"], "installed", user["name"], catatan)
        invoice = await create_invoice_for_order(order, customer or {}, total_pipa)
        await db.rental_orders.update_one(
            {"id": order["id"]},
            {"$set": {"total_biaya": invoice["total"], "updated_at": now_iso()},
             "$push": {"status_history": {"status": "installed", "at": now_iso(), "by": "system", "catatan": f"Invoice {invoice['nomor']} diterbitkan — menunggu pembayaran customer"}}},
        )
        await notify_event(order["id"], "invoice_issued", {"invoice": invoice})
    elif jenis == "maintenance":
        if order["status"] not in ("active", "maintenance"):
            raise HTTPException(status_code=400, detail=f"Order berstatus {order['status']}, tidak dalam masa sewa")
        await db.maintenances.insert_one({**base, "jenis_maintenance": jenis_maintenance or "rutin", "hasil": hasil, "kondisi_unit": kondisi})
        await set_order_status(order["id"], "maintenance", user["name"], jenis_maintenance or "maintenance")
        await set_order_status(order["id"], "active", "system", "Maintenance selesai, sewa aktif kembali")
    elif jenis in ("dismantling", "return"):
        if order["status"] not in ("active", "maintenance"):
            raise HTTPException(status_code=400, detail=f"Order berstatus {order['status']}, tidak dapat dikembalikan")
        await db.returns.insert_one({**base, "kondisi_unit": kondisi, "denda": denda})
        await db.rental_orders.update_one({"id": order["id"]}, {"$set": {"denda": denda, "updated_at": now_iso()}})
        await set_order_status(order["id"], "returned", user["name"], catatan)
    elif jenis == "inspection":
        pass
    else:
        raise HTTPException(status_code=400, detail="Jenis kegiatan tidak valid")

    await db.schedules.update_one({"id": sid}, {"$set": {"status": "done"}})
    return {"ok": True}
