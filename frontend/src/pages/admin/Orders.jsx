import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import api, { fmtErr, rupiah } from "@/lib/api";
import { toast } from "sonner";
import { StatusBadge, ORDER_STATUS } from "@/components/StatusBadge";
import { usePolling } from "@/lib/usePolling";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [filter, setFilter] = useState("");

  const load = () => api.get("/admin/orders", { params: filter ? { status: filter } : {} })
      .then((r) => setOrders(r.data))
      .catch(() => {});
  useEffect(() => { load(); }, [filter]); // eslint-disable-line
  usePolling(load, 15000);

  return (
    <div data-testid="admin-orders">
      <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight text-slate-800">Rental Order</h1>

      <div className="flex gap-2 mt-6 flex-wrap" data-testid="order-filters">
        <button onClick={() => setFilter("")} data-testid="filter-all" className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${!filter ? "bg-[#0047AB] text-white" : "bg-white border border-slate-200 text-slate-600 hover:border-[#0047AB]"}`}>Semua</button>
        {Object.entries(ORDER_STATUS).map(([k, v]) => (
          <button key={k} onClick={() => setFilter(k)} data-testid={`filter-${k}`} className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${filter === k ? "bg-[#0047AB] text-white" : "bg-white border border-slate-200 text-slate-600 hover:border-[#0047AB]"}`}>{v.label}</button>
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl mt-6 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Kode</TableHead><TableHead>Customer</TableHead><TableHead>Tgl Mulai</TableHead>
              <TableHead>Durasi</TableHead><TableHead>Total</TableHead><TableHead>Bayar</TableHead><TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((o) => (
              <TableRow key={o.id} data-testid={`order-row-${o.kode}`} className="hover:bg-slate-50">
                <TableCell><Link to={`/admin/orders/${o.id}`} className="font-semibold text-[#0047AB] hover:underline">{o.kode}</Link></TableCell>
                <TableCell>{o.customer_nama}<span className="block text-xs text-slate-400">{o.customer_no_hp}</span></TableCell>
                <TableCell>{o.tanggal_mulai ? format(new Date(o.tanggal_mulai), "dd/MM/yyyy") : "-"}</TableCell>
                <TableCell>{o.durasi_sewa} bln</TableCell>
                <TableCell>{rupiah(o.total_biaya + (o.denda || 0))}</TableCell>
                <TableCell>{o.payment_status === "paid" ? <span className="text-emerald-600 font-semibold text-xs">LUNAS</span> : <span className="text-amber-600 font-semibold text-xs">BELUM</span>}</TableCell>
                <TableCell><StatusBadge status={o.status} /></TableCell>
              </TableRow>
            ))}
            {orders.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-slate-400 py-10">Tidak ada data</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
