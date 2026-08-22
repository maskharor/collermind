import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { Search, Loader2, Lock, FileText, CalendarClock, CalendarIcon, Receipt, UploadCloud, MapPin, Truck, Download, MessageCircle, Repeat } from "lucide-react";
import { toast } from "sonner";
import PublicLayout from "@/layouts/PublicLayout";
import api, { API, fmtErr, rupiah, invalidCls } from "@/lib/api";
import { usePolling } from "@/lib/usePolling";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge, INVOICE_STATUS, PAYMENT_STATUS, JENIS_KEGIATAN } from "@/components/StatusBadge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";

const PAYABLE = ["issued", "payment_rejected", "overdue"];

function jakartaDatePlus(days = 0) {
  const base = new Date(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" }));
  base.setDate(base.getDate() + days);
  return base.toISOString().slice(0, 10);
}

export default function Tracking() {
  const [params] = useSearchParams();
  const [kode, setKode] = useState(params.get("kode") || localStorage.getItem("cm_last_order") || "");
  const [kontak, setKontak] = useState("");
  const [summary, setSummary] = useState(null);
  const [full, setFull] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [invalid, setInvalid] = useState(new Set());

  const [kontrakFile, setKontrakFile] = useState(null);
  const [lokasi, setLokasi] = useState({ ket_indoor: "", ket_outdoor: "", perkiraan_pipa: "" });
  const [fotoIndoor, setFotoIndoor] = useState(null);
  const [fotoOutdoor, setFotoOutdoor] = useState(null);
  const [schedReq, setSchedReq] = useState({ tanggal: "", catatan: "" });
  const [slotJam, setSlotJam] = useState("");
  const [slots, setSlots] = useState([]);
  const [slotCatatan, setSlotCatatan] = useState("");
  const [bukti, setBukti] = useState(null);
  const [payNote, setPayNote] = useState("");
  const [payInvoice, setPayInvoice] = useState(null);
  const minDeliveryDate = jakartaDatePlus(3);
  const iv = (k) => invalidCls(invalid.has(k));
  const markInvalid = (keys) => setInvalid(new Set(keys));
  const clearInvalid = (...keys) => {
    if (!keys.some((k) => invalid.has(k))) return;
    const next = new Set(invalid);
    keys.forEach((k) => next.delete(k));
    setInvalid(next);
  };

  async function search(k) {
    const key = (k ?? kode).trim();
    if (!key) return toast.error("Masukkan kode pengajuan");
    setLoading(true);
    try {
      const { data } = await api.get(`/public/track/${encodeURIComponent(key)}`);
      setSummary(data);
      setFull(null);
      localStorage.setItem("cm_last_order", data.kode);
    } catch (e) {
      setSummary(null);
      toast.error(fmtErr(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const k = params.get("kode") || localStorage.getItem("cm_last_order");
    if (k) search(k);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function unlock() {
    if (!kontak.trim()) return toast.error("Masukkan No WA atau email yang digunakan saat pengajuan");
    setBusy(true);
    try {
      const { data } = await api.post("/public/access", { kode: summary.kode, kontak: kontak.trim() });
      setFull(data);
      if (data.status === "delivered" && data.installation_date && data.installation_date >= jakartaDatePlus(0)) loadSlots(data.installation_date, true);
      toast.success("Akses terverifikasi");
    } catch (e) {
      toast.error(fmtErr(e));
    } finally {
      setBusy(false);
    }
  }

  async function refresh(silent = true) {
    try {
      const { data } = await api.post("/public/access", { kode: summary.kode, kontak: kontak.trim() });
      setFull(data);
      if (data.status === "delivered" && data.installation_date && data.installation_date >= jakartaDatePlus(0)) loadSlots(data.installation_date, true);
      const s = await api.get(`/public/track/${summary.kode}`);
      setSummary(s.data);
    } catch { /* ignore */ }
  }

  usePolling(() => {
    if (!summary) return;
    api.get(`/public/track/${summary.kode}`).then((s) => setSummary(s.data)).catch(() => {});
    if (full && kontak.trim()) refresh(true);
  }, 20000);

  async function uploadKontrak() {
    if (!kontrakFile) return toast.error("Pilih file PDF kontrak yang sudah ditandatangani");
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("kode", summary.kode);
      fd.append("kontak", kontak.trim());
      fd.append("dokumen", kontrakFile);
      await api.post("/public/contract/upload", fd);
      toast.success("Kontrak bertanda tangan berhasil diunggah");
      setKontrakFile(null);
      refresh();
    } catch (e) { toast.error(fmtErr(e)); } finally { setBusy(false); }
  }

  async function submitLokasi() {
    const errs = new Set();
    if (!fotoIndoor) errs.add("foto_indoor");
    if (!fotoOutdoor) errs.add("foto_outdoor");
    if (lokasi.ket_indoor.trim().length < 3) errs.add("ket_indoor");
    if (lokasi.ket_outdoor.trim().length < 3) errs.add("ket_outdoor");
    if (errs.size) {
      markInvalid([...errs]);
      return toast.error("Foto dan keterangan wajib diisi. Kolom kurang lengkap ditandai merah.");
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("kode", summary.kode);
      fd.append("kontak", kontak.trim());
      fd.append("ket_indoor", lokasi.ket_indoor);
      fd.append("ket_outdoor", lokasi.ket_outdoor);
      fd.append("perkiraan_pipa", lokasi.perkiraan_pipa ? Number(lokasi.perkiraan_pipa) : 0);
      fd.append("foto_indoor", fotoIndoor);
      fd.append("foto_outdoor", fotoOutdoor);
      await api.post("/public/location-detail", fd);
      toast.success("Detail lokasi tersimpan");
      markInvalid([]);
      refresh();
    } catch (e) { toast.error(fmtErr(e)); } finally { setBusy(false); }
  }

  async function proposeDelivery() {
    if (!schedReq.tanggal) {
      markInvalid(["sched_tanggal"]);
      return toast.error("Pilih tanggal usulan pengiriman");
    }
    if (schedReq.tanggal < minDeliveryDate) {
      markInvalid(["sched_tanggal"]);
      return toast.error(`Tanggal pengiriman minimal H+3 (${minDeliveryDate} atau setelahnya)`);
    }
    setBusy(true);
    try {
      await api.post("/public/schedule-request", { kode: summary.kode, kontak: kontak.trim(), jenis: "delivery", ...schedReq });
      toast.success("Usulan jadwal pengiriman terkirim. Admin akan mengonfirmasi.");
      markInvalid([]);
      refresh();
    } catch (e) { toast.error(fmtErr(e)); } finally { setBusy(false); }
  }

  async function confirmExtend(lanjut) {
    setBusy(true);
    try {
      await api.post("/public/extend", { kode: summary.kode, kontak: kontak.trim(), lanjut });
      toast.success(lanjut ? "Perpanjangan dikonfirmasi — tagihan bulanan berlanjut otomatis" : "Dikonfirmasi — sewa berakhir sesuai jadwal");
      refresh();
    } catch (e) { toast.error(fmtErr(e)); } finally { setBusy(false); }
  }

  async function loadSlots(tgl, silent = false) {
    setSlotJam("");
    setSlots([]);
    if (!tgl) return;
    try {
      const { data } = await api.get("/public/slots", { params: { tanggal: tgl } });
      setSlots(data.slots);
    } catch (e) {
      if (!silent) toast.error(fmtErr(e));
    }
  }

  async function proposeInstallation() {
    const tanggal = full?.installation_date;
    if (!tanggal) return toast.error("Menunggu konfirmasi unit AC berhasil terkirim. Tanggal instalasi otomatis H+1 setelah pengiriman.");
    if (!slotJam) {
      markInvalid(["slot_jam"]);
      return toast.error("Pilih slot jam instalasi");
    }
    setBusy(true);
    try {
      await api.post("/public/schedule-request", { kode: summary.kode, kontak: kontak.trim(), jenis: "installation", tanggal, jam: slotJam, catatan: slotCatatan });
      toast.success("Usulan jadwal instalasi terkirim. Admin akan memverifikasi.");
      markInvalid([]);
      refresh();
    } catch (e) { toast.error(fmtErr(e)); } finally { setBusy(false); }
  }

  async function uploadBukti(invoiceId) {
    if (!bukti) return toast.error("Pilih foto bukti pembayaran");
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("kode", summary.kode);
      fd.append("kontak", kontak.trim());
      fd.append("invoice_id", invoiceId);
      fd.append("catatan", payNote);
      fd.append("bukti", bukti);
      await api.post("/public/payments/upload", fd);
      toast.success("Bukti pembayaran terkirim, menunggu verifikasi admin");
      setBukti(null); setPayNote(""); setPayInvoice(null);
      refresh();
    } catch (e) { toast.error(fmtErr(e)); } finally { setBusy(false); }
  }

  const fmtD = (d) => (d ? format(new Date(d), "dd MMM yyyy", { locale: idLocale }) : "-");
  const fmtDT = (d) => (d ? format(new Date(d), "dd MMM yyyy HH:mm", { locale: idLocale }) : "-");

  const hasDeliverySchedule = full?.schedules?.some((s) => s.jenis_kegiatan === "delivery");
  const hasInstallationSchedule = full?.schedules?.some((s) => s.jenis_kegiatan === "installation");

  return (
    <PublicLayout>
      <div className="max-w-3xl mx-auto px-4 py-12" data-testid="tracking-page">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#0047AB] mb-2">Lacak Pengajuan</p>
        <h1 className="font-heading text-3xl sm:text-4xl font-black tracking-tight text-slate-900">Status Penyewaan Anda</h1>

        <div className="flex gap-3 mt-8">
          <Input data-testid="input-kode" value={kode} onChange={(e) => setKode(e.target.value)} placeholder="Contoh: CLM-20260808-XXXX" className="h-12"
            onKeyDown={(e) => e.key === "Enter" && search()} />
          <Button data-testid="btn-track" onClick={() => search()} disabled={loading} className="h-12 rounded-full px-6 bg-[#0047AB] hover:bg-[#003a8c]">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          </Button>
        </div>

        {summary && (
          <div className="mt-10 space-y-6" data-testid="tracking-result">
            <div className="border border-slate-200 rounded-2xl p-6">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <p className="text-xs text-slate-500">Order ID</p>
                  <p data-testid="track-kode" className="font-heading text-xl font-extrabold text-slate-900">{summary.kode}</p>
                  <p className="text-sm text-slate-500 mt-1">a.n. {summary.nama}</p>
                </div>
                <StatusBadge status={summary.status} testid="track-status" />
              </div>
              <div className="grid sm:grid-cols-3 gap-4 mt-6 text-sm">
                <div><p className="text-slate-500 text-xs">Tanggal Mulai</p><p className="font-semibold">{fmtD(summary.tanggal_mulai)}</p></div>
                <div><p className="text-slate-500 text-xs">Durasi</p><p className="font-semibold">{summary.durasi_sewa} bulan</p></div>
                <div><p className="text-slate-500 text-xs">Pembayaran</p>
                  <p className="font-semibold" data-testid="track-payment-status">{summary.payment_status === "paid" ? "Lunas" : summary.has_invoice ? (INVOICE_STATUS[summary.invoice_status]?.label || "-") : "Belum ada tagihan"}</p>
                </div>
              </div>
            </div>

            <div className="border border-slate-200 rounded-2xl p-6">
              <p className="font-heading font-bold text-slate-900 mb-5">Riwayat Status</p>
              <ol className="relative border-l-2 border-slate-200 ml-2 space-y-6" data-testid="track-timeline">
                {[...summary.status_history].reverse().map((h, i) => (
                  <li key={i} className="ml-6 relative">
                    <span className={`absolute -left-[31px] top-1 w-4 h-4 rounded-full border-2 ${i === 0 ? "bg-[#0047AB] border-[#0047AB]" : "bg-white border-slate-300"}`} />
                    <StatusBadge status={h.status} />
                    <p className="text-xs text-slate-500 mt-1">{fmtDT(h.at)} · oleh {h.by}</p>
                    {h.catatan && <p className="text-sm text-slate-600 mt-1">{h.catatan}</p>}
                  </li>
                ))}
              </ol>
            </div>

            {!full && (
              <div className="border-2 border-dashed border-slate-300 rounded-2xl p-6" data-testid="unlock-section">
                <div className="flex items-center gap-2 font-heading font-bold text-slate-900"><Lock className="w-4 h-4 text-[#0047AB]" /> Akses Detail, Kontrak & Invoice</div>
                <p className="text-sm text-slate-500 mt-2">Masukkan No WA atau email yang Anda gunakan saat pengajuan untuk melanjutkan proses (kontrak, jadwal, invoice).</p>
                <div className="flex gap-3 mt-4">
                  <Input data-testid="input-kontak" value={kontak} onChange={(e) => setKontak(e.target.value)} placeholder="08xxxxxxxxxx / email" className="h-12" onKeyDown={(e) => e.key === "Enter" && unlock()} />
                  <Button data-testid="btn-unlock" onClick={unlock} disabled={busy} className="h-12 rounded-full px-6 bg-[#0047AB] hover:bg-[#003a8c]">
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Buka Akses"}
                  </Button>
                </div>
              </div>
            )}

            {full && (
              <div className="space-y-6" data-testid="full-access">
                <div className="border border-slate-200 rounded-2xl p-6">
                  <p className="font-heading font-bold text-slate-900 mb-4">Detail Pengajuan</p>
                  <div className="space-y-1.5 text-sm">
                    {full.details.map((d, i) => (
                      <div key={i} className="flex justify-between"><span>{d.nama} ×{d.quantity}</span><span className="font-medium">{rupiah(d.harga)}/bln</span></div>
                    ))}
                    {full.jenis_ruangan && <p className="text-slate-500 pt-1">Ruangan: {full.jenis_ruangan} · Durasi: {full.durasi_sewa} bulan</p>}
                  </div>
                  {full.estimasi && full.payment_status !== "paid" && !full.invoice && (
                    <div className="mt-4 pt-4 border-t border-slate-100 space-y-1.5 text-sm" data-testid="estimasi-box">
                      <p className="font-semibold text-slate-800">Estimasi Biaya Awal</p>
                      <div className="flex justify-between"><span className="text-slate-500">Sewa bulan pertama</span><span>{rupiah(full.estimasi.sewa_bulan_pertama)}</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">Jasa Pasang</span><span>{rupiah(full.estimasi.jasa_pasang)}</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">Jasa Lepas</span><span>{rupiah(full.estimasi.jasa_lepas)}</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">Extra pipa</span><span className="italic text-slate-400">setelah pengukuran teknisi</span></div>
                      <div className="flex justify-between font-bold pt-2 border-t border-slate-100"><span>Total estimasi</span><span className="text-[#0047AB]">{rupiah(full.estimasi.total)}</span></div>
                    </div>
                  )}
                </div>

                {full.contract && (
                  <div className="border border-slate-200 rounded-2xl p-6" data-testid="contract-section">
                    <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
                      <p className="font-heading font-bold text-slate-900 flex items-center gap-2"><FileText className="w-5 h-5 text-[#0047AB]" /> Kontrak Digital {full.contract.content?.nomor}</p>
                      {full.contract.status === "signed"
                        ? <span data-testid="contract-signed-badge" className="text-xs font-semibold px-3 py-1 rounded-full bg-emerald-100 text-emerald-700">Ditandatangani</span>
                        : <span data-testid="contract-pending-badge" className="text-xs font-semibold px-3 py-1 rounded-full bg-amber-100 text-amber-700">Menunggu Tanda Tangan</span>}
                    </div>
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 text-sm space-y-2">
                      <div className="grid sm:grid-cols-2 gap-2">
                        <p><span className="text-slate-500">Pihak Pertama:</span> {full.contract.content?.pihak_pertama}</p>
                        <p><span className="text-slate-500">Pihak Kedua:</span> {full.contract.content?.pihak_kedua}</p>
                      </div>
                      <p><span className="text-slate-500">Lokasi:</span> {full.contract.content?.alamat_pemasangan}</p>
                      <ul className="list-disc ml-5 text-slate-700">{(full.contract.content?.items || []).map((it, i) => <li key={i}>{it}</li>)}</ul>
                      <p><span className="text-slate-500">Durasi:</span> {full.contract.content?.durasi} · <span className="text-slate-500">Mulai:</span> {full.contract.content?.tanggal_mulai} · <span className="text-slate-500">Sewa:</span> {full.contract.content?.sewa_bulanan}/bulan</p>
                      <div className="pt-2 border-t border-slate-200">
                        <p className="text-slate-500 mb-1">Ketentuan:</p>
                        <ol className="list-decimal ml-5 space-y-1 text-slate-600 text-xs">{(full.contract.content?.terms || []).map((t, i) => <li key={i}>{t}</li>)}</ol>
                      </div>
                    </div>
                    {full.contract.status === "signed" ? (
                      <div className="mt-3 space-y-2">
                        <p className="text-xs text-slate-500">Ditandatangani oleh <b>{full.contract.signer_name}</b> pada {fmtDT(full.contract.signed_at)}</p>
                        {full.contract?.pdf_path ? (
                          <p className="text-xs text-emerald-600 font-semibold" data-testid="contract-pdf-note">Kontrak PDF bertanda tangan telah diterima dan dapat dilihat admin pada halaman rental order.</p>
                        ) : (
                          <p className="text-xs text-emerald-600 font-semibold" data-testid="contract-signed-note">Kontrak digital telah ditandatangani dan diterima admin.</p>
                        )}
                      </div>
                    ) : (
                      <div className="mt-4 space-y-3">
                        <p className="text-sm text-slate-500">Unduh dokumen kontrak yang sudah terisi data Anda, tanda tangani (digital/manual), lalu unggah kembali dalam bentuk PDF.</p>
                        <a data-testid="btn-download-contract" href={`${API}/public/contract/download?kode=${encodeURIComponent(summary.kode)}&kontak=${encodeURIComponent(kontak.trim())}`}
                          className="inline-flex items-center gap-2 rounded-full border-2 border-[#0047AB] text-[#0047AB] px-6 py-2.5 text-sm font-semibold hover:bg-[#0047AB] hover:text-white transition-colors">
                          <Download className="w-4 h-4" /> Unduh Kontrak (DOCX)
                        </a>
                        <label data-testid="kontrak-upload-area" className="flex items-center justify-center gap-3 border-2 border-dashed border-slate-300 rounded-2xl p-6 cursor-pointer hover:border-[#0047AB] hover:bg-slate-50 transition-colors">
                          <UploadCloud className="w-6 h-6 text-slate-400" />
                          <span className="text-sm text-slate-600 font-medium">{kontrakFile ? kontrakFile.name : "Unggah kontrak bertanda tangan (PDF)"}</span>
                          <input data-testid="input-kontrak-pdf" type="file" accept="application/pdf" className="hidden" onChange={(e) => setKontrakFile(e.target.files[0] || null)} />
                        </label>
                        <Button data-testid="btn-upload-contract" onClick={uploadKontrak} disabled={busy || !kontrakFile} className="rounded-full bg-[#0047AB] hover:bg-[#003a8c]">
                          {busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null} Kirim Kontrak Bertanda Tangan
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {full.contract_status === "signed" && !full.lokasi_detail && full.status === "verified" && (
                  <div className="border border-slate-200 rounded-2xl p-6" data-testid="location-form-section">
                    <p className="font-heading font-bold text-slate-900 flex items-center gap-2 mb-2"><MapPin className="w-5 h-5 text-[#0047AB]" /> Form Lanjutan — Detail Lokasi Pemasangan</p>
                    <div className="space-y-4 mt-4">
                      <div>
                        <Label className="text-xs font-bold uppercase tracking-[0.15em] text-slate-700">Foto rencana AC indoor + sumber listrik terdekat *</Label>
                        <label data-testid="foto-indoor-area" className={`mt-2 flex items-center justify-center gap-3 border-2 border-dashed border-slate-300 rounded-2xl p-5 cursor-pointer hover:border-[#0047AB] hover:bg-slate-50 transition-colors ${iv("foto_indoor")}`}>
                          <UploadCloud className="w-6 h-6 text-slate-500" />
                          <span className="text-sm text-slate-700 font-semibold">{fotoIndoor ? fotoIndoor.name : "Ambil / pilih foto indoor"}</span>
                          <input data-testid="input-foto-indoor" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="hidden" onChange={(e) => { setFotoIndoor(e.target.files[0] || null); clearInvalid("foto_indoor"); }} />
                        </label>
                        <Input data-testid="ket-indoor" value={lokasi.ket_indoor} onChange={(e) => { setLokasi({ ...lokasi, ket_indoor: e.target.value }); clearInvalid("ket_indoor"); }} className={`mt-2 placeholder:text-slate-500 ${iv("ket_indoor")}`} placeholder="Keterangan wajib: posisi indoor & jarak stop kontak terdekat *" />
                      </div>
                      <div>
                        <Label className="text-xs font-bold uppercase tracking-[0.15em] text-slate-700">Foto rencana AC outdoor dipasang di mana *</Label>
                        <label data-testid="foto-outdoor-area" className={`mt-2 flex items-center justify-center gap-3 border-2 border-dashed border-slate-300 rounded-2xl p-5 cursor-pointer hover:border-[#0047AB] hover:bg-slate-50 transition-colors ${iv("foto_outdoor")}`}>
                          <UploadCloud className="w-6 h-6 text-slate-500" />
                          <span className="text-sm text-slate-700 font-semibold">{fotoOutdoor ? fotoOutdoor.name : "Ambil / pilih foto lokasi outdoor"}</span>
                          <input data-testid="input-foto-outdoor" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="hidden" onChange={(e) => { setFotoOutdoor(e.target.files[0] || null); clearInvalid("foto_outdoor"); }} />
                        </label>
                        <Input data-testid="ket-outdoor" value={lokasi.ket_outdoor} onChange={(e) => { setLokasi({ ...lokasi, ket_outdoor: e.target.value }); clearInvalid("ket_outdoor"); }} className={`mt-2 placeholder:text-slate-500 ${iv("ket_outdoor")}`} placeholder="Keterangan wajib: outdoor dipasang di mana *" />
                      </div>
                      <div>
                        <Label>Perkiraan pipa yang dibutuhkan (meter)</Label>
                        <Input type="number" min="0" step="0.5" data-testid="input-perkiraan-pipa" value={lokasi.perkiraan_pipa} onChange={(e) => setLokasi({ ...lokasi, perkiraan_pipa: e.target.value })} className="mt-1.5" placeholder="mis. 4" />
                        <p className="text-xs text-slate-500 mt-1">Hanya perkiraan — biaya extra pipa final dihitung dari pipa terpakai saat instalasi.</p>
                      </div>
                    </div>
                    <Button data-testid="btn-submit-lokasi" onClick={submitLokasi} disabled={busy} className="mt-4 rounded-full bg-[#0047AB] hover:bg-[#003a8c]">
                      {busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null} Simpan Detail Lokasi
                    </Button>
                  </div>
                )}

                {full.contract_status === "signed" && full.lokasi_detail && full.status === "verified" && !hasDeliverySchedule && (
                  <div className="border border-slate-200 rounded-2xl p-6" data-testid="delivery-request-section">
                    <p className="font-heading font-bold text-slate-900 flex items-center gap-2 mb-2"><Truck className="w-5 h-5 text-[#0047AB]" /> Usulan Jadwal Pengiriman</p>
                    {full.schedule_request?.jenis === "delivery" ? (
                      <p className="text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-3" data-testid="delivery-request-pending">
                        Usulan Anda: <b>{full.schedule_request.tanggal} {full.schedule_request.jam}</b> — menunggu konfirmasi admin (bila bertabrakan, kami akan menghubungi Anda).
                      </p>
                    ) : (
                      <div className="space-y-3">
                        <p className="text-sm text-slate-500">Detail lokasi tersimpan. Usulkan tanggal pengiriman unit.</p>
                        <p className="text-sm bg-blue-50 border border-blue-200 text-blue-800 rounded-xl p-3">Tanggal pengiriman minimal H+3 dari hari ini (paling cepat {minDeliveryDate}). Estimasi pengiriman ±3 hari setelah jadwal dikonfirmasi admin.</p>
                        <div>
                          <Label>Tanggal Usulan Pengiriman</Label>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button type="button" variant="outline" data-testid="req-tanggal" className={`w-full justify-start mt-1.5 h-12 font-normal ${iv("sched_tanggal")}`}>
                                <CalendarIcon className="mr-2 h-4 w-4 text-[#0047AB]" />
                                {schedReq.tanggal ? format(new Date(`${schedReq.tanggal}T00:00:00`), "dd MMMM yyyy", { locale: idLocale }) : `Pilih tanggal (minimal ${minDeliveryDate})`}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar mode="single" selected={schedReq.tanggal ? new Date(`${schedReq.tanggal}T00:00:00`) : undefined}
                                onSelect={(d) => { setSchedReq({ ...schedReq, tanggal: d ? format(d, "yyyy-MM-dd") : "" }); clearInvalid("sched_tanggal"); }}
                                disabled={(d) => d < new Date(`${minDeliveryDate}T00:00:00`)} />
                            </PopoverContent>
                          </Popover>
                        </div>
                        <Textarea data-testid="req-catatan" value={schedReq.catatan} onChange={(e) => setSchedReq({ ...schedReq, catatan: e.target.value })} placeholder="Catatan (opsional)" rows={2} />
                        <Button data-testid="btn-propose-delivery" onClick={proposeDelivery} disabled={busy} className="rounded-full bg-[#0047AB] hover:bg-[#003a8c]">Kirim Usulan Pengiriman</Button>
                      </div>
                    )}
                  </div>
                )}

                {full.status === "delivered" && !hasInstallationSchedule && (
                  <div className="border border-slate-200 rounded-2xl p-6" data-testid="installation-slot-section">
                    <p className="font-heading font-bold text-slate-900 flex items-center gap-2 mb-2"><CalendarClock className="w-5 h-5 text-[#0047AB]" /> Pilih Jadwal Instalasi</p>
                    {full.schedule_request?.jenis === "installation" ? (
                      <p className="text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-3" data-testid="installation-request-pending">
                        Usulan Anda: <b>{full.schedule_request.tanggal} {full.schedule_request.jam}</b> — menunggu verifikasi admin.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        <p className="text-sm text-slate-500">Unit sudah diterima. Tanggal instalasi dibuat otomatis <b>H+1 setelah AC terkirim</b>; Anda hanya memilih jam.</p>
                        <p className="text-sm bg-blue-50 border border-blue-200 text-blue-800 rounded-xl p-3" data-testid="installation-auto-date">
                          Tanggal instalasi otomatis: <b>{full.installation_date || "menunggu konfirmasi pengiriman"}</b>
                        </p>
                        {slots.length > 0 && (
                          <div className={`grid grid-cols-2 sm:grid-cols-4 gap-2 rounded-xl ${invalid.has("slot_jam") ? "ring-1 ring-red-500 p-2" : ""}`} data-testid="slot-list">
                            {slots.map((s) => (
                              <button key={s.jam} type="button" disabled={!s.tersedia} data-testid={`slot-${s.jam}`}
                                onClick={() => { setSlotJam(s.jam); clearInvalid("slot_jam"); }}
                                className={`h-12 rounded-xl border font-semibold text-sm transition-colors ${slotJam === s.jam ? "bg-[#0047AB] text-white border-[#0047AB]" : s.tersedia ? "bg-white border-slate-200 hover:border-[#0047AB]" : "bg-slate-100 text-slate-300 border-slate-100 cursor-not-allowed"}`}>
                                {s.jam}{!s.tersedia && <span className="block text-[10px] font-normal">Penuh</span>}
                              </button>
                            ))}
                          </div>
                        )}
                        <Textarea data-testid="slot-catatan" value={slotCatatan} onChange={(e) => setSlotCatatan(e.target.value)} placeholder="Catatan (opsional)" rows={2} />
                        <Button data-testid="btn-propose-installation" onClick={proposeInstallation} disabled={busy || !slotJam || !full.installation_date} className="rounded-full bg-[#0047AB] hover:bg-[#003a8c]">Kirim Usulan Instalasi</Button>
                      </div>
                    )}
                  </div>
                )}

                {full.schedules.length > 0 && (
                  <div className="border border-slate-200 rounded-2xl p-6" data-testid="confirmed-schedules">
                    <p className="font-heading font-bold text-slate-900 mb-3">Jadwal Terkonfirmasi</p>
                    <div className="space-y-2 text-sm">
                      {full.schedules.map((s, i) => (
                        <div key={i} className="flex justify-between border border-slate-100 rounded-lg p-3">
                          <span>{JENIS_KEGIATAN[s.jenis_kegiatan]} · {s.tanggal} {s.jam}</span>
                          <span className={`text-xs font-semibold ${s.status === "done" ? "text-emerald-600" : "text-[#0047AB]"}`}>{s.status === "done" ? "Selesai" : "Terkonfirmasi"}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {full.invoices.length > 0 && (
                  <div className="space-y-4" data-testid="invoices-section">
                    {full.invoices.map((inv) => (
                      <div key={inv.id} className="border border-slate-200 rounded-2xl p-6" data-testid={`invoice-${inv.nomor}`}>
                        <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
                          <p className="font-heading font-bold text-slate-900 flex items-center gap-2">
                            <Receipt className="w-5 h-5 text-[#0047AB]" /> {inv.nomor}
                            {inv.jenis === "monthly" && <span className="text-xs font-normal text-slate-400">Bulan ke-{inv.periode}</span>}
                          </p>
                          <StatusBadge status={inv.status} map={{ ...INVOICE_STATUS, scheduled: { label: "Terjadwal", cls: "bg-slate-100 text-slate-500 border-slate-200" }, overdue: { label: "Jatuh Tempo Terlewat", cls: "bg-red-100 text-red-800 border-red-200" } }} testid={`invoice-status-${inv.nomor}`} />
                        </div>
                        <div className="space-y-1.5 text-sm">
                          {inv.items.map((it, i) => (
                            <div key={i} className="flex justify-between"><span className="text-slate-600">{it.label}</span><span className="font-medium">{rupiah(it.amount)}</span></div>
                          ))}
                          <div className="flex justify-between font-bold pt-2 border-t border-slate-100 text-base">
                            <span>Total Tagihan</span><span className="text-[#0047AB]">{rupiah(inv.total)}</span>
                          </div>
                          <div className="flex items-center justify-between gap-3 pt-1">
                            <p className="text-xs text-slate-400">Jatuh tempo: {inv.due_date}</p>
                            <a data-testid={`invoice-download-${inv.nomor}`} href={`${API}/public/invoice/download?kode=${encodeURIComponent(summary.kode)}&kontak=${encodeURIComponent(kontak.trim())}&invoice_id=${encodeURIComponent(inv.id)}`}
                              className="inline-flex items-center gap-1 text-xs font-semibold text-[#0047AB] hover:underline">
                              <Download className="w-3.5 h-3.5" /> Unduh Invoice
                            </a>
                          </div>
                        </div>
                        {inv.status !== "scheduled" && (
                          <div className="mt-4 bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm" data-testid={`rekening-${inv.nomor}`}>
                            <p className="font-semibold text-slate-800">Transfer ke:</p>
                            <p className="font-heading font-bold text-[#0047AB] mt-1">{inv.rekening}</p>
                            <p className="text-xs text-slate-500 mt-1">Wilayah: {inv.region}</p>
                          </div>
                        )}
                        {PAYABLE.includes(inv.status) && (
                          <div className="mt-4" data-testid={`pay-section-${inv.nomor}`}>
                            {inv.status === "payment_rejected" && (
                              <p className="mb-3 text-sm bg-red-50 border border-red-200 text-red-700 rounded-xl p-3">Pembayaran sebelumnya ditolak. Silakan unggah ulang bukti yang benar.</p>
                            )}
                            {payInvoice === inv.id ? (
                              <div className="space-y-3">
                                <label data-testid={`bukti-area-${inv.nomor}`} className="flex items-center justify-center gap-3 border-2 border-dashed border-slate-300 rounded-2xl p-6 cursor-pointer hover:border-[#0047AB] hover:bg-slate-50 transition-colors">
                                  <UploadCloud className="w-6 h-6 text-slate-400" />
                                  <span className="text-sm text-slate-600 font-medium">{bukti ? bukti.name : "Pilih foto/screenshot bukti transfer"}</span>
                                  <input data-testid={`input-bukti-${inv.nomor}`} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => setBukti(e.target.files[0] || null)} />
                                </label>
                                <Input data-testid={`pay-note-${inv.nomor}`} value={payNote} onChange={(e) => setPayNote(e.target.value)} placeholder="Catatan (opsional): nama pengirim, bank" />
                                <div className="flex gap-2">
                                  <Button data-testid={`btn-upload-bukti-${inv.nomor}`} onClick={() => uploadBukti(inv.id)} disabled={busy} className="flex-1 h-12 rounded-full bg-emerald-600 hover:bg-emerald-700 font-semibold">
                                    {busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null} Kirim Bukti Pembayaran
                                  </Button>
                                  <Button variant="outline" onClick={() => { setPayInvoice(null); setBukti(null); }} className="rounded-full">Batal</Button>
                                </div>
                              </div>
                            ) : (
                              <Button data-testid={`btn-pay-${inv.nomor}`} onClick={() => setPayInvoice(inv.id)} className="w-full h-12 rounded-full bg-emerald-600 hover:bg-emerald-700 font-semibold">
                                Bayar & Upload Bukti ({rupiah(inv.total)})
                              </Button>
                            )}
                          </div>
                        )}
                        {inv.status === "waiting_payment" && (
                          <p className="mt-4 text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-3" data-testid={`waiting-${inv.nomor}`}>Bukti pembayaran sedang diverifikasi admin.</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {["active", "maintenance"].includes(full.status) && (
                  <div className="border border-slate-200 rounded-2xl p-6" data-testid="extension-section">
                    <p className="font-heading font-bold text-slate-900 flex items-center gap-2 mb-2"><Repeat className="w-5 h-5 text-[#0047AB]" /> Perpanjangan Sewa</p>
                    {full.perpanjangan === "open_ended" ? (
                      <p className="text-sm bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl p-3" data-testid="extension-active">Sewa berlanjut otomatis — tagihan bulanan akan terus terbit setiap bulan sampai Anda mengakhiri sewa.</p>
                    ) : full.perpanjangan === "berakhir_sesuai_jadwal" ? (
                      <p className="text-sm bg-slate-50 border border-slate-200 text-slate-600 rounded-xl p-3" data-testid="extension-ended">Anda memilih sewa berakhir sesuai jadwal. Hubungi admin bila berubah pikiran.</p>
                    ) : (
                      <>
                        <p className="text-sm text-slate-500">Masa sewa Anda {full.durasi_sewa} bulan. Ingin melanjutkan sewa setelahnya? Tagihan bulanan akan terjadwal otomatis tanpa batas durasi.</p>
                        <div className="flex gap-3 mt-4">
                          <Button data-testid="btn-extend-yes" onClick={() => confirmExtend(true)} disabled={busy} className="rounded-full bg-emerald-600 hover:bg-emerald-700">Ya, Lanjutkan Sewa</Button>
                          <Button data-testid="btn-extend-no" variant="outline" onClick={() => confirmExtend(false)} disabled={busy} className="rounded-full">Tidak, Berakhir Sesuai Jadwal</Button>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {full.payments.length > 0 && (
                  <div className="border border-slate-200 rounded-2xl p-6" data-testid="payment-history">
                    <p className="font-heading font-bold text-slate-900 mb-4">Riwayat Pembayaran</p>
                    <div className="space-y-2">
                      {full.payments.map((p) => (
                        <div key={p.id} className="flex items-center justify-between text-sm border border-slate-100 rounded-lg p-3 flex-wrap gap-2">
                          <span>{fmtDT(p.tanggal_pembayaran)} · {rupiah(p.jumlah)}</span>
                          <div className="flex items-center gap-2">
                            {p.admin_catatan && p.status === "rejected" && <span className="text-xs text-red-500">{p.admin_catatan}</span>}
                            <StatusBadge status={p.status} map={PAYMENT_STATUS} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            <div className="border border-slate-200 rounded-2xl p-6" data-testid="contact-admin">
              <p className="font-heading font-bold text-slate-900 mb-2 flex items-center gap-2"><MessageCircle className="w-5 h-5 text-emerald-600" /> Ada yang perlu ditanyakan?</p>
              <p className="text-sm text-slate-500 mb-4">Hubungi admin kami via WhatsApp:</p>
              <div className="flex gap-3 flex-wrap">
                <a data-testid="wa-admin-1" href="https://wa.me/6285695965790" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full bg-emerald-600 text-white px-5 py-2.5 text-sm font-semibold hover:bg-emerald-700 transition-colors">
                  <MessageCircle className="w-4 h-4" /> Admin 1 — 0856-9596-5790
                </a>
                <a data-testid="wa-admin-2" href="https://wa.me/6281232576420" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full bg-emerald-600 text-white px-5 py-2.5 text-sm font-semibold hover:bg-emerald-700 transition-colors">
                  <MessageCircle className="w-4 h-4" /> Admin 2 — 0812-3257-6420
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    </PublicLayout>
  );
}
