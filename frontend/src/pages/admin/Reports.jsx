import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { toast } from "sonner";
import api, { fmtErr, rupiah } from "@/lib/api";
import { ORDER_STATUS } from "@/components/StatusBadge";

const COLORS = ["#0047AB", "#06B6D4", "#FFCC00", "#FF3B30", "#10B981", "#8B5CF6", "#F97316", "#64748B", "#0F172A", "#34D399"];

export default function Reports() {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get("/admin/reports").then((r) => setData(r.data)).catch((e) => toast.error(fmtErr(e)));
  }, []);

  if (!data) return <p className="text-slate-400">Memuat laporan...</p>;

  const statusData = data.status_distribution.map((s) => ({ ...s, name: ORDER_STATUS[s.status]?.label || s.status }));
  const unitData = data.unit_distribution.map((s) => ({ ...s, name: s.status }));

  return (
    <div data-testid="admin-reports">
      <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight text-slate-800">Laporan</h1>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
        <div className="bg-white border border-slate-200 rounded-xl p-5" data-testid="report-total-orders">
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-slate-400">Total Order</p>
          <p className="font-heading text-2xl font-extrabold text-slate-900 mt-1">{data.total_orders}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5" data-testid="report-total-revenue">
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-slate-400">Pendapatan (Lunas)</p>
          <p className="font-heading text-2xl font-extrabold text-[#0047AB] mt-1">{rupiah(data.total_revenue)}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5" data-testid="report-maintenance">
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-slate-400">Total Maintenance</p>
          <p className="font-heading text-2xl font-extrabold text-slate-900 mt-1">{data.maintenance_count}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <h2 className="font-heading font-bold text-slate-800 mb-4">Pendapatan per Bulan</h2>
          <div className="h-64" data-testid="chart-revenue">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.revenue_by_month}>
                <XAxis dataKey="bulan" fontSize={12} />
                <YAxis fontSize={12} tickFormatter={(v) => `${(v / 1000000).toFixed(1)}jt`} />
                <Tooltip formatter={(v) => rupiah(v)} />
                <Bar dataKey="pendapatan" fill="#0047AB" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          {data.revenue_by_month.length === 0 && <p className="text-sm text-slate-400 text-center py-4">Belum ada pendapatan lunas.</p>}
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <h2 className="font-heading font-bold text-slate-800 mb-4">Distribusi Status Order</h2>
          <div className="h-64" data-testid="chart-status">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={statusData} dataKey="jumlah" nameKey="name" outerRadius={90} label>
                  {statusData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Legend /><Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          {statusData.length === 0 && <p className="text-sm text-slate-400 text-center py-4">Belum ada order.</p>}
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6 lg:col-span-2">
          <h2 className="font-heading font-bold text-slate-800 mb-4">Status Unit AC</h2>
          <div className="flex gap-4 flex-wrap" data-testid="unit-distribution">
            {unitData.map((u, i) => (
              <div key={u.status} className="border border-slate-200 rounded-xl px-6 py-4 min-w-[140px]">
                <div className="w-3 h-3 rounded-full mb-2" style={{ background: COLORS[i % COLORS.length] }} />
                <p className="text-xs uppercase tracking-wider text-slate-400 font-bold">{u.name}</p>
                <p className="font-heading text-xl font-extrabold text-slate-900">{u.jumlah}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
