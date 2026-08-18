from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form, Request

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


async def _work_delivery(order: dict, base: dict, kondisi: str, user: dict):
    # Legacy: pengiriman kini tugas kurir; tetap dukung jika admin assign ke teknisi lama
    if order["status"] != "scheduled":
        raise HTTPException(status_code=400, detail=f"Order berstatus {order['status']}, belum siap dikirim")
    await db.deliveries.insert_one({**base, "status": "delivered", "kondisi_unit": kondisi})
    await set_order_status(order["id"], "delivered", user["name"], base["catatan"])
    await notify_event(order["id"], "delivery_done")


async def _work_installation(order: dict, customer: dict, base: dict, unit_ids: list, form: dict, foto_paths: list, user: dict):
    if order["status"] not in ("delivered", "scheduled"):
        raise HTTPException(status_code=400, detail=f"Order berstatus {order['status']}, belum siap instalasi")
    pipa_terpakai = form["pipa_terpakai"]
    if pipa_terpakai <= 0:
        raise HTTPException(status_code=400, detail="Panjang pipa terpakai wajib diisi (meter)")
    extra_meter, extra_cost = hitung_extra_pipa(pipa_terpakai)
    await db.installations.insert_one({
        **base, "hasil": form["hasil"] or "berhasil", "kondisi_instalasi": form["kondisi"],
        "pipa_dibawa_meter": form["pipa_dibawa"], "pipa_terpakai_meter": pipa_terpakai,
        "total_pipa_meter": pipa_terpakai,
        "extra_pipa_meter": extra_meter, "biaya_extra_pipa": extra_cost,
        "ducttape_terpakai": form["ducttape_terpakai"], "kabel_terpakai": form["kabel_terpakai"],
        "helper": form["helper"], "koordinat_sesuai": form["koordinat_sesuai"], "edukasi_customer": form["edukasi_customer"],
        "fotos": foto_paths,
    })
    await set_units_status(unit_ids, "rented")
    await set_order_status(order["id"], "installed", user["name"], base["catatan"])
    invoice = await create_invoice_for_order(order, customer or {}, pipa_terpakai)
    await db.rental_orders.update_one(
        {"id": order["id"]},
        {"$set": {"total_biaya": invoice["total"], "updated_at": now_iso()},
         "$push": {"status_history": {"status": "installed", "at": now_iso(), "by": "system", "catatan": f"Invoice {invoice['nomor']} diterbitkan — menunggu pembayaran customer"}}},
    )
    await notify_event(order["id"], "invoice_issued", {"invoice": invoice})


async def _work_maintenance(order: dict, base: dict, form: dict, user: dict):
    if order["status"] not in ("active", "maintenance"):
        raise HTTPException(status_code=400, detail=f"Order berstatus {order['status']}, tidak dalam masa sewa")
    await db.maintenances.insert_one({**base, "jenis_maintenance": form["jenis_maintenance"] or "rutin", "hasil": form["hasil"], "kondisi_unit": form["kondisi"]})
    await set_order_status(order["id"], "maintenance", user["name"], form["jenis_maintenance"] or "maintenance")
    await set_order_status(order["id"], "active", "system", "Maintenance selesai, sewa aktif kembali")


async def _work_return(order: dict, base: dict, form: dict, user: dict):
    if order["status"] not in ("active", "maintenance"):
        raise HTTPException(status_code=400, detail=f"Order berstatus {order['status']}, tidak dapat dikembalikan")
    await db.returns.insert_one({**base, "kondisi_unit": form["kondisi"], "denda": form["denda"]})
    await db.rental_orders.update_one({"id": order["id"]}, {"$set": {"denda": form["denda"], "updated_at": now_iso()}})
    await set_order_status(order["id"], "returned", user["name"], base["catatan"])


@router.post("/schedules/{sid}/submit")
async def submit_work(
    sid: str,
    hasil: str = Form(""),
    kondisi: str = Form(""),
    jenis_maintenance: str = Form(""),
    denda: float = Form(0),
    pipa_dibawa: float = Form(0),
    pipa_terpakai: float = Form(0),
    ducttape_terpakai: str = Form(""),
    kabel_terpakai: str = Form(""),
    helper: str = Form(""),
    koordinat_sesuai: str = Form(""),
    edukasi_customer: str = Form(""),
    catatan: str = Form(""),
    foto: Optional[UploadFile] = File(None),
    request: Request = None,
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

    jenis = s["jenis_kegiatan"]
    foto_path = await save_image(db, foto, "pekerjaan") if foto and foto.filename else None
    foto_paths = await _save_installation_photos(request, jenis)
    if foto_paths and not foto_path:
        foto_path = foto_paths[0]

    base = {
        "id": new_id(), "rental_order_id": order["id"], "technician_id": user["id"],
        "tanggal": now_iso(), "foto": foto_path, "catatan": catatan, "created_at": now_iso(),
    }
    form = {
        "hasil": hasil, "kondisi": kondisi, "jenis_maintenance": jenis_maintenance,
        "denda": denda, "pipa_dibawa": pipa_dibawa, "pipa_terpakai": pipa_terpakai,
        "ducttape_terpakai": ducttape_terpakai, "kabel_terpakai": kabel_terpakai,
        "helper": helper, "koordinat_sesuai": koordinat_sesuai, "edukasi_customer": edukasi_customer,
    }
    unit_ids = order_unit_ids(order)

    if jenis == "delivery":
        await _work_delivery(order, base, kondisi, user)
    elif jenis == "installation":
        await _work_installation(order, customer, base, unit_ids, form, foto_paths, user)
    elif jenis == "maintenance":
        await _work_maintenance(order, base, form, user)
    elif jenis in ("dismantling", "return"):
        await _work_return(order, base, form, user)
    elif jenis == "inspection":
        pass
    else:
        raise HTTPException(status_code=400, detail="Jenis kegiatan tidak valid")

    await db.schedules.update_one({"id": sid}, {"$set": {"status": "done"}})
    return {"ok": True}


async def _save_installation_photos(request: Request, jenis: str) -> list:
    if jenis != "installation":
        return []
    from storage import MAX_DOC_PHOTO_SIZE
    form_data = await request.form()
    paths = []
    for f in form_data.getlist("fotos"):
        if getattr(f, "filename", None):
            paths.append(await save_image(db, f, "pekerjaan", max_size=MAX_DOC_PHOTO_SIZE))
    return paths
