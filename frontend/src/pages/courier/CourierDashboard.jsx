import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { MapPin, Clock, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import api, { fmtErr } from "@/lib/api";
import { StatusBadge } from "@/components/StatusBadge";
import { usePolling } from "@/lib/usePolling";

export default function CourierDashboard() {
  const [today, setToday] = useState([]);
  const [all, setAll] = useState([]);

  const load = () => {
    api.get("/courier/schedules", { params: { scope: "today" } }).then((r) => setToday(r.data)).catch(() => {});
    api.get("/courier/schedules").then((r) => setAll(r.data)).catch(() => {});
  };
  useEffect(() => { load(); }, []); // eslint-disable-line
  usePolling(load, 15000);

  const upcoming = all.filter((s) => !today.some((t) => t.id === s.id) && s.status === "planned");
  const done = all.filter((s) => s.status === "done");

  const Card = ({ s, i }) => (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
      <Link to={`/kurir/tugas/${s.id}`} data-testid={`delivery-card-${s.id}`}
        className="block bg-white border border-slate-200 rounded-2xl p-5 min-h-[48px] hover:border-[#0047AB] hover:-translate-y-0.5 hover:shadow-[0_8px_32px_rgba(0,71,171,0.1)] transition-[transform,border-color,box-shadow] duration-200">
        <div className="flex items-center justify-between">
          <span className="font-heading font-bold text-slate-900">Pengiriman Unit</span>
          <div className="flex items-center gap-2">
            {s.status === "done"
              ? <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700">Terkirim</span>
              : <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700">Terjadwal</span>}
            <ChevronRight className="w-4 h-4 text-slate-300" />
          </div>
        </div>
        <p className="text-sm text-slate-600 mt-2 font-semibold">{s.kode} · {s.customer_nama}</p>
        <p className="text-xs text-slate-500 mt-1 flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {s.alamat_pemasangan}</p>
        <p className="text-xs text-slate-500 mt-1 flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {s.tanggal} · {s.jam}</p>
        <div className="mt-2"><StatusBadge status={s.order_status} /></div>
      </Link>
    </motion.div>
  );

  return (
    <div data-testid="courier-dashboard">
      <h1 className="font-heading text-2xl font-bold tracking-tight text-slate-800">Pengiriman Hari Ini</h1>
      <div className="space-y-4 mt-5" data-testid="courier-today-list">
        {today.map((s, i) => <Card key={s.id} s={s} i={i} />)}
        {today.length === 0 && <p className="text-sm text-slate-400 bg-white border border-slate-200 rounded-2xl p-6 text-center">Tidak ada pengiriman hari ini.</p>}
      </div>

      <h2 className="font-heading text-lg font-bold text-slate-800 mt-10">Pengiriman Mendatang</h2>
      <div className="space-y-4 mt-4" data-testid="courier-upcoming-list">
        {upcoming.map((s, i) => <Card key={s.id} s={s} i={i} />)}
        {upcoming.length === 0 && <p className="text-sm text-slate-400 bg-white border border-slate-200 rounded-2xl p-6 text-center">Tidak ada pengiriman mendatang.</p>}
      </div>

      <h2 className="font-heading text-lg font-bold text-slate-800 mt-10">Riwayat Terkirim</h2>
      <div className="space-y-4 mt-4 mb-10" data-testid="courier-done-list">
        {done.slice(0, 10).map((s, i) => <Card key={s.id} s={s} i={i} />)}
        {done.length === 0 && <p className="text-sm text-slate-400 bg-white border border-slate-200 rounded-2xl p-6 text-center">Belum ada pengiriman selesai.</p>}
      </div>
    </div>
  );
}
