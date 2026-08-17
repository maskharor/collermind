import { useEffect, useState } from "react";
import { toast } from "sonner";
import api, { fmtErr, rupiah } from "@/lib/api";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const BILLING_STATUS = {
  scheduled: { label: "Terjadwal", cls: "bg-slate-100 text-slate-500 border-slate-200" },
  issued: { label: "Terbit — Belum Bayar", cls: "bg-blue-100 text-blue-800 border-blue-200" },
  waiting_payment: { label: "Menunggu Verifikasi", cls: "bg-amber-100 text-amber-800 border-amber-200" },
  verified: { label: "Lunas", cls: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  payment_rejected: { label: "Bukti Ditolak", cls: "bg-red-100 text-red-800 border-red-200" },
  overdue: { label: "Jatuh Tempo Terlewat", cls: "bg-red-100 text-red-800 border-red-200" },
};

export default function Billings() {
  const [bills, setBills] = useState([]);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    api.get("/admin/billings", { params: filter ? { status: filter } : {} })
      .then((r) => setBills(r.data))
      .catch((e) => toast.error(fmtErr(e)));
  }, [filter]);

  return (
    <div data-testid="admin-billings">
      <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight text-slate-800">Tagihan Bulanan</h1>

      <div className="flex gap-2 mt-6 flex-wrap" data-testid="billing-filters">
        <button onClick={() => setFilter("")} data-testid="bf-all" className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${!filter ? "bg-[#0047AB] text-white" : "bg-white border border-slate-200 text-slate-600 hover:border-[#0047AB]"}`}>Semua</button>
        {Object.entries(BILLING_STATUS).map(([k, v]) => (
          <button key={k} onClick={() => setFilter(k)} data-testid={`bf-${k}`} className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${filter === k ? "bg-[#0047AB] text-white" : "bg-white border border-slate-200 text-slate-600 hover:border-[#0047AB]"}`}>{v.label}</button>
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl mt-6 overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Invoice</TableHead><TableHead>Order</TableHead><TableHead>Customer</TableHead><TableHead>Periode</TableHead><TableHead>Tgl Tagih</TableHead><TableHead>Jatuh Tempo</TableHead><TableHead>Total</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
          <TableBody>
            {bills.map((b) => (
              <TableRow key={b.id} data-testid={`billing-row-${b.nomor}`} className="hover:bg-slate-50">
                <TableCell className="font-semibold">{b.nomor}</TableCell>
                <TableCell>{b.kode}</TableCell>
                <TableCell>{b.customer_nama}<span className="block text-xs text-slate-400">{b.customer_no_hp}</span></TableCell>
                <TableCell>Bulan ke-{b.periode}</TableCell>
                <TableCell>{b.bill_date}</TableCell>
                <TableCell className={b.status === "overdue" ? "text-red-600 font-semibold" : ""}>{b.due_date}</TableCell>
                <TableCell>{rupiah(b.total)}</TableCell>
                <TableCell>
                  <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${BILLING_STATUS[b.status]?.cls || ""}`}>
                    {BILLING_STATUS[b.status]?.label || b.status}
                  </span>
                  {b.pending_payment && <span className="block text-[10px] text-amber-600 font-semibold mt-1">Bukti masuk — cek di order</span>}
                </TableCell>
              </TableRow>
            ))}
            {bills.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-slate-400 py-10">Belum ada tagihan bulanan</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
