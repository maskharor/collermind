import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { ArrowLeft, MapPin, Phone, UploadCloud, Send, Loader2 } from "lucide-react";
import { toast } from "sonner";
import api, { fmtErr, rupiah, invalidCls } from "@/lib/api";
import { StatusBadge } from "@/components/StatusBadge";
import { usePolling } from "@/lib/usePolling";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

function PhotoField({ label, testid, file, onChange, invalid }) {
  return (
    <div>
      <Label className="text-xs font-bold uppercase tracking-[0.15em] text-slate-500">{label} *</Label>
      <label data-testid={`${testid}-area`} className={`mt-2 flex items-center justify-center gap-3 border-2 border-dashed border-slate-300 rounded-2xl p-5 cursor-pointer hover:border-[#0047AB] hover:bg-slate-50 transition-colors min-h-[48px] ${invalidCls(invalid)}`}>
        <UploadCloud className="w-6 h-6 text-slate-400" />
        <span className="text-sm text-slate-600 font-medium">{file ? file.name : "Ambil / pilih foto"}</span>
        <input data-testid={testid} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="hidden" onChange={(e) => onChange(e.target.files[0] || null)} />
      </label>
    </div>
  );
}

export default function CourierTask() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [kondisi, setKondisi] = useState("");
  const [catatan, setCatatan] = useState("");
  const [fotoSurat, setFotoSurat] = useState(null);
  const [fotoSerah, setFotoSerah] = useState(null);
  const [busy, setBusy] = useState(false);
  const [invalid, setInvalid] = useState(new Set());

  const load = () => api.get(`/courier/schedules/${id}`).then((r) => setData(r.data)).catch((e) => toast.error(fmtErr(e)));
  useEffect(() => { load(); }, [id]); // eslint-disable-line
  usePolling(load, 15000);

  if (!data) return <p className="text-slate-400">Memuat...</p>;
  const { schedule, order, customer, units } = data;
  const isDone = schedule.status === "done";

  async function submit() {
    if (!fotoSurat || !fotoSerah) {
      setInvalid(new Set([!fotoSurat && "foto_surat", !fotoSerah && "foto_serah"].filter(Boolean)));
      return toast.error("Kedua foto bukti wajib diunggah");
    }
    setInvalid(new Set());
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("kondisi", kondisi);
      fd.append("catatan", catatan);
      fd.append("foto_surat_jalan", fotoSurat);
      fd.append("foto_serah_terima", fotoSerah);
      await api.post(`/courier/schedules/${id}/submit`, fd);
      toast.success("Bukti serah terima terkirim");
      navigate("/kurir");
    } catch (e) {
      toast.error(fmtErr(e));
      setBusy(false);
    }
  }

  return (
    <div data-testid="courier-task">
      <Link to="/kurir" data-testid="courier-back" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-[#0047AB] transition-colors"><ArrowLeft className="w-4 h-4" /> Kembali</Link>

      <div className="flex items-center justify-between mt-4 flex-wrap gap-2">
        <h1 className="font-heading text-2xl font-bold tracking-tight text-slate-800">Pengiriman Unit</h1>
        <StatusBadge status={order.status} testid="courier-order-status" />
      </div>
      <p className="text-sm text-slate-500 mt-1">{order.kode} · {schedule.tanggal} {schedule.jam}</p>
      {schedule.catatan && <p className="text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-3 mt-3">Catatan admin: {schedule.catatan}</p>}

      <section className="bg-white border border-slate-200 rounded-2xl p-5 mt-6">
        <h2 className="font-heading font-bold text-slate-800 mb-3">Customer & Lokasi</h2>
        <p className="font-semibold text-slate-800">{customer.nama}</p>
        <p className="text-sm text-slate-500 mt-1 flex items-center gap-2"><Phone className="w-4 h-4" /> {customer.no_hp}</p>
        <p className="text-sm text-slate-500 mt-2 flex items-start gap-2"><MapPin className="w-4 h-4 mt-0.5 shrink-0" /> {customer.alamat_pemasangan}</p>
        {order.lokasi_detail && (
          <div className="mt-3 text-xs text-slate-500 bg-slate-50 rounded-lg p-3 space-y-1" data-testid="courier-lokasi-detail">
            <p>Lantai: {order.lokasi_detail.lantai} · Akses: {order.lokasi_detail.akses_lokasi}</p>
            {order.lokasi_detail.catatan_lokasi && <p>Catatan lokasi: {order.lokasi_detail.catatan_lokasi}</p>}
          </div>
        )}
      </section>

      <section className="bg-white border border-slate-200 rounded-2xl p-5 mt-4">
        <h2 className="font-heading font-bold text-slate-800 mb-3">Unit yang Dikirim</h2>
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
        <section className="bg-white border border-slate-200 rounded-2xl p-5 mt-4 mb-10" data-testid="delivery-form">
          <h2 className="font-heading font-bold text-slate-800 mb-4">Bukti Serah Terima</h2>
          <div className="space-y-4">
            <PhotoField label="Foto Surat Tanda Terima (sudah ditandatangani)" testid="foto-surat-jalan" file={fotoSurat} invalid={invalid.has("foto_surat")} onChange={(f) => { setFotoSurat(f); if (f && invalid.has("foto_surat")) { const n = new Set(invalid); n.delete("foto_surat"); setInvalid(n); } }} />
            <PhotoField label="Foto Customer dengan Unit AC" testid="foto-serah-terima" file={fotoSerah} invalid={invalid.has("foto_serah")} onChange={(f) => { setFotoSerah(f); if (f && invalid.has("foto_serah")) { const n = new Set(invalid); n.delete("foto_serah"); setInvalid(n); } }} />
            <div><Label>Kondisi Unit</Label><Input data-testid="delivery-kondisi" value={kondisi} onChange={(e) => setKondisi(e.target.value)} className="mt-1.5 h-12" placeholder="Contoh: baik, lengkap, segel" /></div>
            <div><Label>Catatan</Label><Textarea data-testid="delivery-catatan" value={catatan} onChange={(e) => setCatatan(e.target.value)} rows={3} className="mt-1.5" /></div>
            <Button data-testid="btn-submit-delivery" onClick={submit} disabled={busy} className="w-full h-12 rounded-full bg-[#0047AB] hover:bg-[#003a8c] font-semibold">
              {busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />} Konfirmasi Terkirim
            </Button>
          </div>
        </section>
      ) : (
        <p className="mt-6 mb-10 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-2xl p-5 text-sm font-semibold" data-testid="delivery-done-note">Pengiriman ini sudah selesai dikonfirmasi.</p>
      )}
    </div>
  );
}
