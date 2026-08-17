import io
import re
from datetime import datetime
from pathlib import Path

from docx import Document

TEMPLATE_PATH = Path(__file__).parent / "assets" / "surat_sewa.docx"

BULAN_ID = ["", "Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli",
            "Agustus", "September", "Oktober", "November", "Desember"]


def _rp(n) -> str:
    return "Rp" + f"{int(n or 0):,}".replace(",", ".")


def generate_contract_docx(order: dict, customer: dict, contract: dict) -> bytes:
    """Isi template Surat Sewa.docx dengan data order (blank '_' diisi)."""
    doc = Document(str(TEMPLATE_PATH))

    try:
        tgl = datetime.fromisoformat(contract["created_at"].replace("Z", "+00:00"))
    except Exception:
        tgl = datetime.now()

    nama = customer.get("nama", "-")
    alamat_ktp = customer.get("alamat_ktp", "-")
    no_hp = customer.get("no_hp", "-")
    details = order.get("details", [])
    total_unit = sum(d.get("quantity", 0) for d in details)
    items_desc = ", ".join(f"{d['nama']} ({d['quantity']} unit)" for d in details)
    sewa = sum(d.get("harga", 0) * d.get("quantity", 0) for d in details)
    total_awal = (order.get("estimasi") or {}).get("total", sewa + 650000)
    durasi = order.get("durasi_sewa", "-")

    subs = [
        (r"tanggal\s*_+\s*bulan\s*_+\s*tahun\s*_+",
         f"tanggal {tgl.day} bulan {BULAN_ID[tgl.month]} tahun {tgl.year}"),
        (r"\(Nama lengkap\)", nama),
        (r"beralamat di\s*_+,", f"beralamat di {alamat_ktp},"),
        (r"Nomor Induk Kependudukan \(NIK\) Nomor\s*_+,", "Nomor Induk Kependudukan (NIK) Nomor -,"),
        (r"Nomor Telepon\s*_+,", f"Nomor Telepon {no_hp},"),
        (r"sebanyak\s*_+\s*\(_+\)\s*unit Air AC dengan kapasitas\s*_+\s*PK \(Standart/Inverter\)",
         f"sebanyak {total_unit} unit Air AC dengan kapasitas: {items_desc}"),
        (r"biaya sebesar Rp\s*_+\s*\(_+\)", f"biaya sebesar {_rp(total_awal)}"),
        (r"Biaya sewa bulan pertama: Rp_+", f"Biaya sewa bulan pertama: {_rp(sewa)}"),
        (r"jangka waktu 1 \(satu\) bulan kalender", f"jangka waktu {durasi} bulan kalender"),
        (r"sebesar Rp_+,-", f"sebesar {_rp(sewa)},-"),
    ]

    for p in doc.paragraphs:
        text = p.text
        new = text
        for pat, rep in subs:
            new = re.sub(pat, rep, new)
        if new != text:
            if p.runs:
                p.runs[0].text = new
                for r in p.runs[1:]:
                    r.text = ""
            else:
                p.add_run(new)

    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()
