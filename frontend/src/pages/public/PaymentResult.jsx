import { useEffect, useRef, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import PublicLayout from "@/layouts/PublicLayout";
import api from "@/lib/api";

export default function PaymentResult({ type }) {
  const [params] = useSearchParams();
  const [state, setState] = useState(type === "cancel" ? "cancel" : "checking");
  const [kode, setKode] = useState("");
  const attempts = useRef(0);

  useEffect(() => {
    if (type === "cancel") return;
    const sid = params.get("session_id");
    if (!sid) return setState("failed");
    const poll = async () => {
      try {
        const { data } = await api.get(`/public/payments/status/${sid}`);
        setKode(data.kode || "");
        if (data.payment_status === "paid") return setState("paid");
        if (data.payment_status === "failed" || data.payment_status === "expired") return setState("failed");
        if (++attempts.current < 15) setTimeout(poll, 2000);
        else setState("failed");
      } catch {
        if (++attempts.current < 15) setTimeout(poll, 2000);
        else setState("failed");
      }
    };
    poll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <PublicLayout>
      <div className="max-w-xl mx-auto px-4 py-24 text-center" data-testid="payment-result">
        {state === "checking" && (<><Loader2 className="w-14 h-14 text-[#0047AB] animate-spin mx-auto" /><h1 className="font-heading text-2xl font-bold mt-6">Memverifikasi pembayaran...</h1></>)}
        {state === "paid" && (
          <>
            <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto" />
            <h1 className="font-heading text-3xl font-black tracking-tight mt-6" data-testid="payment-success-title">Pembayaran Berhasil!</h1>
            <p className="text-slate-600 mt-3">Tagihan untuk pengajuan <span className="font-bold">{kode}</span> telah lunas.</p>
            <Link to={`/tracking?kode=${kode}`} data-testid="payment-track-link" className="mt-8 inline-block rounded-full bg-[#0047AB] text-white px-8 py-3 font-semibold hover:bg-[#003a8c] transition-colors">Lihat Status Pengajuan</Link>
          </>
        )}
        {state === "cancel" && (
          <>
            <XCircle className="w-16 h-16 text-amber-500 mx-auto" />
            <h1 className="font-heading text-3xl font-black tracking-tight mt-6" data-testid="payment-cancel-title">Pembayaran Dibatalkan</h1>
            <p className="text-slate-600 mt-3">Anda dapat melanjutkan pembayaran kapan saja melalui halaman lacak pengajuan.</p>
            <Link to="/tracking" data-testid="payment-retry-link" className="mt-8 inline-block rounded-full bg-[#0047AB] text-white px-8 py-3 font-semibold hover:bg-[#003a8c] transition-colors">Kembali ke Lacak</Link>
          </>
        )}
        {state === "failed" && (
          <>
            <XCircle className="w-16 h-16 text-red-500 mx-auto" />
            <h1 className="font-heading text-3xl font-black tracking-tight mt-6" data-testid="payment-failed-title">Pembayaran Gagal</h1>
            <p className="text-slate-600 mt-3">Silakan coba lagi melalui halaman lacak pengajuan.</p>
            <Link to="/tracking" data-testid="payment-retry-link-2" className="mt-8 inline-block rounded-full bg-[#0047AB] text-white px-8 py-3 font-semibold hover:bg-[#003a8c] transition-colors">Coba Lagi</Link>
          </>
        )}
      </div>
    </PublicLayout>
  );
}
