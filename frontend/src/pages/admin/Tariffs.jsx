import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import api, { fmtErr, rupiah } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const EMPTY = { nama: "", tipe: "Split", kapasitas: "0.5 PK", variant: "Standart", harga_per_bulan: "" };

export default function Tariffs() {
  const [tariffs, setTariffs] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);

  const load = () => api.get("/admin/tariffs").then((r) => setTariffs(r.data)).catch((e) => toast.error(fmtErr(e)));
  useEffect(() => { load(); }, []);

  async function save() {
    try {
      const body = { ...form, harga_per_bulan: Number(form.harga_per_bulan), aktif: true };
      if (editId) await api.put(`/admin/tariffs/${editId}`, body);
      else await api.post("/admin/tariffs", body);
      toast.success("Tarif disimpan");
      setOpen(false); setForm(EMPTY); setEditId(null);
      load();
    } catch (e) { toast.error(fmtErr(e)); }
  }

  async function remove(t) {
    if (!window.confirm(`Nonaktifkan tarif ${t.nama}?`)) return;
    try { await api.delete(`/admin/tariffs/${t.id}`); toast.success("Tarif dinonaktifkan"); load(); } catch (e) { toast.error(fmtErr(e)); }
  }

  return (
    <div data-testid="admin-tariffs">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight text-slate-800">Tarif Sewa</h1>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setForm(EMPTY); setEditId(null); } }}>
          <DialogTrigger asChild><Button data-testid="btn-add-tariff" className="rounded-full bg-[#0047AB] hover:bg-[#003a8c]"><Plus className="w-4 h-4 mr-2" /> Tambah Tarif</Button></DialogTrigger>
          <DialogContent data-testid="tariff-dialog">
            <DialogHeader><DialogTitle>{editId ? "Edit Tarif" : "Tambah Tarif"}</DialogTitle></DialogHeader>
            <div className="space-y-4 mt-2">
              <div><Label>Nama Tarif</Label><Input data-testid="tariff-nama" value={form.nama} onChange={(e) => setForm({ ...form, nama: e.target.value })} className="mt-1.5" placeholder="AC Split 1 PK" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Tipe</Label>
                  <Select value={form.tipe} onValueChange={(v) => setForm({ ...form, tipe: v })}>
                    <SelectTrigger data-testid="tariff-tipe" className="mt-1.5"><SelectValue /></SelectTrigger>
                    <SelectContent>{["Split", "Standing", "Cassette", "Portable"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Kapasitas</Label>
                  <Select value={form.kapasitas} onValueChange={(v) => setForm({ ...form, kapasitas: v })}>
                    <SelectTrigger data-testid="tariff-kapasitas" className="mt-1.5"><SelectValue /></SelectTrigger>
                    <SelectContent>{["0.5 PK", "1 PK", "1.5 PK", "2 PK", "2.5 PK", "3 PK", "5 PK"].map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Variant</Label>
                  <Select value={form.variant} onValueChange={(v) => setForm({ ...form, variant: v })}>
                    <SelectTrigger data-testid="tariff-variant" className="mt-1.5"><SelectValue /></SelectTrigger>
                    <SelectContent>{["Standart", "Inverter"].map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label>Harga per Bulan (Rp)</Label><Input type="number" data-testid="tariff-harga" value={form.harga_per_bulan} onChange={(e) => setForm({ ...form, harga_per_bulan: e.target.value })} className="mt-1.5" placeholder="300000" /></div>
            </div>
            <Button data-testid="btn-save-tariff" onClick={save} className="mt-4 rounded-full bg-[#0047AB] hover:bg-[#003a8c]">Simpan</Button>
          </DialogContent>
        </Dialog>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl mt-6 overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Nama</TableHead><TableHead>Tipe</TableHead><TableHead>Kapasitas</TableHead><TableHead>Harga/Bulan</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {tariffs.map((t) => (
              <TableRow key={t.id} data-testid={`tariff-row-${t.id}`} className="hover:bg-slate-50">
                <TableCell className="font-semibold">{t.nama}</TableCell>
                <TableCell>{t.tipe}</TableCell><TableCell>{t.kapasitas}{t.variant && t.variant !== "Standart" ? ` ${t.variant}` : ""}</TableCell>
                <TableCell>{rupiah(t.harga_per_bulan)}</TableCell>
                <TableCell>{t.aktif ? <span className="text-emerald-600 text-xs font-semibold">AKTIF</span> : <span className="text-slate-400 text-xs font-semibold">NONAKTIF</span>}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <button data-testid={`edit-tariff-${t.id}`} onClick={() => { setForm({ nama: t.nama, tipe: t.tipe, kapasitas: t.kapasitas, variant: t.variant || "Standart", harga_per_bulan: t.harga_per_bulan }); setEditId(t.id); setOpen(true); }} className="p-2 text-slate-500 hover:text-[#0047AB] transition-colors"><Pencil className="w-4 h-4" /></button>
                    <button data-testid={`delete-tariff-${t.id}`} onClick={() => remove(t)} className="p-2 text-slate-500 hover:text-red-500 transition-colors"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {tariffs.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-slate-400 py-10">Belum ada tarif</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
