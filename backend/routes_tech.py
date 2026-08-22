from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends, UploadFile, Request

from core import (
    db, now_iso, new_id, require_role, set_order_status, set_units_status,
    order_unit_ids, hitung_extra_pipa, create_invoice_for_order,
)
from storage import save_image
from notify import notify_event

router = APIRouter(prefix="/api/tech", tags=["technician"])
Tech = Depends(require_role("technician"))


async def _enrich(s: dict) -> dict:
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
async def my_schedules(scope: Optional[str] = None, user=Tech) -> list:
    q = {"technician_id": user["id"], "jenis_kegiatan": {"$ne": "delivery"}}
    if scope == "today":
        q["tanggal"] = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    schedules = await db.schedules.find(q, {"_id": 0}).sort([("tanggal", 1), ("jam", 1)]).to_list(300)
    return [await _enrich(s) for s in schedules]


@router.get("/schedules/{sid}")
async def schedule_detail(sid: str, user=Tech) -> dict:
    s = await db.schedules.find_one({"id": sid, "technician_id": user["id"]}, {"_id": 0})
    if not s:
        raise HTTPException(status_code=404, detail="Jadwal tidak ditemukan")
    order = await db.rental_orders.find_one({"id": s["rental_order_id"]}, {"_id": 0, "ip": 0})
    customer = await db.customers.find_one({"id": order["customer_id"]}, {"_id": 0, "foto_ktp_path": 0}) if order else None
    unit_ids = order_unit_ids(order) if order else []
    units = await db.air_conditioners.find({"id": {"$in": unit_ids}}, {"_id": 0}).to_list(100) if unit_ids else []
    return {"schedule": s, "order": order, "customer": customer, "units": units}


async def _work_delivery(order: dict, base: dict, kondisi: str, user: dict) -> None:
    # Legacy: pengiriman kini tugas kurir; tetap dukung jika admin assign ke teknisi lama
    if order["status"] != "scheduled":
        raise HTTPException(status_code=400, detail=f"Order berstatus {order['status']}, belum siap dikirim")
    await db.deliveries.insert_one({**base, "status": "delivered", "kondisi_unit": kondisi})
    await set_order_status(order["id"], "delivered", user["name"], base["catatan"])
    await notify_event(order["id"], "delivery_done")


async def _work_installation(order: dict, customer: dict, base: dict, unit_ids: list, form: dict, foto_paths: list, user: dict) -> None:
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


async def _work_maintenance(order: dict, base: dict, form: dict, user: dict) -> None:
    if order["status"] not in ("active", "maintenance"):
        raise HTTPException(status_code=400, detail=f"Order berstatus {order['status']}, tidak dalam masa sewa")
    await db.maintenances.insert_one({**base, "jenis_maintenance": form["jenis_maintenance"] or "rutin", "hasil": form["hasil"], "kondisi_unit": form["kondisi"]})
    await set_order_status(order["id"], "maintenance", user["name"], form["jenis_maintenance"] or "maintenance")
    await set_order_status(order["id"], "active", "system", "Maintenance selesai, sewa aktif kembali")


async def _work_return(order: dict, base: dict, form: dict, user: dict) -> None:
    if order["status"] not in ("active", "maintenance"):
        raise HTTPException(status_code=400, detail=f"Order berstatus {order['status']}, tidak dapat dikembalikan")
    await db.returns.insert_one({**base, "kondisi_unit": form["kondisi"], "denda": form["denda"]})
    await db.rental_orders.update_one({"id": order["id"]}, {"$set": {"denda": form["denda"], "updated_at": now_iso()}})
    await set_order_status(order["id"], "returned", user["name"], base["catatan"])


async def _load_work_context(sid: str, user: dict):
    s = await db.schedules.find_one({"id": sid, "technician_id": user["id"]}, {"_id": 0})
    if not s:
        raise HTTPException(status_code=404, detail="Jadwal tidak ditemukan")
    if s["status"] == "done":
        raise HTTPException(status_code=400, detail="Pekerjaan sudah diselesaikan")
    order = await db.rental_orders.find_one({"id": s["rental_order_id"]}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order tidak ditemukan")
    customer = await db.customers.find_one({"id": order["customer_id"]}, {"_id": 0})
    return s, order, customer


def _form_str(form_data, key: str) -> str:
    value = form_data.get(key)
    return "" if value in (None, "") or hasattr(value, "filename") else str(value)


def _form_float(form_data, key: str) -> float:
    try:
        return float(_form_str(form_data, key) or 0)
    except ValueError:
        return 0


@dataclass
class WorkFormData:
    hasil: str = ""
    kondisi: str = ""
    jenis_maintenance: str = ""
    denda: float = 0
    pipa_dibawa: float = 0
    pipa_terpakai: float = 0
    ducttape_terpakai: str = ""
    kabel_terpakai: str = ""
    helper: str = ""
    koordinat_sesuai: str = ""
    edukasi_customer: str = ""
    catatan: str = ""

    @classmethod
    def from_form(cls, form_data) -> "WorkFormData":
        return cls(
            hasil=_form_str(form_data, "hasil"),
            kondisi=_form_str(form_data, "kondisi"),
            jenis_maintenance=_form_str(form_data, "jenis_maintenance"),
            denda=_form_float(form_data, "denda"),
            pipa_dibawa=_form_float(form_data, "pipa_dibawa"),
            pipa_terpakai=_form_float(form_data, "pipa_terpakai"),
            ducttape_terpakai=_form_str(form_data, "ducttape_terpakai"),
            kabel_terpakai=_form_str(form_data, "kabel_terpakai"),
            helper=_form_str(form_data, "helper"),
            koordinat_sesuai=_form_str(form_data, "koordinat_sesuai"),
            edukasi_customer=_form_str(form_data, "edukasi_customer"),
            catatan=_form_str(form_data, "catatan"),
        )

    def as_dict(self) -> dict:
        return self.__dict__


async def _primary_work_photo(foto: Optional[UploadFile], foto_paths: list) -> Optional[str]:
    foto_path = await save_image(db, foto, "pekerjaan") if foto and foto.filename else None
    if foto_paths and not foto_path:
        return foto_paths[0]
    return foto_path


def _work_base(order: dict, user: dict, catatan: str, foto_path: Optional[str]) -> dict:
    return {
        "id": new_id(), "rental_order_id": order["id"], "technician_id": user["id"],
        "tanggal": now_iso(), "foto": foto_path, "catatan": catatan, "created_at": now_iso(),
    }


async def _dispatch_work(jenis: str, order: dict, customer: dict, base: dict, form: dict, foto_paths: list, user: dict) -> None:
    unit_ids = order_unit_ids(order)
    if jenis == "delivery":
        await _work_delivery(order, base, form["kondisi"], user)
    elif jenis == "installation":
        await _work_installation(order, customer, base, unit_ids, form, foto_paths, user)
    elif jenis == "maintenance":
        await _work_maintenance(order, base, form, user)
    elif jenis in ("dismantling", "return"):
        await _work_return(order, base, form, user)
    elif jenis != "inspection":
        raise HTTPException(status_code=400, detail="Jenis kegiatan tidak valid")


async def _save_installation_photos_from_form(form_data, jenis: str) -> list:
    if jenis != "installation":
        return []
    from storage import MAX_DOC_PHOTO_SIZE
    paths = []
    for f in form_data.getlist("fotos"):
        if getattr(f, "filename", None):
            paths.append(await save_image(db, f, "pekerjaan", max_size=MAX_DOC_PHOTO_SIZE))
    return paths


@router.post("/schedules/{sid}/submit")
async def submit_work(sid: str, request: Request, user=Tech) -> dict:
    s, order, customer = await _load_work_context(sid, user)
    jenis = s["jenis_kegiatan"]
    form_data = await request.form()
    form = WorkFormData.from_form(form_data)
    foto_paths = await _save_installation_photos_from_form(form_data, jenis)
    foto = form_data.get("foto")
    foto_path = await _primary_work_photo(foto if isinstance(foto, UploadFile) else None, foto_paths)
    base = _work_base(order, user, form.catatan, foto_path)
    await _dispatch_work(jenis, order, customer, base, form.as_dict(), foto_paths, user)
    await db.schedules.update_one({"id": sid}, {"$set": {"status": "done"}})
    return {"ok": True}
