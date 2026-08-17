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


async def run_billing_cycle(run_id: str):
    today = date.fromisoformat(today_str())
    stats = {"issued": 0, "reminders": 0, "overdue": 0}

    # 1. Terbitkan tagihan bulanan yang sudah jatuh pada/pada tanggal tagih
    due_invoices = await db.invoices.find({"jenis": "monthly", "status": "scheduled", "bill_date": {"$lte": today.isoformat()}}, {"_id": 0}).to_list(500)
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
        stats["issued"] += 1

    # 2. Reminder H-3 dan hari-H untuk invoice issued belum lunas
    pending = await db.invoices.find({"status": "issued"}, {"_id": 0}).to_list(1000)
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

    logger.info("Billing cycle %s done: %s", run_id, stats)
