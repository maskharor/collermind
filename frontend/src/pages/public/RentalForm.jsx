import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { CalendarIcon, Minus, Plus, UploadCloud, CheckCircle2, Copy } from "lucide-react";
import { toast } from "sonner";
import PublicLayout from "@/layouts/PublicLayout";
import api, { fmtErr, rupiah } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";

const STEPS = ["Data Penyewa", "Lokasi", "Detail AC", "Durasi & Jadwal", "Identitas", "Data RT/Pemilik", "Persetujuan", "Ringkasan"];
const JASA_PASANG = 350000;
const JASA_LEPAS = 300000;

export default function RentalForm() {
  const [step, setStep] = useState(0);
  const [tariffs, setTariffs] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  const [form, setForm] = useState({
    nama: "", email: "", no_hp: "",
    alamat_ktp: "", alamat_pemasangan: "", status_hunian: "", jenis_ruangan: "",
    durasi_sewa: 3, catatan: "",
    nama_pj_lokasi: "", no_hp_pj_lokasi: "",
  });
  const [tanggalMulai, setTanggalMulai] = useState(null);
  const [qty, setQty] = useState({});
  const [ktp, setKtp] = useState(null);
  const [consent, setConsent] = useState(false);

  useEffect(() => {
    api.get("/public/tariffs").then((r) => setTariffs(r.data)).catch((e) => toast.error(fmtErr(e)));
  }, []);

  const sewaBulanan = useMemo(() => tariffs.reduce((sum, t) => sum + (qty[t.id] || 0) * t.harga_per_bulan, 0), [tariffs, qty]);
  const totalUnits = useMemo(() => Object.values(qty).reduce((a, b) => a + b, 0), [qty]);
  const estimasiTotal = sewaBulanan + JASA_PASANG + JASA_LEPAS;

  const set = (k) => (e) => setForm({ ...form, [k]: e.target ? e.target.value : e });

  function validateStep() {
    if (step === 0) {
      if (form.nama.trim().length < 3) return "Nama lengkap wajib diisi (sesuai KTP)";
      if (form.no_hp.trim().length < 9) return "Nomor WhatsApp wajib diisi";
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email)) return "Email tidak valid";
    }
    if (step === 1) {
      if (form.alamat_pemasangan.trim().length < 10) return "Alamat pemasangan wajib diisi lengkap";
      if (!form.status_hunian) return "Pilih status hunian";
      if (!form.jenis_ruangan) return "Pilih jenis ruangan";
    }
    if (step === 2 && totalUnits === 0) return "Pilih minimal 1 unit AC";
    if (step === 3 && !tanggalMulai) return "Pilih tanggal mulai pasang";
    if (step === 4) {
      if (form.alamat_ktp.trim().length < 10) return "Alamat sesuai KTP wajib diisi";
      if (!ktp) return "Foto KTP wajib diunggah";
    }
    if (step === 5) {
      if (form.nama_pj_lokasi.trim().length < 3) return "Nama Ketua RT / Pemilik Kos / Kontrakan wajib diisi";
      if (form.no_hp_pj_lokasi.trim().length < 9) return "Nomor HP penanggung jawab lokasi wajib diisi";
    }
    if (step === 6 && !consent) return "Centang persetujuan penggunaan data untuk melanjutkan";
    return null;
  }

  function next() {
    const err = validateStep();
    if (err) return toast.error(err);
    setStep(step + 1);
  }

  async function submit() {
    setSubmitting(true);
    try {
      const items = Object.entries(qty).filter(([, q]) => q > 0).map(([tariff_id, quantity]) => ({ tariff_id, quantity }));
      const payload = {
        ...form,
        tanggal_mulai: format(tanggalMulai, "yyyy-MM-dd"),
        durasi_sewa: Number(form.durasi_sewa),
        data_consent: consent,
        items,
      };
      const fd = new FormData();
      fd.append("payload", JSON.stringify(payload));
      fd.append("ktp", ktp);
      const { data } = await api.post("/public/rentals", fd);
      localStorage.setItem("cm_last_order", data.kode);
      setResult(data);
      toast.success("Pengajuan rental berhasil");
    } catch (e) {
      toast.error(fmtErr(e));
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <PublicLayout>
        <div className="max-w-2xl mx-auto px-4 py-20 text-center" data-testid="rental-success">
          <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto" />
          <h1 className="font-heading text-3xl sm:text-4xl font-black tracking-tight text-slate-900 mt-6">Pengajuan Rental Berhasil!</h1>
          <p className="text-slate-600 mt-3 leading-relaxed">Simpan kode pengajuan (Order ID) berikut untuk melacak status penyewaan Anda:</p>
          <div className="mt-6 inline-flex items-center gap-3 bg-slate-900 text-white rounded-2xl px-8 py-5">
            <span data-testid="rental-kode" className="font-heading text-xl sm:text-2xl font-extrabold tracking-wider">{result.kode}</span>
            <button data-testid="copy-kode-btn" onClick={() => { navigator.clipboard.writeText(result.kode); toast.success("Kode disalin"); }} className="text-cyan-400 hover:text-cyan-300 transition-colors">
              <Copy className="w-5 h-5" />
            </button>
          </div>
          <div className="mt-8 text-left bg-slate-50 border border-slate-200 rounded-2xl p-6 text-sm space-y-2" data-testid="next-steps-info">
            <p className="font-heading font-bold text-slate-900 mb-3">Langkah selanjutnya:</p>
            <p>1. Admin kami akan memverifikasi data Anda.</p>
            <p>2. Setelah disetujui, Anda akan menandatangani <b>kontrak digital</b> melalui halaman tracking.</p>
            <p>3. Anda dapat mengusulkan jadwal pemasangan, lalu admin mengonfirmasi sesuai ketersediaan teknisi.</p>
            <p>4. Setelah instalasi selesai, <b>invoice diterbitkan</b> dan Anda melakukan pembayaran via transfer.</p>
            <p className="text-slate-500 italic pt-2">Pembayaran tidak dilakukan sekarang — cukup setelah instalasi selesai dan invoice terbit.</p>
          </div>
          <div className="mt-8 flex justify-center gap-4 flex-wrap">
            <a href={`/tracking?kode=${result.kode}`} data-testid="goto-tracking-btn" className="rounded-full bg-[#0047AB] text-white px-8 py-3 font-semibold hover:bg-[#003a8c] hover:-translate-y-0.5 transition-[transform,background-color] duration-200">Lacak Status</a>
            <a href="/" data-testid="back-home-btn" className="rounded-full border-2 border-slate-200 px-8 py-3 font-semibold text-slate-700 hover:border-[#0047AB] hover:text-[#0047AB] transition-colors duration-200">Kembali ke Beranda</a>
          </div>
        </div>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout>
      <div className="max-w-3xl mx-auto px-4 py-12" data-testid="rental-form-page">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#0047AB] mb-2">Form Pengajuan Sewa</p>
        <h1 className="font-heading text-3xl sm:text-4xl font-black tracking-tight text-slate-900">Ajukan Penyewaan AC</h1>

        <div className="flex items-center gap-1.5 mt-8 mb-10 overflow-x-auto pb-2" data-testid="form-steps">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-1.5 shrink-0">
              <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${i <= step ? "bg-[#0047AB] text-white" : "bg-slate-100 text-slate-400"}`}>{i + 1}</span>
              <span className={`text-[11px] font-semibold whitespace-nowrap ${i <= step ? "text-slate-800" : "text-slate-400"}`}>{s}</span>
              {i < STEPS.length - 1 && <div className={`w-4 h-0.5 ${i < step ? "bg-[#0047AB]" : "bg-slate-200"}`} />}
            </div>
          ))}
        </div>

        {step === 0 && (
          <div className="space-y-5" data-testid="step-0">
            <h2 className="font-heading font-bold text-lg text-slate-800">Section 1 — Data Penyewa</h2>
            <div><Label htmlFor="nama">Nama Lengkap (sesuai KTP) *</Label><Input id="nama" data-testid="input-nama" value={form.nama} onChange={set("nama")} className="mt-1.5" /></div>
            <div className="grid sm:grid-cols-2 gap-5">
              <div><Label htmlFor="no_hp">No WhatsApp Aktif *</Label><Input id="no_hp" data-testid="input-no-hp" value={form.no_hp} onChange={set("no_hp")} placeholder="08xxxxxxxxxx" className="mt-1.5" /></div>
              <div><Label htmlFor="email">Email *</Label><Input id="email" data-testid="input-email" type="email" value={form.email} onChange={set("email")} placeholder="email@contoh.com" className="mt-1.5" /></div>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-5" data-testid="step-1">
            <h2 className="font-heading font-bold text-lg text-slate-800">Section 2 — Data Lokasi Pemasangan</h2>
            <div><Label htmlFor="alamat_pemasangan">Alamat Pemasangan AC *</Label><Textarea id="alamat_pemasangan" data-testid="input-alamat-pemasangan" value={form.alamat_pemasangan} onChange={set("alamat_pemasangan")} rows={3} className="mt-1.5" placeholder="Tulis lengkap beserta kota (mis. Jakarta Selatan, Depok, Tangerang Selatan)" /></div>
            <div className="grid sm:grid-cols-2 gap-5">
              <div>
                <Label>Status Hunian *</Label>
                <Select value={form.status_hunian} onValueChange={(v) => setForm({ ...form, status_hunian: v })}>
                  <SelectTrigger data-testid="select-status-hunian" className="mt-1.5"><SelectValue placeholder="Pilih status hunian" /></SelectTrigger>
                  <SelectContent>{["Kos", "Kontrakan", "Rumah", "Ruko", "Kantor"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Jenis Ruangan *</Label>
                <Select value={form.jenis_ruangan} onValueChange={(v) => setForm({ ...form, jenis_ruangan: v })}>
                  <SelectTrigger data-testid="select-jenis-ruangan" className="mt-1.5"><SelectValue placeholder="Pilih jenis ruangan" /></SelectTrigger>
                  <SelectContent>{["Kamar", "Ruang Tamu", "Ruang Kantor", "Ruang Usaha", "Lainnya"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5" data-testid="step-2">
            <h2 className="font-heading font-bold text-lg text-slate-800">Section 3 — Detail AC</h2>
            <p className="text-sm text-slate-500">Pilih tipe dan jumlah unit. Bisa kombinasi beberapa tipe sekaligus.</p>
            <div className="space-y-3">
              {tariffs.map((t) => (
                <div key={t.id} data-testid={`tariff-item-${t.id}`} className="flex items-center justify-between border border-slate-200 rounded-2xl p-4 hover:border-[#0047AB]/40 transition-colors">
                  <div>
                    <p className="font-heading font-bold text-slate-900">{t.nama}</p>
                    <p className="text-xs text-slate-500">{rupiah(t.harga_per_bulan)}/bulan/unit</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button type="button" data-testid={`qty-minus-${t.id}`} onClick={() => setQty({ ...qty, [t.id]: Math.max(0, (qty[t.id] || 0) - 1) })} className="w-9 h-9 rounded-full border border-slate-200 flex items-center justify-center hover:bg-slate-50 transition-colors"><Minus className="w-4 h-4" /></button>
                    <span data-testid={`qty-value-${t.id}`} className="w-6 text-center font-bold">{qty[t.id] || 0}</span>
                    <button type="button" data-testid={`qty-plus-${t.id}`} onClick={() => setQty({ ...qty, [t.id]: (qty[t.id] || 0) + 1 })} className="w-9 h-9 rounded-full bg-[#0047AB] text-white flex items-center justify-center hover:bg-[#003a8c] transition-colors"><Plus className="w-4 h-4" /></button>
                  </div>
                </div>
              ))}
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 flex items-center justify-between">
              <span className="text-sm text-slate-600">Estimasi sewa bulanan ({totalUnits} unit)</span>
              <span data-testid="sewa-bulanan" className="font-heading text-xl font-extrabold text-[#0047AB]">{rupiah(sewaBulanan)}/bln</span>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5" data-testid="step-3">
            <h2 className="font-heading font-bold text-lg text-slate-800">Section 4 — Durasi & Jadwal</h2>
            <div className="grid sm:grid-cols-2 gap-5">
              <div>
                <Label>Tanggal Mulai Pasang *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" data-testid="input-tanggal-mulai" className="w-full justify-start mt-1.5 font-normal">
                      <CalendarIcon className="mr-2 h-4 w-4 text-[#0047AB]" />
                      {tanggalMulai ? format(tanggalMulai, "dd MMMM yyyy", { locale: idLocale }) : "Pilih tanggal"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={tanggalMulai} onSelect={setTanggalMulai} disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))} />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <Label>Durasi Sewa *</Label>
                <Select value={String(form.durasi_sewa)} onValueChange={(v) => setForm({ ...form, durasi_sewa: Number(v) })}>
                  <SelectTrigger data-testid="select-durasi" className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="3">3 bulan</SelectItem>
                    <SelectItem value="6">6 bulan</SelectItem>
                    <SelectItem value="12">1 tahun</SelectItem>
                    <SelectItem value="24">2 tahun</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div><Label htmlFor="catatan">Catatan / Permintaan Khusus (opsional)</Label><Textarea id="catatan" data-testid="input-catatan" value={form.catatan} onChange={set("catatan")} rows={2} className="mt-1.5" placeholder="Contoh: pemasangan di lantai 2, outdoor di balkon" /></div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-5" data-testid="step-4">
            <h2 className="font-heading font-bold text-lg text-slate-800">Section 5 — Identitas & Dokumen</h2>
            <div><Label htmlFor="alamat_ktp">Alamat Sesuai KTP *</Label><Textarea id="alamat_ktp" data-testid="input-alamat-ktp" value={form.alamat_ktp} onChange={set("alamat_ktp")} rows={2} className="mt-1.5" /></div>
            <div>
              <Label className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Foto KTP Penyewa * (JPG/PNG, maks 5MB)</Label>
              <label data-testid="ktp-upload-area" className="mt-3 flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-2xl p-10 cursor-pointer hover:border-[#0047AB] hover:bg-slate-50 transition-colors">
                <UploadCloud className="w-10 h-10 text-slate-400" />
                <span className="mt-3 text-sm text-slate-600 font-medium">{ktp ? ktp.name : "Klik untuk pilih file KTP"}</span>
                <input data-testid="input-ktp" type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => setKtp(e.target.files[0] || null)} />
              </label>
              <p className="text-xs text-slate-400 mt-2">Dokumen tersimpan aman dan hanya dapat diakses admin berwenang.</p>
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-5" data-testid="step-5">
            <h2 className="font-heading font-bold text-lg text-slate-800">Section 6 — Data Penjamin / Pihak Lokasi</h2>
            <p className="text-sm text-slate-500">Data Ketua RT / Pemilik Kos / Pemilik Kontrakan tempat AC dipasang.</p>
            <div><Label htmlFor="nama_pj">Nama Ketua RT / Pemilik Kos / Kontrakan *</Label><Input id="nama_pj" data-testid="input-nama-pj" value={form.nama_pj_lokasi} onChange={set("nama_pj_lokasi")} className="mt-1.5" /></div>
            <div><Label htmlFor="no_hp_pj">Nomor HP / WA Penanggung Jawab Lokasi *</Label><Input id="no_hp_pj" data-testid="input-no-hp-pj" value={form.no_hp_pj_lokasi} onChange={set("no_hp_pj_lokasi")} placeholder="08xxxxxxxxxx" className="mt-1.5" /></div>
          </div>
        )}

        {step === 6 && (
          <div className="space-y-5" data-testid="step-6">
            <h2 className="font-heading font-bold text-lg text-slate-800">Section 7 — Persetujuan</h2>
            <label className="flex items-start gap-3 border border-slate-200 rounded-2xl p-5 cursor-pointer hover:border-[#0047AB]/40 transition-colors" data-testid="consent-area">
              <Checkbox data-testid="input-consent" checked={consent} onCheckedChange={(v) => setConsent(!!v)} className="mt-0.5" />
              <span className="text-sm text-slate-700 leading-relaxed">Saya menyatakan data yang diisi benar dan bersedia data digunakan hanya untuk keperluan layanan sewa AC CollerMind.</span>
            </label>
          </div>
        )}

        {step === 7 && (
          <div className="space-y-5" data-testid="step-7">
            <h2 className="font-heading font-bold text-lg text-slate-800">Section 8 — Ringkasan Pengajuan</h2>
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 space-y-2 text-sm" data-testid="review-summary">
              <p><span className="text-slate-500">Nama:</span> {form.nama}</p>
              <p><span className="text-slate-500">Kontak:</span> {form.no_hp} · {form.email}</p>
              <p><span className="text-slate-500">Lokasi:</span> {form.alamat_pemasangan} ({form.status_hunian} · {form.jenis_ruangan})</p>
              <p><span className="text-slate-500">Unit:</span> {tariffs.filter((t) => qty[t.id] > 0).map((t) => `${t.nama} ×${qty[t.id]}`).join(", ") || "-"}</p>
              <p><span className="text-slate-500">Durasi:</span> {form.durasi_sewa} bulan · mulai {tanggalMulai ? format(tanggalMulai, "dd MMM yyyy", { locale: idLocale }) : "-"}</p>
              <div className="pt-3 mt-3 border-t border-slate-200 space-y-1.5">
                <p className="font-heading font-bold text-slate-900">Estimasi Biaya Awal</p>
                <div className="flex justify-between"><span className="text-slate-500">Sewa bulan pertama</span><span>{rupiah(sewaBulanan)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Jasa Pasang</span><span>{rupiah(JASA_PASANG)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Jasa Lepas</span><span>{rupiah(JASA_LEPAS)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Extra pipa</span><span className="italic text-slate-400">Belum ditentukan</span></div>
                <div className="flex justify-between font-bold pt-2 border-t border-slate-200"><span>Total estimasi</span><span data-testid="total-estimasi" className="text-[#0047AB]">{rupiah(estimasiTotal)}</span></div>
                <p className="text-xs text-slate-400 italic pt-1">Biaya extra pipa akan dihitung berdasarkan hasil pengukuran teknisi setelah instalasi. Pembayaran dilakukan setelah instalasi selesai dan invoice diterbitkan.</p>
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-between mt-10">
          <Button variant="outline" data-testid="btn-prev" disabled={step === 0} onClick={() => setStep(step - 1)} className="rounded-full px-8">Kembali</Button>
          {step < 7 ? (
            <Button data-testid="btn-next" onClick={next} className="rounded-full px-8 bg-[#0047AB] hover:bg-[#003a8c]">Lanjut</Button>
          ) : (
            <Button data-testid="btn-submit-rental" onClick={submit} disabled={submitting} className="rounded-full px-8 bg-[#0047AB] hover:bg-[#003a8c]">
              {submitting ? "Mengirim..." : "Kirim Pengajuan"}
            </Button>
          )}
        </div>
      </div>
    </PublicLayout>
  );
}
