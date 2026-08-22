import os
import re
import ipaddress
import logging
from html import escape
from html.parser import HTMLParser
from urllib.parse import urlparse

import httpx

from core import db, now_iso, new_id, rupiah

logger = logging.getLogger(__name__)

EMAIL_BASE_URL = "https://integrations.emergentagent.com"
EMAIL_KEY = os.environ.get("EMERGENT_EMAIL_KEY", "")
EMAIL_FROM_NAME = os.environ.get("EMAIL_FROM_NAME", "CollerMind")
EMAIL_REPLY_TO = os.environ.get("EMAIL_REPLY_TO")
APP_URL = (os.environ.get("FRONTEND_URL") or "").rstrip("/")

# --- Guardrail gate (G2/G3) ---
_SHORTENERS = ("bit.ly", "tinyurl.com", "t.co", "is.gd", "cutt.ly", "goo.gl", "rebrand.ly")
_CRED_ASK = ("reply with your password", "reply with the code", "send your password", "cvv",
             "send us your password", "enter your password below", "confirm your card number",
             "your full card number", "seed phrase", "recovery phrase", "verify your card",
             "social security number", "confirm your bank details")
_HOSTISH = re.compile(r"\b(?:https?://)?((?:[a-z0-9-]+\.)+[a-z]{2,})", re.I)


def _host_ok(host: str) -> bool:
    if not host or "xn--" in host:
        return False
    try:
        ipaddress.ip_address(host)
        return False
    except ValueError:
        pass
    return not any(host == s or host.endswith("." + s) for s in _SHORTENERS)


def _same_site(shown: str, real: str) -> bool:
    return shown == real or real.endswith("." + shown) or shown.endswith("." + real)


class _EmailScan(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags, self.urls, self.anchors = set(), [], []
        self._href, self._text = None, []

    def handle_starttag(self, tag, attrs):
        self.tags.add(tag.lower())
        self.urls += [v for k, v in attrs if k.lower() in ("href", "src") and v]
        if tag.lower() == "a":
            self._href = dict((k.lower(), v) for k, v in attrs).get("href")
            self._text = []

    def handle_data(self, data):
        if isinstance(self._href, str):
            self._text.append(data)

    def handle_endtag(self, tag):
        if tag.lower() == "a" and isinstance(self._href, str):
            self.anchors.append((self._href, "".join(self._text)))
            self._href, self._text = None, []


def _assert_no_form_tags(scan: _EmailScan) -> None:
    if scan.tags & {"form", "input", "textarea", "select"}:
        raise ValueError("No forms or input fields in email (G2)")


def _assert_no_credential_ask(subject: str, html: str) -> None:
    body = f"{subject}\n{html}".lower()
    for phrase in _CRED_ASK:
        if phrase in body:
            raise ValueError(f"Email asks the recipient for credentials: {phrase!r} (G2)")


def _assert_urls_safe(scan: _EmailScan) -> None:
    for url in scan.urls:
        low = url.strip().lower()
        if low.startswith(("mailto:", "tel:", "cid:", "#")):
            continue
        if not low.startswith("https://"):
            raise ValueError(f"Email links/assets must be absolute https: {url!r} (G3)")
        host = urlparse(low).hostname or ""
        if not _host_ok(host) or urlparse(low).username:
            raise ValueError(f"Shortened, numeric-host or credential-bearing URL: {url!r} (G3)")


def _assert_anchor_hosts(scan: _EmailScan) -> None:
    for href, text in scan.anchors:
        real = urlparse(href.strip().lower()).hostname or ""
        if not real:
            continue
        for m in _HOSTISH.finditer(text):
            if not _same_site(m.group(1).lower(), real):
                raise ValueError(f"Anchor text {m.group(1)!r} ≠ real link host {real!r} (G3)")


def _assert_safe_email(subject: str, html: str) -> None:
    scan = _EmailScan()
    scan.feed(html)
    _assert_no_form_tags(scan)
    _assert_no_credential_ask(subject, html)
    _assert_urls_safe(scan)
    _assert_anchor_hosts(scan)


async def send_email(*, to: str, subject: str, html: str) -> str | None:
    if not EMAIL_KEY:
        logger.warning("EMERGENT_EMAIL_KEY belum diset; email hanya tercatat")
        return None
    _assert_safe_email(subject, html)
    payload = {"to": [to], "subject": subject, "html": html, "from_name": EMAIL_FROM_NAME}
    if EMAIL_REPLY_TO:
        payload["contact_email"] = EMAIL_REPLY_TO
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{EMAIL_BASE_URL}/api/v1/email/send",
                headers={"X-Email-Key": EMAIL_KEY},
                json=payload,
            )
        resp.raise_for_status()
        return resp.json().get("id")
    except Exception as e:
        logger.error("Email send failed: %s", e)
        return None


def _tracking_url(kode: str) -> str:
    return f"{APP_URL}/tracking?kode={kode}"


def _email_html(title: str, lines_html: str, kode: str) -> str:
    url = _tracking_url(kode)
    return (
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" '
        'style="background:#f1f5f9;padding:24px"><tr><td align="center">'
        '<table role="presentation" width="560" cellpadding="0" cellspacing="0" '
        'style="background:#ffffff;border-radius:12px;overflow:hidden">'
        '<tr><td style="background:#0047AB;padding:20px 28px;color:#ffffff;'
        'font-family:Arial,sans-serif;font-size:18px;font-weight:bold">CollerMind — Sewa AC</td></tr>'
        f'<tr><td style="padding:28px;font-family:Arial,sans-serif;color:#0f172a;font-size:14px;line-height:1.7">'
        f'<p style="font-size:16px;font-weight:bold;margin:0 0 12px">{escape(title)}</p>'
        f'{lines_html}'
        f'<p style="margin:20px 0"><a href="{escape(url)}" style="background:#0047AB;color:#ffffff;'
        'padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:bold">Lacak Pesanan</a></p>'
        f'<p style="font-size:12px;color:#64748b">Order ID Anda: <strong>{escape(kode)}</strong></p>'
        '</td></tr>'
        f'<tr><td style="padding:16px 28px;background:#f8fafc;font-family:Arial,sans-serif;'
        f'font-size:11px;color:#94a3b8">Dikirim oleh {escape(EMAIL_FROM_NAME)}. '
        'Kami tidak pernah meminta password atau data kartu melalui email.</td></tr>'
        '</table></td></tr></table>'
    )


def _b_order_created(order, customer, extra):
    kode, nama = order["kode"], customer.get("nama", "Pelanggan")
    body = (f"Halo {nama}, pengajuan rental AC CollerMind Anda telah berhasil dibuat. "
            f"Simpan Order ID ini untuk melacak proses pengajuan dan melanjutkan proses rental.")
    next_steps = (
        "<p style=\"margin:16px 0 6px;font-weight:bold\">Langkah selanjutnya:</p>"
        "<ol style=\"margin:0;padding-left:20px\">"
        "<li>Admin kami akan memverifikasi data Anda.</li>"
        "<li>Setelah disetujui, Anda akan menandatangani kontrak digital melalui halaman tracking.</li>"
        "<li>Anda dapat mengusulkan jadwal pemasangan, lalu admin mengonfirmasi sesuai ketersediaan teknisi.</li>"
        "<li>Setelah instalasi selesai, invoice diterbitkan dan Anda melakukan pembayaran via transfer.</li>"
        "</ol>"
        "<p style=\"margin:12px 0 0;font-style:italic;color:#64748b\">Pembayaran tidak dilakukan sekarang — cukup setelah instalasi selesai dan invoice terbit.</p>"
    )
    wa = (f"*CollerMind*\n\nHalo {nama}, pengajuan rental AC Anda berhasil dibuat.\nOrder ID: *{kode}*\n\n"
          "Langkah selanjutnya:\n1. Admin memverifikasi data Anda.\n2. Setelah disetujui, tanda tangani kontrak digital via halaman tracking.\n"
          "3. Usulkan jadwal pemasangan, lalu admin konfirmasi.\n4. Setelah instalasi selesai, invoice terbit dan pembayaran dilakukan via transfer.\n\n"
          f"Lacak pesanan: {_tracking_url(kode)}")
    html = _email_html("Pengajuan Rental Diterima", f"<p>{escape(body)}</p>{next_steps}", kode)
    return f"Pengajuan Sewa AC Diterima — {kode}", html, wa


def _b_contract_ready(order, customer, extra):
    kode, nama = order["kode"], customer.get("nama", "Pelanggan")
    wa = (f"*CollerMind*\n\nHalo {nama}, pengajuan *{kode}* telah DISETUJUI. "
          f"Silakan buka halaman tracking untuk membaca dan menandatangani kontrak digital: {_tracking_url(kode)}")
    html = _email_html("Pengajuan Disetujui", f"<p>Halo {escape(nama)}, pengajuan Anda telah diverifikasi admin. "
                       "Langkah selanjutnya: tanda tangani kontrak digital melalui halaman tracking.</p>", kode)
    return f"Pengajuan Disetujui — {kode}", html, wa


def _b_delivery_done(order, customer, extra):
    kode, nama = order["kode"], customer.get("nama", "Pelanggan")
    wa = (f"*CollerMind*\n\nUnit AC untuk pesanan *{kode}* telah diterima. "
          f"Silakan pilih jadwal instalasi melalui halaman tracking: {_tracking_url(kode)}")
    html = _email_html("Unit AC Telah Diterima", f"<p>Halo {escape(nama)}, unit AC Anda telah dikirim dan diterima. "
                       "Silakan pilih jadwal instalasi melalui halaman tracking.</p>", kode)
    return f"Unit Diterima — Pilih Jadwal Instalasi ({kode})", html, wa


def _b_invoice_issued(order, customer, extra):
    kode, nama = order["kode"], customer.get("nama", "Pelanggan")
    inv = extra.get("invoice", {})
    total = rupiah(inv.get("total", 0))
    wa = (f"*CollerMind*\n\nInvoice *{inv.get('nomor','')}* untuk pesanan *{kode}* telah terbit.\n"
          f"Total: *{total}*\nTransfer ke: {inv.get('rekening','')}\n"
          f"Lalu upload bukti pembayaran di: {_tracking_url(kode)}")
    html = _email_html("Invoice Terbit", f"<p>Halo {escape(nama)}, instalasi selesai. Invoice Anda telah terbit.</p>"
                       f"<p>Total tagihan: <strong>{escape(total)}</strong><br>Transfer ke: {escape(inv.get('rekening',''))}<br>"
                       "Kemudian unggah bukti pembayaran melalui halaman tracking.</p>", kode)
    return f"Invoice {inv.get('nomor','')} Terbit — {kode}", html, wa


def _b_payment_verified(order, customer, extra):
    kode, nama = order["kode"], customer.get("nama", "Pelanggan")
    nomor = extra.get("nomor", "")
    wa = f"*CollerMind*\n\nPembayaran untuk invoice *{nomor}* (pesanan *{kode}*) telah TERVERIFIKASI. Terima kasih!"
    html = _email_html("Pembayaran Terverifikasi", f"<p>Halo {escape(nama)}, pembayaran Anda untuk invoice {escape(nomor)} telah kami verifikasi. Terima kasih.</p>", kode)
    return f"Pembayaran Terverifikasi — {nomor}", html, wa


def _b_payment_rejected(order, customer, extra):
    kode, nama = order["kode"], customer.get("nama", "Pelanggan")
    nomor = extra.get("nomor", "")
    note = extra.get("catatan", "")
    wa = (f"*CollerMind*\n\nPembayaran untuk invoice *{nomor}* (pesanan *{kode}*) DITOLAK"
          f"{' — ' + note if note else ''}. Silakan upload ulang bukti yang benar: {_tracking_url(kode)}")
    html = _email_html("Pembayaran Ditolak", f"<p>Halo {escape(nama)}, bukti pembayaran invoice {escape(nomor)} ditolak"
                       f"{(' — ' + escape(note)) if note else ''}. Silakan unggah ulang bukti yang benar.</p>", kode)
    return f"Pembayaran Ditolak — {nomor}", html, wa


def _b_monthly_issued(order, customer, extra):
    kode, nama = order["kode"], customer.get("nama", "Pelanggan")
    inv = extra.get("invoice", {})
    wa = (f"*CollerMind*\n\nTagihan sewa bulan ke-{inv.get('periode')} untuk pesanan *{kode}* telah terbit.\n"
          f"Total: *{rupiah(inv.get('total',0))}* — jatuh tempo {inv.get('due_date','')}\n"
          f"Transfer ke: {inv.get('rekening','')}\nUpload bukti di: {_tracking_url(kode)}")
    html = _email_html(f"Tagihan Bulan ke-{inv.get('periode')}",
                       f"<p>Halo {escape(nama)}, tagihan sewa bulanan Anda telah terbit.</p>"
                       f"<p>Total: <strong>{escape(rupiah(inv.get('total',0)))}</strong> — jatuh tempo {escape(inv.get('due_date',''))}<br>"
                       f"Transfer ke: {escape(inv.get('rekening',''))}</p>", kode)
    return f"Tagihan Bulanan Terbit — {inv.get('nomor','')}", html, wa


def _b_reminder(order, customer, extra):
    kode, nama = order["kode"], customer.get("nama", "Pelanggan")
    inv = extra.get("invoice", {})
    kind = extra.get("kind", "H-0")
    wa = (f"*CollerMind*\n\nPengingat ({kind}): tagihan *{inv.get('nomor','')}* sebesar *{rupiah(inv.get('total',0))}* "
          f"jatuh tempo {inv.get('due_date','')}. Bayar & upload bukti di: {_tracking_url(kode)}")
    html = _email_html("Pengingat Jatuh Tempo",
                       f"<p>Halo {escape(nama)}, pengingat ({escape(kind)}): tagihan {escape(inv.get('nomor',''))} "
                       f"sebesar <strong>{escape(rupiah(inv.get('total',0)))}</strong> jatuh tempo {escape(inv.get('due_date',''))}.</p>", kode)
    return f"Pengingat Jatuh Tempo — {inv.get('nomor','')}", html, wa


def _b_extension_confirmed(order, customer, extra):
    kode, nama = order["kode"], customer.get("nama", "Pelanggan")
    lanjut = extra.get("lanjut", True)
    wa = (f"*CollerMind*\n\nHalo {nama}, konfirmasi perpanjangan sewa untuk pesanan *{kode}* telah kami terima: "
          f"*{'Lanjut menyewa (tagihan bulanan berlanjut otomatis)' if lanjut else 'Sewa berakhir sesuai jadwal'}*. Terima kasih!")
    html = _email_html("Konfirmasi Perpanjangan Sewa",
                       f"<p>Halo {escape(nama)}, konfirmasi Anda untuk pesanan {escape(kode)} telah kami terima: "
                       f"<strong>{'Lanjut menyewa — tagihan bulanan berlanjut otomatis.' if lanjut else 'Sewa berakhir sesuai jadwal.'}</strong></p>", kode)
    return f"Konfirmasi Perpanjangan Sewa — {kode}", html, wa


_BUILDERS = {
    "order_created": _b_order_created,
    "contract_ready": _b_contract_ready,
    "delivery_done": _b_delivery_done,
    "invoice_issued": _b_invoice_issued,
    "payment_verified": _b_payment_verified,
    "payment_rejected": _b_payment_rejected,
    "monthly_issued": _b_monthly_issued,
    "reminder": _b_reminder,
    "extension_confirmed": _b_extension_confirmed,
}


def _build(event: str, order: dict, customer: dict, extra: dict | None) -> tuple[str, str, str] | None:
    builder = _BUILDERS.get(event)
    if not builder:
        return None
    return builder(order, customer, extra or {})


async def notify_event(order_id: str, event: str, extra: dict | None = None) -> None:
    order = await db.rental_orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        return
    customer = await db.customers.find_one({"id": order["customer_id"]}, {"_id": 0})
    if not customer:
        return
    built = _build(event, order, customer, extra)
    if not built:
        return
    subject, html, wa_message = built
    dedupe = extra.get("dedupe") if extra else None

    if dedupe and await db.notifications.find_one({"order_id": order_id, "dedupe": dedupe}):
        return

    email_status = "recorded"
    email_id = await send_email(to=customer["email"], subject=subject, html=html)
    if email_id:
        email_status = "sent"

    base = {"order_id": order_id, "kode": order["kode"], "event": event, "dedupe": dedupe, "created_at": now_iso()}
    await db.notifications.insert_one({
        "id": new_id(), **base, "channel": "email", "to": customer["email"],
        "subject": subject, "message": html, "status": email_status, "provider_id": email_id,
    })
    await db.notifications.insert_one({
        "id": new_id(), **base, "channel": "whatsapp", "to": customer["no_hp"],
        "subject": subject, "message": wa_message, "status": "simulated", "provider_id": None,
    })
