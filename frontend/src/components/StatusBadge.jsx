export const ORDER_STATUS = {
  pending: { label: "Menunggu Verifikasi", cls: "bg-amber-100 text-amber-800 border-amber-200" },
  verified: { label: "Terverifikasi", cls: "bg-cyan-100 text-cyan-800 border-cyan-200" },
  rejected: { label: "Ditolak", cls: "bg-red-100 text-red-800 border-red-200" },
  scheduled: { label: "Terjadwal", cls: "bg-blue-100 text-blue-800 border-blue-200" },
  delivered: { label: "Unit Terkirim", cls: "bg-indigo-100 text-indigo-800 border-indigo-200" },
  installed: { label: "Terpasang", cls: "bg-violet-100 text-violet-800 border-violet-200" },
  active: { label: "Sewa Aktif", cls: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  maintenance: { label: "Maintenance", cls: "bg-orange-100 text-orange-800 border-orange-200" },
  returned: { label: "Dikembalikan", cls: "bg-slate-200 text-slate-800 border-slate-300" },
  completed: { label: "Selesai", cls: "bg-slate-900 text-white border-slate-900" },
};

export const UNIT_STATUS = {
  ready: { label: "Ready", cls: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  reserved: { label: "Reserved", cls: "bg-amber-100 text-amber-800 border-amber-200" },
  rented: { label: "Rented", cls: "bg-blue-100 text-blue-800 border-blue-200" },
  maintenance: { label: "Maintenance", cls: "bg-orange-100 text-orange-800 border-orange-200" },
  damaged: { label: "Rusak", cls: "bg-red-100 text-red-800 border-red-200" },
};

export const INVOICE_STATUS = {
  issued: { label: "Invoice Terbit", cls: "bg-blue-100 text-blue-800 border-blue-200" },
  waiting_payment: { label: "Menunggu Verifikasi Pembayaran", cls: "bg-amber-100 text-amber-800 border-amber-200" },
  verified: { label: "Lunas Terverifikasi", cls: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  payment_rejected: { label: "Pembayaran Ditolak", cls: "bg-red-100 text-red-800 border-red-200" },
};

export const PAYMENT_STATUS = {
  pending: { label: "Menunggu Verifikasi", cls: "bg-amber-100 text-amber-800 border-amber-200" },
  verified: { label: "Terverifikasi", cls: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  rejected: { label: "Ditolak", cls: "bg-red-100 text-red-800 border-red-200" },
};

export const JENIS_KEGIATAN = {
  delivery: "Pengiriman",
  inspection: "Inspeksi",
  installation: "Instalasi",
  maintenance: "Maintenance",
  dismantling: "Pembongkaran",
  return: "Pengembalian",
};

export function StatusBadge({ status, map = ORDER_STATUS, testid }) {
  const s = map[status] || { label: status, cls: "bg-slate-100 text-slate-700 border-slate-200" };
  return (
    <span data-testid={testid || `badge-${status}`} className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${s.cls}`}>
      {s.label}
    </span>
  );
}
