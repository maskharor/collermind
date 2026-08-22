import { useEffect, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import api, { fmtErr } from "@/lib/api";
import { usePolling } from "@/lib/usePolling";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";

export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [q, setQ] = useState("");

  const load = () => api.get("/admin/customers").then((r) => setCustomers(r.data)).catch((e) => toast.error(fmtErr(e)));
  useEffect(() => { load(); }, []); // eslint-disable-line
  usePolling(load, 15000);

  const filtered = customers.filter((c) =>
    [c.nama, c.email, c.no_hp].join(" ").toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div data-testid="admin-customers">
      <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight text-slate-800">Customer</h1>
      <Input data-testid="customer-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama / email / no HP..." className="mt-6 max-w-sm" />

      <div className="bg-white border border-slate-200 rounded-xl mt-6 overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Nama</TableHead><TableHead>Kontak</TableHead><TableHead>Status Hunian</TableHead><TableHead>Alamat Pemasangan</TableHead><TableHead>Jml Order</TableHead><TableHead>Terdaftar</TableHead></TableRow></TableHeader>
          <TableBody>
            {filtered.map((c) => (
              <TableRow key={c.id} data-testid={`customer-row-${c.id}`} className="hover:bg-slate-50">
                <TableCell className="font-semibold">{c.nama}<span className="block text-xs text-slate-400">NIK: {c.nik}</span></TableCell>
                <TableCell>{c.email}<span className="block text-xs text-slate-400">{c.no_hp}</span></TableCell>
                <TableCell>{c.status_hunian}</TableCell>
                <TableCell className="max-w-xs truncate">{c.alamat_pemasangan}</TableCell>
                <TableCell><span className="font-bold text-[#0047AB]">{c.order_count}</span></TableCell>
                <TableCell>{format(new Date(c.created_at), "dd/MM/yyyy")}</TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-slate-400 py-10">Tidak ada customer</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
