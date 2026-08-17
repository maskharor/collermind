import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Clock, Snowflake, Banknote, CalendarDays } from "lucide-react";
import api, { fmtErr, rupiah } from "@/lib/api";
import { toast } from "sonner";
import { usePolling } from "@/lib/usePolling";
import { StatusBadge, JENIS_KEGIATAN } from "@/components/StatusBadge";

export default function Dashboard() {
  const [stats, setStats] = useState(null);

  const load = () => api.get("/admin/stats").then((r) => setStats(r.data)).catch(() => {});
  useEffect(() => { load(); }, []); // eslint-disable-line
  usePolling(load, 15000);

  if (!stats) return <p className="text-slate-400">Memuat dashboard...</p>;

  const cards = [
    { label: "Pengajuan Pending", value: stats.pending, icon: Clock, cls: "bg-amber-50 text-amber-600", testid: "stat-pending" },
    { label: "Sewa Aktif", value: stats.active, icon: CalendarDays, cls: "bg-emerald-50 text-emerald-600", testid: "stat-active" },
    { label: "Pembayaran Menunggu Verifikasi", value: stats.pending_payments, icon: Banknote, cls: "bg-amber-50 text-amber-700", testid: "stat-pending-payments" },
    { label: "Tagihan Terlambat", value: stats.overdue, icon: Clock, cls: "bg-red-50 text-red-600", testid: "stat-overdue" },
    { label: "Unit Ready", value: `${stats.units_ready}/${stats.units_total}`, icon: Snowflake, cls: "bg-blue-50 text-[#0047AB]", testid: "stat-units" },
    { label: "Total Pendapatan", value: rupiah(stats.revenue), icon: Banknote, cls: "bg-cyan-50 text-cyan-600", testid: "stat-revenue" },
  ];

  return (
    <div data-testid="admin-dashboard">
      <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight text-slate-800">Dashboard</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        {cards.map((c, i) => (
          <motion.div key={c.label} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}
            className="bg-white border border-slate-200 rounded-xl p-5" data-testid={c.testid}>
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${c.cls}`}><c.icon className="w-5 h-5" /></div>
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-slate-400 mt-4">{c.label}</p>
            <p className="font-heading text-2xl font-extrabold text-slate-900 mt-1">{c.value}</p>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
        <div className="bg-white border border-slate-200 rounded-xl">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h2 className="font-heading font-bold text-slate-800">Pengajuan Terbaru</h2>
            <Link to="/admin/orders" data-testid="view-all-orders" className="text-sm text-[#0047AB] font-semibold hover:underline">Lihat semua</Link>
          </div>
          <div className="divide-y divide-slate-100">
            {stats.recent_orders.map((o) => (
              <Link key={o.id} to={`/admin/orders/${o.id}`} data-testid={`recent-order-${o.kode}`} className="flex items-center justify-between px-5 py-3 hover:bg-slate-50 transition-colors">
                <div>
                  <p className="text-sm font-semibold text-slate-800">{o.kode} <span className="font-normal text-slate-500">· {o.customer_nama}</span></p>
                  <p className="text-xs text-slate-400">{rupiah(o.total_biaya)}</p>
                </div>
                <StatusBadge status={o.status} />
              </Link>
            ))}
            {stats.recent_orders.length === 0 && <p className="px-5 py-8 text-sm text-slate-400">Belum ada pengajuan.</p>}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl">
          <div className="px-5 py-4 border-b border-slate-100"><h2 className="font-heading font-bold text-slate-800">Jadwal Hari Ini</h2></div>
          <div className="divide-y divide-slate-100">
            {stats.today_schedules.map((s) => (
              <div key={s.id} data-testid={`today-schedule-${s.id}`} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800">{JENIS_KEGIATAN[s.jenis_kegiatan]} · {s.kode}</p>
                  <p className="text-xs text-slate-400">{s.jam} · {s.technician_name}</p>
                </div>
                <span className="text-xs font-semibold px-2 py-1 rounded-full bg-amber-100 text-amber-700">Terjadwal</span>
              </div>
            ))}
            {stats.today_schedules.length === 0 && <p className="px-5 py-8 text-sm text-slate-400">Tidak ada jadwal hari ini.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
