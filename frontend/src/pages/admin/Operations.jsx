import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { toast } from "sonner";
import api, { fmtErr, rupiah, fileUrl } from "@/lib/api";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const TABS = [
  { key: "deliveries", label: "Pengiriman", cols: ["Kondisi Unit"] },
  { key: "installations", label: "Instalasi", cols: ["Hasil", "Kondisi Instalasi"] },
  { key: "maintenances", label: "Maintenance", cols: ["Jenis", "Hasil", "Kondisi Unit"] },
  { key: "returns", label: "Pengembalian", cols: ["Kondisi Unit", "Denda"] },
];

function WorkTable({ items, tab }) {
  return (
    <Table>
      <TableHeader>
        <TableRow><TableHead>Tanggal</TableHead><TableHead>Order</TableHead><TableHead>Teknisi</TableHead>{tab.cols.map((c) => <TableHead key={c}>{c}</TableHead>)}<TableHead>Catatan</TableHead><TableHead>Foto</TableHead></TableRow>
      </TableHeader>
      <TableBody>
        {items.map((w) => (
          <TableRow key={w.id} data-testid={`work-row-${w.id}`} className="hover:bg-slate-50">
            <TableCell>{format(new Date(w.tanggal), "dd/MM/yyyy HH:mm")}</TableCell>
            <TableCell><Link to={`/admin/orders/${w.rental_order_id}`} className="text-[#0047AB] font-semibold hover:underline">{w.kode}</Link></TableCell>
            <TableCell>{w.technician_name}</TableCell>
            {tab.key === "deliveries" && <TableCell>{w.kondisi_unit || "-"}</TableCell>}
            {tab.key === "installations" && (<><TableCell>{w.hasil || "-"}</TableCell><TableCell>{w.kondisi_instalasi || "-"}</TableCell></>)}
            {tab.key === "maintenances" && (<><TableCell>{w.jenis_maintenance || "-"}</TableCell><TableCell>{w.hasil || "-"}</TableCell><TableCell>{w.kondisi_unit || "-"}</TableCell></>)}
            {tab.key === "returns" && (<><TableCell>{w.kondisi_unit || "-"}</TableCell><TableCell>{w.denda ? rupiah(w.denda) : "-"}</TableCell></>)}
            <TableCell className="max-w-[200px] truncate text-slate-500">{w.catatan || "-"}</TableCell>
            <TableCell>
              <div className="flex gap-2">
                {[["Surat Jalan", w.foto_surat_jalan], ["TTD", w.foto_ttd_penerima], ["Serah Terima", w.foto_serah_terima || (tab.key === "deliveries" ? null : w.foto)], ["Foto", tab.key !== "deliveries" ? w.foto : null]]
                  .filter(([, p]) => p)
                  .map(([label, p], idx) => (
                    <a key={idx} href={fileUrl(p)} target="_blank" rel="noreferrer" data-testid={`work-foto-${w.id}-${idx}`} className="text-[#0047AB] font-semibold text-xs hover:underline whitespace-nowrap">{label}</a>
                  ))}
                {![w.foto, w.foto_surat_jalan, w.foto_ttd_penerima, w.foto_serah_terima].some(Boolean) && "-"}
              </div>
            </TableCell>
          </TableRow>
        ))}
        {items.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-slate-400 py-10">Belum ada data</TableCell></TableRow>}
      </TableBody>
    </Table>
  );
}

export default function Operations() {
  const [data, setData] = useState({ deliveries: [], installations: [], maintenances: [], returns: [] });

  useEffect(() => {
    Promise.all(TABS.map((t) => api.get(`/admin/${t.key}`).then((r) => [t.key, r.data])))
      .then((entries) => setData(Object.fromEntries(entries)))
      .catch((e) => toast.error(fmtErr(e)));
  }, []);

  return (
    <div data-testid="admin-operations">
      <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight text-slate-800">Operasional Lapangan</h1>
      <Tabs defaultValue="deliveries" className="mt-6">
        <TabsList data-testid="operations-tabs">
          {TABS.map((t) => <TabsTrigger key={t.key} value={t.key} data-testid={`tab-${t.key}`}>{t.label} ({data[t.key].length})</TabsTrigger>)}
        </TabsList>
        {TABS.map((t) => (
          <TabsContent key={t.key} value={t.key}>
            <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto"><WorkTable items={data[t.key]} tab={t} /></div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
