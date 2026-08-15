import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Snowflake, Truck, Wrench, ShieldCheck, CalendarCheck, ArrowRight, FileSignature, Receipt, Check } from "lucide-react";
import PublicLayout from "@/layouts/PublicLayout";
import api, { rupiah } from "@/lib/api";

const HERO_IMG = "https://images.unsplash.com/photo-1718203862467-c33159fdc504?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAzMjh8MHwxfHNlYXJjaHwxfHxhaXIlMjBjb25kaXRpb25lciUyMGNvb2xpbmclMjBob21lfGVufDB8fHx8MTc4NjE4OTQ3NHww&ixlib=rb-4.1.0&q=85";
const TECH_IMG = "https://images.unsplash.com/photo-1660330589827-da8ab7dd3c02?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1NjZ8MHwxfHNlYXJjaHwyfHxodmFjJTIwdGVjaG5pY2lhbiUyMGluc3RhbGxhdGlvbnxlbnwwfHx8fDE3ODYxODk0NzR8MA&ixlib=rb-4.1.0&q=85";

const FACILITIES = [
  "Pipa 3 meter", "Kabel 3 meter", "Ducttape & lem", "Stop kontak",
  "Vakum AC", "Cuci AC gratis tiap 4 bulan", "Perbaikan & sparepart", "Free ongkir Jabodetabek",
];

const fade = { hidden: { opacity: 0, y: 24 }, show: (i = 0) => ({ opacity: 1, y: 0, transition: { delay: i * 0.12, duration: 0.5 } }) };

export default function Landing() {
  const [tariffs, setTariffs] = useState([]);
  useEffect(() => {
    api.get("/public/tariffs").then((r) => setTariffs(r.data)).catch(() => {});
  }, []);

  return (
    <PublicLayout>
      <section className="max-w-7xl mx-auto px-4 sm:px-8 pt-14 pb-8">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
          <motion.div variants={fade} initial="hidden" animate="show" custom={0} className="md:col-span-7 flex flex-col justify-center py-8">
            <p data-testid="hero-eyebrow" className="text-xs font-bold uppercase tracking-[0.2em] text-[#0047AB] mb-4">Penyewaan AC Jabodetabek</p>
            <h1 className="font-heading text-4xl sm:text-5xl lg:text-6xl font-black tracking-tighter text-slate-900 leading-[1.05]">
              Sejuk Tanpa Ribet, <span className="text-[#0047AB]">Sewa AC</span> Untuk Rumah & Kantor Anda
            </h1>
            <p className="mt-6 text-base sm:text-lg text-slate-600 leading-relaxed max-w-xl">
              Mulai dari Rp198.000/bulan. Kami antar, pasang, rawat berkala, dan bongkar kembali saat masa sewa berakhir. Ajukan dalam 5 menit, tanpa perlu membuat akun.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Link to="/sewa" data-testid="hero-cta-sewa" className="rounded-full bg-[#0047AB] text-white px-8 py-3.5 font-semibold inline-flex items-center gap-2 hover:bg-[#003a8c] hover:-translate-y-0.5 transition-[transform,background-color] duration-200 shadow-[0_8px_32px_rgba(0,71,171,0.25)]">
                Ajukan Penyewaan <ArrowRight className="w-4 h-4" />
              </Link>
              <Link to="/tracking" data-testid="hero-cta-track" className="rounded-full border-2 border-slate-200 px-8 py-3.5 font-semibold text-slate-700 hover:border-[#0047AB] hover:text-[#0047AB] hover:-translate-y-0.5 transition-[transform,border-color,color] duration-200">
                Lacak Pengajuan
              </Link>
            </div>
          </motion.div>
          <motion.div variants={fade} initial="hidden" animate="show" custom={1} className="md:col-span-5 relative">
            <div className="rounded-3xl overflow-hidden shadow-[0_8px_32px_rgba(0,71,171,0.15)] h-full min-h-[320px]">
              <img src={HERO_IMG} alt="Unit AC" className="w-full h-full object-cover" />
            </div>
            <div className="absolute -bottom-5 -left-5 bg-white rounded-2xl shadow-lg border border-slate-100 px-5 py-4 flex items-center gap-3">
              <ShieldCheck className="w-8 h-8 text-emerald-500" />
              <div>
                <p className="font-heading font-bold text-slate-900 text-sm">Unit Terawat</p>
                <p className="text-xs text-slate-500">Cuci AC gratis tiap 4 bulan</p>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
          <motion.div variants={fade} initial="hidden" whileInView="show" viewport={{ once: true }} className="md:col-span-4 bg-[#0047AB] rounded-3xl p-8 text-white flex flex-col justify-between min-h-[280px]">
            <Truck className="w-10 h-10 text-cyan-300" />
            <div>
              <h3 className="font-heading text-2xl font-bold mt-6">Pengiriman & Instalasi</h3>
              <p className="text-blue-100 text-sm mt-2 leading-relaxed">Unit diantar dan dipasang oleh teknisi berpengalaman sesuai jadwal kesepakatan. Free ongkir Jabodetabek.</p>
            </div>
          </motion.div>
          <motion.div variants={fade} initial="hidden" whileInView="show" viewport={{ once: true }} custom={1} className="md:col-span-4 rounded-3xl overflow-hidden min-h-[280px]">
            <img src={TECH_IMG} alt="Teknisi HVAC" className="w-full h-full object-cover" />
          </motion.div>
          <motion.div variants={fade} initial="hidden" whileInView="show" viewport={{ once: true }} custom={2} className="md:col-span-4 bg-slate-50 border border-slate-200 rounded-3xl p-8 flex flex-col justify-between min-h-[280px]">
            <Wrench className="w-10 h-10 text-[#0047AB]" />
            <div>
              <h3 className="font-heading text-2xl font-bold text-slate-900 mt-6">Maintenance Berkala</h3>
              <p className="text-slate-600 text-sm mt-2 leading-relaxed">Cuci AC gratis tiap 4 bulan, perbaikan & sparepart included selama masa sewa.</p>
            </div>
          </motion.div>
        </div>
      </section>

      <section className="bg-slate-50 border-y border-slate-200 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-8">
          <div className="flex items-end justify-between mb-10 flex-wrap gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#0047AB] mb-2">Tarif Sewa</p>
              <h2 className="font-heading text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-slate-800">Harga Transparan per Bulan</h2>
            </div>
            <Link to="/sewa" data-testid="tariff-cta" className="text-[#0047AB] font-semibold inline-flex items-center gap-1 hover:gap-2 transition-[gap] duration-200">
              Mulai sewa <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6" data-testid="tariff-list">
            {tariffs.map((t, i) => (
              <motion.div key={t.id} variants={fade} initial="hidden" whileInView="show" viewport={{ once: true }} custom={i}
                className="bg-white border border-slate-200 rounded-2xl p-6 hover:shadow-[0_8px_32px_rgba(0,71,171,0.12)] hover:-translate-y-1 transition-[transform,box-shadow] duration-200">
                <Snowflake className="w-6 h-6 text-cyan-500 mb-4" />
                <h3 className="font-heading font-bold text-slate-900">{t.nama}</h3>
                <p className="text-xs text-slate-500 mt-1">{t.tipe} · {t.variant || "Standart"}</p>
                <p className="mt-4 font-heading text-2xl font-extrabold text-[#0047AB]">{rupiah(t.harga_per_bulan)}<span className="text-sm font-medium text-slate-400">/bln</span></p>
              </motion.div>
            ))}
            {tariffs.length === 0 && <p className="text-slate-400 text-sm">Memuat tarif...</p>}
          </div>
          <div className="mt-8 bg-white border border-slate-200 rounded-2xl p-6" data-testid="facilities">
            <p className="font-heading font-bold text-slate-900 mb-4">Semua paket sudah termasuk:</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {FACILITIES.map((f) => (
                <div key={f} className="flex items-center gap-2 text-sm text-slate-600">
                  <Check className="w-4 h-4 text-emerald-500 shrink-0" /> {f}
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-400 mt-4 italic">Kelebihan pipa di atas 3 meter: Rp130.000/meter, dihitung dari pengukuran teknisi saat instalasi.</p>
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
          <div className="md:col-span-8">
            <h2 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight text-slate-800">Alur Penyewaan</h2>
            <ol className="mt-8 space-y-5">
              {[
                "Isi form pengajuan (tanpa akun, cukup 5 menit)",
                "Admin memverifikasi data Anda",
                "Tandatangani kontrak digital via halaman tracking",
                "Usulkan jadwal pemasangan — admin konfirmasi sesuai teknisi",
                "Unit dikirim & dipasang, teknisi mengukur pipa aktual",
                "Invoice terbit setelah instalasi — bayar via transfer & upload bukti",
                "Masa sewa aktif dengan cuci AC gratis tiap 4 bulan",
                "Unit dibongkar & dikembalikan saat sewa berakhir",
              ].map((s, i) => (
                <li key={i} className="flex items-start gap-4" data-testid={`flow-step-${i}`}>
                  <span className="w-8 h-8 rounded-full bg-[#0047AB] text-white flex items-center justify-center font-heading font-bold text-sm shrink-0">{i + 1}</span>
                  <span className="text-slate-600 pt-1">{s}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="md:col-span-4 space-y-6">
            <div className="bg-slate-900 rounded-3xl p-8 text-white">
              <CalendarCheck className="w-10 h-10 text-cyan-400" />
              <h3 className="font-heading text-xl font-bold mt-4">Sudah punya Order ID?</h3>
              <p className="text-slate-300 text-sm mt-2 leading-relaxed">Lacak status, tandatangani kontrak, dan akses invoice Anda tanpa perlu login.</p>
              <Link to="/tracking" data-testid="flow-track-cta" className="mt-6 inline-flex items-center gap-2 rounded-full bg-cyan-500 text-white px-6 py-2.5 text-sm font-semibold hover:bg-cyan-400 hover:-translate-y-0.5 transition-[transform,background-color] duration-200">
                Lacak Sekarang <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-3xl p-8">
              <Receipt className="w-10 h-10 text-[#0047AB]" />
              <h3 className="font-heading text-xl font-bold text-slate-900 mt-4">Bayar Setelah Terpasang</h3>
              <p className="text-slate-600 text-sm mt-2 leading-relaxed">Tidak ada pembayaran di muka saat pengajuan. Invoice baru terbit setelah instalasi selesai.</p>
              <FileSignature className="w-5 h-5 text-cyan-500 mt-4" />
            </div>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
