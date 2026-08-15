import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { ArrowLeft, MapPin, Phone, UploadCloud, Send, Loader2 } from "lucide-react";
import { toast } from "sonner";
import api, { fmtErr, rupiah } from "@/lib/api";
import { JENIS_KEGIATAN, StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function TechTask() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [form, setForm] = useState({ hasil: "", kondisi: "", jenis_maintenance: "rutin", denda: "", total_pipa: "", catatan: "" });
  const [foto, setFoto] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get(`/tech/schedules/${id}`).then((r) => setData(r.data)).catch((e) => toast.error(fmtErr(e)));
  }, [id]);

  if (!data) return <p className="text-slate-400">Memuat...</p>;
  const { schedule, order, customer, units } = data;
  const jenis = schedule.jenis_kegiatan;
  const isDone = schedule.status === "done";

  async function submit() {
    if (jenis === "installation" && (!form.total_pipa || Number(form.total_pipa) <= 0)) return toast.error("Panjang pipa aktual wajib diisi");
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("hasil", form.hasil);
      fd.append("kondisi", form.kondisi);
      fd.append("jenis_maintenance", form.jenis_maintenance);
      fd.append("denda", form.denda ? Number(form.denda) : 0);
      fd.append("total_pipa", form.total_pipa ? Number(form.total_pipa) : 0);
      fd.append("catatan", form.catatan);
      if (foto) fd.append("foto", foto);
      await api.post(`/tech/schedules/${id}/submit`, fd);
      toast.success("Laporan pekerjaan terkirim");
      navigate("/teknisi");
    } catch (e) {
      toast.error(fmtErr(e));
      setBusy(false);
    }
  }

  return (
    <div data-testid="tech-task">
      <Link to="/teknisi" data-testid="tech-back" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-[#0047AB] transition-colors"><ArrowLeft className="w-4 h-4" /> Kembali</Link>

      <div className="flex items-center justify-between mt-4 flex-wrap gap-2">
        <h1 className="font-heading text-2xl font-bold tracking-tight text-slate-800">{JENIS_KEGIATAN[jenis]}</h1>
        <StatusBadge status={order.status} testid="task-order-status" />
      </div>
      <p className="text-sm text-slate-500 mt-1">{order.kode} · {schedule.tanggal} {schedule.jam}</p>
      {schedule.catatan && <p className="text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-3 mt-3">Catatan admin: {schedule.catatan}</p>}

      <section className="bg-white border border-slate-200 rounded-2xl p-5 mt-6">
        <h2 className="font-heading font-bold text-slate-800 mb-3">Customer & Lokasi</h2>
        <p className="font-semibold text-slate-800">{customer.nama}</p>
        <p className="text-sm text-slate-500 mt-1 flex items-center gap-2"><Phone className="w-4 h-4" /> {customer.no_hp}</p>
        <p className="text-sm text-slate-500 mt-2 flex items-start gap-2"><MapPin className="w-4 h-4 mt-0.5 shrink-0" /> {customer.alamat_pemasangan}</p>
      </section>

      <section className="bg-white border border-slate-200 rounded-2xl p-5 mt-4">
        <h2 className="font-heading font-bold text-slate-800 mb-3">Unit</h2>
        <div className="space-y-2 text-sm">
          {order.details.map((d, i) => <p key={i} className="text-slate-600">{d.nama} ×{d.quantity} <span className="text-slate-400">({rupiah(d.harga)}/bln)</span></p>)}
          {units.length > 0 && (
            <div className="flex gap-2 flex-wrap pt-2">
              {units.map((u) => <span key={u.id} className="text-xs bg-slate-100 rounded-full px-2.5 py-1 font-medium">{u.kode_unit} · {u.merk}</span>)}
            </div>
          )}
        </div>
      </section>

      {!isDone ? (
        <section className="bg-white border border-slate-200 rounded-2xl p-5 mt-4 mb-10" data-testid="work-form">
          <h2 className="font-heading font-bold text-slate-800 mb-4">Laporan Pekerjaan</h2>
          <div className="space-y-4">
            {jenis === "installation" && (
              <>
                <div>
                  <Label>Hasil Instalasi</Label>
                  <Select value={form.hasil} onValueChange={(v) => setForm({ ...form, hasil: v })}>
                    <SelectTrigger data-testid="work-hasil" className="mt-1.5 h-12"><SelectValue placeholder="Pilih hasil" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="berhasil">Berhasil — unit menyala normal</SelectItem>
                      <SelectItem value="berhasil_catatan">Berhasil dengan catatan</SelectItem>
                      <SelectItem value="gagal">Gagal / perlu kunjungan ulang</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Panjang Pipa Aktual (meter) *</Label>
                  <Input type="number" min="0" step="0.5" data-testid="work-total-pipa" value={form.total_pipa} onChange={(e) => setForm({ ...form, total_pipa: e.target.value })} className="mt-1.5 h-12" placeholder="Contoh: 4" />
                  <p className="text-xs text-slate-400 mt-1">Paket standar termasuk 3 m. Kelebihan dihitung Rp130.000/m otomatis ke invoice.</p>
                </div>
              </>
            )}
            {jenis === "maintenance" && (
              <>
                <div>
                  <Label>Jenis Maintenance</Label>
                  <Select value={form.jenis_maintenance} onValueChange={(v) => setForm({ ...form, jenis_maintenance: v })}>
                    <SelectTrigger data-testid="work-jenis-maintenance" className="mt-1.5 h-12"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="rutin">Rutin (cuci & cek)</SelectItem>
                      <SelectItem value="perbaikan">Perbaikan</SelectItem>
                      <SelectItem value="isi_freon">Isi Freon</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Hasil</Label><Input data-testid="work-hasil-text" value={form.hasil} onChange={(e) => setForm({ ...form, hasil: e.target.value })} className="mt-1.5 h-12" placeholder="Contoh: selesai, unit normal" /></div>
              </>
            )}
            {jenis !== "inspection" && (
              <div><Label>Kondisi Unit {jenis === "installation" ? "/ Instalasi" : ""}</Label><Input data-testid="work-kondisi" value={form.kondisi} onChange={(e) => setForm({ ...form, kondisi: e.target.value })} className="mt-1.5 h-12" placeholder="Contoh: baik, tidak ada kebocoran" /></div>
            )}
            {(jenis === "dismantling" || jenis === "return") && (
              <div><Label>Denda (Rp, jika ada kerusakan)</Label><Input type="number" data-testid="work-denda" value={form.denda} onChange={(e) => setForm({ ...form, denda: e.target.value })} className="mt-1.5 h-12" placeholder="0" /></div>
            )}
            <div><Label>Catatan</Label><Textarea data-testid="work-catatan" value={form.catatan} onChange={(e) => setForm({ ...form, catatan: e.target.value })} rows={3} className="mt-1.5" /></div>
            <div>
              <Label className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Foto Dokumentasi</Label>
              <label data-testid="work-foto-area" className="mt-2 flex items-center justify-center gap-3 border-2 border-dashed border-slate-300 rounded-2xl p-6 cursor-pointer hover:border-[#0047AB] hover:bg-slate-50 transition-colors min-h-[48px]">
                <UploadCloud className="w-6 h-6 text-slate-400" />
                <span className="text-sm text-slate-600 font-medium">{foto ? foto.name : "Ambil / pilih foto"}</span>
                <input data-testid="work-foto-input" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="hidden" onChange={(e) => setFoto(e.target.files[0] || null)} />
              </label>
            </div>
            <Button data-testid="btn-submit-work" onClick={submit} disabled={busy} className="w-full h-12 rounded-full bg-[#0047AB] hover:bg-[#003a8c] font-semibold">
              {busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />} Kirim Laporan
            </Button>
          </div>
        </section>
      ) : (
        <p className="mt-6 mb-10 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-2xl p-5 text-sm font-semibold" data-testid="task-done-note">Pekerjaan ini sudah selesai dilaporkan.</p>
      )}
    </div>
  );
}
