import hmac
import os
import logging
from datetime import date, timedelta

from fastapi import APIRouter, Request, HTTPException, BackgroundTasks

from core import db, now_iso, today_str
from notify import notify_event

logger = logging.getLogger(__name__)
router = APIRouter(tags=["cron"])


@router.post("/api/cron/billing")
async def cron_billing(request: Request, background_tasks: BackgroundTasks):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    secret = os.environ.get("WEBHOOK_CRON_SECRET", "")
    auth = request.headers.get("Authorization", "")
    token = auth[7:] if auth.startswith("Bearer ") else ""
    if not secret or not hmac.compare_digest(token, secret):
        raise HTTPException(status_code=401, detail="Unauthorized")
    try:
        envelope = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid body")
    run_id = envelope.get("run_id") or request.headers.get("X-Webhook-Id") or f"manual-{now_iso()}"
    if await db.cron_runs.find_one({"run_id": run_id}):
        return {"ok": True, "deduplicated": True}
    await db.cron_runs.insert_one({"run_id": run_id, "at": now_iso()})
    background_tasks.add_task(run_billing_cycle, run_id)
    return {"ok": True, "run_id": run_id}


async def _issue_due_monthly_invoices(today: date) -> int:
    due_invoices = await db.invoices.find({"jenis": "monthly", "status": "scheduled", "bill_date": {"$lte": today.isoformat()}}, {"_id": 0}).to_list(500)
    issued = 0
    for inv in due_invoices:
        order = await db.rental_orders.find_one({"id": inv["order_id"], "deleted_at": None, "status": {"$in": ["active", "maintenance"]}}, {"_id": 0, "id": 1})
        if not order:
            continue
        await db.invoices.update_one({"id": inv["id"]}, {"$set": {"status": "issued", "issued_at": now_iso(), "updated_at": now_iso()}})
        inv["status"] = "issued"
        try:
            await notify_event(inv["order_id"], "monthly_issued", {"invoice": inv, "dedupe": f"monthly-{inv['id']}"})
        except Exception as e:
            logger.error("Notify monthly_issued gagal untuk invoice %s: %s", inv["id"], e)
        issued += 1
    return issued


async def _process_invoice_reminders(today: date) -> dict:
    pending = await db.invoices.find({"status": "issued"}, {"_id": 0}).to_list(1000)
    stats = {"reminders": 0, "overdue": 0}
    for inv in pending:
        try:
            due = date.fromisoformat(inv["due_date"])
        except Exception:
            continue
        delta = (due - today).days
        kind = None
        if delta == 3:
            kind = "H-3"
        elif delta == 0:
            kind = "hari-H"
        elif delta < 0:
            await db.invoices.update_one({"id": inv["id"], "status": "issued"}, {"$set": {"status": "overdue", "updated_at": now_iso()}})
            kind = "terlambat"
            stats["overdue"] += 1
        if kind:
            dedupe = f"reminder-{inv['id']}-{kind}-{today.isoformat()}"
            inv2 = dict(inv)
            if delta < 0:
                inv2["status"] = "overdue"
            try:
                await notify_event(inv["order_id"], "reminder", {"invoice": inv2, "kind": kind, "dedupe": dedupe})
            except Exception as e:
                logger.error("Notify reminder gagal untuk invoice %s: %s", inv["id"], e)
            stats["reminders"] += 1
    return stats


async def _next_openended_invoice(order: dict, today: date) -> bool:
    from core import add_months, sewa_bulanan, get_bank_accounts, detect_region, new_id
    has_future = await db.invoices.find_one({"order_id": order["id"], "jenis": "monthly", "bill_date": {"$gt": today.isoformat()}})
    if has_future:
        return False
    last = await db.invoices.find({"order_id": order["id"], "jenis": "monthly"}, {"_id": 0}).sort("periode", -1).to_list(1)
    if last:
        next_periode = last[0]["periode"] + 1
        next_bill = add_months(date.fromisoformat(last[0]["bill_date"]), 1)
    else:
        next_periode = 2
        next_bill = add_months(date.fromisoformat(order["tanggal_mulai"]), 1)
    customer = await db.customers.find_one({"id": order["customer_id"]}, {"_id": 0})
    sewa = sewa_bulanan(order)
    region_key, region_label = detect_region((customer or {}).get("alamat_pemasangan", ""))
    accounts = await get_bank_accounts()
    await db.invoices.insert_one({
        "id": new_id(), "nomor": f"INV-{order['kode']}-B{next_periode:02d}",
        "order_id": order["id"], "kode": order["kode"], "jenis": "monthly", "periode": next_periode,
        "items": [{"label": f"Sewa bulan ke-{next_periode} (perpanjangan)", "amount": sewa}],
        "total": sewa, "status": "scheduled",
        "rekening": accounts.get(region_key) or accounts["default"], "region": region_label,
        "bill_date": next_bill.isoformat(), "due_date": (next_bill + timedelta(days=7)).isoformat(),
        "issued_at": None, "created_at": now_iso(), "updated_at": now_iso(),
    })
    return True


async def _extend_open_ended_orders(today: date) -> int:
    orders = await db.rental_orders.find(
        {"perpanjangan": "open_ended", "status": {"$in": ["active", "maintenance"]}, "deleted_at": None}, {"_id": 0}
    ).to_list(500)
    created = 0
    for order in orders:
        try:
            if await _next_openended_invoice(order, today):
                created += 1
        except Exception as e:
            logger.error("Open-ended billing gagal untuk order %s: %s", order.get("kode"), e)
    return created


async def run_billing_cycle(run_id: str):
    today = date.fromisoformat(today_str())
    stats = {
        "issued": await _issue_due_monthly_invoices(today),
        "extended": await _extend_open_ended_orders(today),
    }
    stats.update(await _process_invoice_reminders(today))
    logger.info("Billing cycle %s done: %s", run_id, stats)
