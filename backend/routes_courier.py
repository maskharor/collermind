from typing import Optional

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form

from core import db, now_iso, new_id, require_role, set_order_status, order_unit_ids
from storage import save_image
from notify import notify_event

router = APIRouter(prefix="/api/courier", tags=["courier"])
Courier = Depends(require_role("courier"))


async def _enrich(s):
    o = await db.rental_orders.find_one({"id": s["rental_order_id"]}, {"_id": 0})
    c = await db.customers.find_one({"id": o["customer_id"]}, {"_id": 0, "nama": 1, "no_hp": 1, "alamat_pemasangan": 1}) if o else None
    s["kode"] = o["kode"] if o else "-"
    s["order_status"] = o["status"] if o else "-"
    s["customer_nama"] = c["nama"] if c else "-"
    s["customer_no_hp"] = c["no_hp"] if c else "-"
    s["alamat_pemasangan"] = c["alamat_pemasangan"] if c else "-"
    return s


@router.get("/schedules")
async def my_deliveries(scope: Optional[str] = None, user=Courier):
    from datetime import datetime, timezone
    q = {"technician_id": user["id"], "jenis_kegiatan": "delivery"}
    if scope == "today":
        q["tanggal"] = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    schedules = await db.schedules.find(q, {"_id": 0}).sort([("tanggal", 1), ("jam", 1)]).to_list(300)
    return [await _enrich(s) for s in schedules]


@router.get("/schedules/{sid}")
async def delivery_detail(sid: str, user=Courier):
    s = await db.schedules.find_one({"id": sid, "technician_id": user["id"], "jenis_kegiatan": "delivery"}, {"_id": 0})
    if not s:
        raise HTTPException(status_code=404, detail="Tugas pengiriman tidak ditemukan")
    order = await db.rental_orders.find_one({"id": s["rental_order_id"]}, {"_id": 0, "ip": 0})
    customer = await db.customers.find_one({"id": order["customer_id"]}, {"_id": 0, "foto_ktp_path": 0}) if order else None
    unit_ids = order_unit_ids(order) if order else []
    units = await db.air_conditioners.find({"id": {"$in": unit_ids}}, {"_id": 0}).to_list(100) if unit_ids else []
    return {"schedule": s, "order": order, "customer": customer, "units": units}


@router.post("/schedules/{sid}/submit")
async def submit_delivery(
    sid: str,
    kondisi: str = Form(""),
    catatan: str = Form(""),
    foto_surat_jalan: UploadFile = File(...),
    foto_serah_terima: UploadFile = File(...),
    user=Courier,
):
    s = await db.schedules.find_one({"id": sid, "technician_id": user["id"], "jenis_kegiatan": "delivery"}, {"_id": 0})
    if not s:
        raise HTTPException(status_code=404, detail="Tugas pengiriman tidak ditemukan")
    if s["status"] == "done":
        raise HTTPException(status_code=400, detail="Pengiriman sudah diselesaikan")
    order = await db.rental_orders.find_one({"id": s["rental_order_id"]}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order tidak ditemukan")
    if order["status"] != "scheduled":
        raise HTTPException(status_code=400, detail=f"Order berstatus {order['status']}, belum siap dikirim")

    p1 = await save_image(db, foto_surat_jalan, "delivery")
    p3 = await save_image(db, foto_serah_terima, "delivery")

    await db.deliveries.insert_one({
        "id": new_id(), "rental_order_id": order["id"], "technician_id": user["id"],
        "courier_id": user["id"], "tanggal": now_iso(), "status": "delivered",
        "kondisi_unit": kondisi, "catatan": catatan,
        "foto": p3, "foto_surat_jalan": p1, "foto_serah_terima": p3,
        "created_at": now_iso(),
    })
    await db.schedules.update_one({"id": sid}, {"$set": {"status": "done"}})
    await set_order_status(order["id"], "delivered", user["name"], catatan)
    await notify_event(order["id"], "delivery_done")
    return {"ok": True}
