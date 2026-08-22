import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import api, { fmtErr } from "@/lib/api";
import { JENIS_KEGIATAN, StatusBadge } from "@/components/StatusBadge";
import { usePolling } from "@/lib/usePolling";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function Schedules() {
  const [schedules, setSchedules] = useState([]);
  const [tanggal, setTanggal] = useState("");

  const load = () => api.get("/admin/schedules", { params: tanggal ? { tanggal } : {} })
      .then((r) => setSchedules(r.data))
      .catch((e) => toast.error(fmtErr(e)));
  useEffect(() => { load(); }, [tanggal]); // eslint-disable-line
  usePolling(load, 15000);

  return (
    <div data-testid="admin-schedules">
      <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight text-slate-800">Jadwal</h1>
      <div className="flex items-center gap-3 mt-6">
        <Input type="date" data-testid="schedule-date-filter" value={tanggal} onChange={(e) => setTanggal(e.target.value)} className="max-w-[200px]" />
        {tanggal && <button data-testid="clear-date-filter" onClick={() => setTanggal("")} className="text-sm text-[#0047AB] hover:underline">Reset</button>}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl mt-6 overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Tanggal</TableHead><TableHead>Kegiatan</TableHead><TableHead>Order</TableHead><TableHead>Teknisi</TableHead><TableHead>Status Order</TableHead><TableHead>Status Jadwal</TableHead><TableHead>Catatan</TableHead></TableRow></TableHeader>
          <TableBody>
            {schedules.map((s) => (
              <TableRow key={s.id} data-testid={`schedule-row-${s.id}`} className="hover:bg-slate-50">
                <TableCell className="font-semibold">{s.tanggal} <span className="text-slate-400 font-normal">{s.jam}</span></TableCell>
                <TableCell>{JENIS_KEGIATAN[s.jenis_kegiatan]}</TableCell>
                <TableCell><Link to={`/admin/orders/${s.rental_order_id}`} className="text-[#0047AB] font-semibold hover:underline">{s.kode}</Link></TableCell>
                <TableCell>{s.technician_name}</TableCell>
                <TableCell><StatusBadge status={s.order_status} /></TableCell>
                <TableCell>{s.status === "done" ? <span className="text-xs font-semibold px-2 py-1 rounded-full bg-emerald-100 text-emerald-700">Selesai</span> : <span className="text-xs font-semibold px-2 py-1 rounded-full bg-amber-100 text-amber-700">Terjadwal</span>}</TableCell>
                <TableCell className="max-w-[200px] truncate text-slate-500">{s.catatan || "-"}</TableCell>
              </TableRow>
            ))}
            {schedules.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-slate-400 py-10">Tidak ada jadwal</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
