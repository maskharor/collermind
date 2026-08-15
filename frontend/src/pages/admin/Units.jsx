import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import api, { fmtErr, rupiah } from "@/lib/api";
import { StatusBadge, UNIT_STATUS } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const EMPTY = { kode_unit: "", merk: "", kapasitas: "0.5 PK", tipe: "Split", variant: "Standart", status: "ready", tahun: 2024, harga_sewa_bulanan: "" };

export default function Units() {
  const [units, setUnits] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);

  const load = () => api.get("/admin/units").then((r) => setUnits(r.data)).catch((e) => toast.error(fmtErr(e)));
  useEffect(() => { load(); }, []);

  async function save() {
    try {
      const body = { ...form, tahun: Number(form.tahun), harga_sewa_bulanan: form.harga_sewa_bulanan ? Number(form.harga_sewa_bulanan) : null };
      if (editId) await api.put(`/admin/units/${editId}`, body);
      else await api.post("/admin/units", body);
      toast.success("Unit disimpan");
      setOpen(false); setForm(EMPTY); setEditId(null);
      load();
    } catch (e) { toast.error(fmtErr(e)); }
  }

  async function remove(u) {
    if (!window.confirm(`Hapus unit ${u.kode_unit}?`)) return;
    try { await api.delete(`/admin/units/${u.id}`); toast.success("Unit dihapus"); load(); } catch (e) { toast.error(fmtErr(e)); }
  }

  return (
    <div data-testid="admin-units">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight text-slate-800">Unit AC</h1>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setForm(EMPTY); setEditId(null); } }}>
          <DialogTrigger asChild><Button data-testid="btn-add-unit" className="rounded-full bg-[#0047AB] hover:bg-[#003a8c]"><Plus className="w-4 h-4 mr-2" /> Tambah Unit</Button></DialogTrigger>
          <DialogContent data-testid="unit-dialog">
            <DialogHeader><DialogTitle>{editId ? "Edit Unit" : "Tambah Unit"}</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-4 mt-2">
              <div><Label>Kode Unit</Label><Input data-testid="unit-kode" value={form.kode_unit} onChange={(e) => setForm({ ...form, kode_unit: e.target.value })} className="mt-1.5" placeholder="AC-007" /></div>
              <div><Label>Merk</Label><Input data-testid="unit-merk" value={form.merk} onChange={(e) => setForm({ ...form, merk: e.target.value })} className="mt-1.5" placeholder="Daikin" /></div>
              <div>
                <Label>Tipe</Label>
                <Select value={form.tipe} onValueChange={(v) => setForm({ ...form, tipe: v })}>
                  <SelectTrigger data-testid="unit-tipe" className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>{["Split", "Standing", "Cassette", "Portable"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Kapasitas</Label>
                <Select value={form.kapasitas} onValueChange={(v) => setForm({ ...form, kapasitas: v })}>
                  <SelectTrigger data-testid="unit-kapasitas" className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>{["0.5 PK", "1 PK", "1.5 PK", "2 PK", "2.5 PK", "3 PK", "5 PK"].map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Tahun</Label><Input type="number" data-testid="unit-tahun" value={form.tahun} onChange={(e) => setForm({ ...form, tahun: e.target.value })} className="mt-1.5" /></div>
              <div>
                <Label>Variant</Label>
                <Select value={form.variant} onValueChange={(v) => setForm({ ...form, variant: v })}>
                  <SelectTrigger data-testid="unit-variant" className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>{["Standart", "Inverter"].map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger data-testid="unit-status" className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(UNIT_STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="col-span-2"><Label>Harga Sewa/Bulan (override, opsional)</Label><Input type="number" data-testid="unit-harga" value={form.harga_sewa_bulanan} onChange={(e) => setForm({ ...form, harga_sewa_bulanan: e.target.value })} className="mt-1.5" placeholder="Kosongkan untuk ikut tarif" /></div>
            </div>
            <Button data-testid="btn-save-unit" onClick={save} className="mt-4 rounded-full bg-[#0047AB] hover:bg-[#003a8c]">Simpan</Button>
          </DialogContent>
        </Dialog>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl mt-6 overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Kode</TableHead><TableHead>Merk</TableHead><TableHead>Tipe</TableHead><TableHead>Kapasitas</TableHead><TableHead>Tahun</TableHead><TableHead>Harga Override</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {units.map((u) => (
              <TableRow key={u.id} data-testid={`unit-row-${u.kode_unit}`} className="hover:bg-slate-50">
                <TableCell className="font-semibold">{u.kode_unit}</TableCell>
                <TableCell>{u.merk}</TableCell><TableCell>{u.tipe} {u.variant && u.variant !== "Standart" ? `(${u.variant})` : ""}</TableCell><TableCell>{u.kapasitas}</TableCell><TableCell>{u.tahun}</TableCell>
                <TableCell>{u.harga_sewa_bulanan ? rupiah(u.harga_sewa_bulanan) : "-"}</TableCell>
                <TableCell><StatusBadge status={u.status} map={UNIT_STATUS} /></TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <button data-testid={`edit-unit-${u.kode_unit}`} onClick={() => { setForm({ kode_unit: u.kode_unit, merk: u.merk, kapasitas: u.kapasitas, tipe: u.tipe, variant: u.variant || "Standart", status: u.status, tahun: u.tahun, harga_sewa_bulanan: u.harga_sewa_bulanan || "" }); setEditId(u.id); setOpen(true); }} className="p-2 text-slate-500 hover:text-[#0047AB] transition-colors"><Pencil className="w-4 h-4" /></button>
                    <button data-testid={`delete-unit-${u.kode_unit}`} onClick={() => remove(u)} className="p-2 text-slate-500 hover:text-red-500 transition-colors"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {units.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-slate-400 py-10">Belum ada unit</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
