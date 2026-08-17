import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { ArrowLeft, CheckCircle2, XCircle, CalendarPlus, FlagTriangleRight, FileText, Receipt, Landmark } from "lucide-react";
import { toast } from "sonner";
import api, { fmtErr, rupiah, fileUrl } from "@/lib/api";
import { StatusBadge, JENIS_KEGIATAN, INVOICE_STATUS, PAYMENT_STATUS } from "@/components/StatusBadge";
import { usePolling } from "@/lib/usePolling";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function OrderDetail() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [readyUnits, setReadyUnits] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [couriers, setCouriers] = useState([]);

  const [verifyNote, setVerifyNote] = useState("");
  const [alloc, setAlloc] = useState({});
  const [sched, setSched] = useState({ technician_id: "", tanggal: "", jam: "", jenis_kegiatan: "delivery", catatan: "" });
  const [payNote, setPayNote] = useState({});
  const [busy, setBusy] = useState(false);

  const load = () => {
    api.get(`/admin/orders/${id}`).then((r) => setData(r.data)).catch((e) => toast.error(fmtErr(e)));
    api.get("/admin/units", { params: { status: "ready" } }).then((r) => setReadyUnits(r.data)).catch(() => {});
    api.get("/admin/technicians").then((r) => setTechnicians(r.data)).catch(() => {});
    api.get("/admin/couriers").then((r) => setCouriers(r.data)).catch(() => {});
  };
  useEffect(load, [id]);
  usePolling(load, 15000);

  const allocValid = useMemo(() => {
    if (!data) return false;
    return data.order.details.every((d, i) => (alloc[i] || []).length === d.quantity);
  }, [alloc, data]);

  if (!data) return <p className="text-slate-400">Memuat...</p>;
  const { order, customer, verification, schedules, deliveries, installations, maintenances, returns, units, contract, invoice, payments, schedule_requests } = data;

  const contractSigned = order.contract_status === "signed";
  const fullyAllocated = order.details.every((d) => (d.unit_ids || []).length === d.quantity);
  const canAllocate = order.status === "verified" && contractSigned && !fullyAllocated;
  const canSchedule = ["scheduled", "delivered", "active", "maintenance"].includes(order.status) || (order.status === "verified" && contractSigned && fullyAllocated);

  function toggleUnit(detailIndex, uid, max) {
    const cur = alloc[detailIndex] || [];
    if (cur.includes(uid)) setAlloc({ ...alloc, [detailIndex]: cur.filter((x) => x !== uid) });
    else if (cur.length < max) setAlloc({ ...alloc, [detailIndex]: [...cur, uid] });
  }

  async function verify(hasil) {
    setBusy(true);
    try {
      await api.post(`/admin/orders/${id}/verify`, { hasil, catatan: verifyNote });
      toast.success(hasil === "approved" ? "Pengajuan disetujui — kontrak digital diterbitkan" : "Pengajuan ditolak");
      setVerifyNote("");
      load();
    } catch (e) { toast.error(fmtErr(e)); } finally { setBusy(false); }
  }

  async function allocate() {
    setBusy(true);
    try {
      const allocations = Object.entries(alloc).map(([i, unit_ids]) => ({ detail_index: Number(i), unit_ids }));
      await api.post(`/admin/orders/${id}/allocate`, { allocations });
      toast.success("Unit dialokasikan");
      setAlloc({});
      load();
    } catch (e) { toast.error(fmtErr(e)); } finally { setBusy(false); }
  }

  async function createSchedule() {
    if (!sched.technician_id || !sched.tanggal || !sched.jam) return toast.error("Lengkapi jadwal (teknisi, tanggal, jam)");
    setBusy(true);
    try {
      await api.post(`/admin/orders/${id}/schedules`, sched);
      toast.success("Jadwal dibuat");
      setSched({ technician_id: "", tanggal: "", jam: "", jenis_kegiatan: "delivery", catatan: "" });
      load();
    } catch (e) { toast.error(fmtErr(e)); } finally { setBusy(false); }
  }

  async function reviewPayment(pid, action) {
    setBusy(true);
    try {
      await api.post(`/admin/payments/${pid}/${action}`, { catatan: payNote[pid] || "" });
      toast.success(action === "verify" ? "Pembayaran terverifikasi" : "Pembayaran ditolak");
      load();
    } catch (e) { toast.error(fmtErr(e)); } finally { setBusy(false); }
  }

  async function complete() {
    try { await api.post(`/admin/orders/${id}/complete`); toast.success("Order diselesaikan"); load(); } catch (e) { toast.error(fmtErr(e)); }
  }

  const fmtD = (d) => (d ? format(new Date(d), "dd MMM yyyy HH:mm", { locale: idLocale }) : "-");

  return (
    <div data-testid="admin-order-detail">
      <Link to="/admin/orders" data-testid="back-to-orders" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-[#0047AB] transition-colors"><ArrowLeft className="w-4 h-4" /> Kembali</Link>

      <div className="flex items-center justify-between flex-wrap gap-3 mt-4">
        <div>
          <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight text-slate-800">{order.kode}</h1>
          <p className="text-sm text-slate-500 mt-1">Diajukan {fmtD(order.tanggal_pengajuan)}</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {contract && (
            <span data-testid="contract-status" className={`text-xs font-semibold px-3 py-1.5 rounded-full ${contractSigned ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
              Kontrak: {contractSigned ? "Ditandatangani" : "Menunggu TTD"}
            </span>
          )}
          {order.payment_status === "paid"
            ? <span data-testid="paid-badge" className="text-emerald-600 font-bold text-sm">LUNAS ({order.payment_method || "-"})</span>
            : <span className="text-amber-600 font-semibold text-sm">BELUM LUNAS</span>}
          <StatusBadge status={order.status} testid="order-status" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-8">
        <div className="lg:col-span-2 space-y-6">
          <section className="bg-white border border-slate-200 rounded-xl p-6">
            <h2 className="font-heading font-bold text-slate-800 mb-4">Data Customer</h2>
            <div className="grid sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
              <p><span className="text-slate-400 block text-xs">Nama</span>{customer.nama}</p>
              <p><span className="text-slate-400 block text-xs">Kontak</span>{customer.email} · {customer.no_hp}</p>
              <p><span className="text-slate-400 block text-xs">Status Hunian</span>{customer.status_hunian} {order.jenis_ruangan ? `· ${order.jenis_ruangan}` : ""}</p>
              <p><span className="text-slate-400 block text-xs">Penjamin Lokasi</span>{customer.nama_pj_lokasi || "-"} {customer.no_hp_pj_lokasi ? `(${customer.no_hp_pj_lokasi})` : ""}</p>
              <p className="sm:col-span-2"><span className="text-slate-400 block text-xs">Alamat KTP</span>{customer.alamat_ktp}</p>
              <p className="sm:col-span-2"><span className="text-slate-400 block text-xs">Alamat Pemasangan</span><span data-testid="alamat-pemasangan">{customer.alamat_pemasangan}</span></p>
              {customer.data_consent_at && <p className="sm:col-span-2 text-xs text-emerald-600">Persetujuan data diberikan pada {fmtD(customer.data_consent_at)}</p>}
            </div>
            {order.ktp_path && (
              <div className="mt-4">
                <p className="text-slate-400 text-xs mb-2">Foto KTP</p>
                <img src={fileUrl(order.ktp_path)} alt="KTP" data-testid="ktp-image" className="max-h-48 rounded-lg border border-slate-200" />
              </div>
            )}
          </section>

          {order.lokasi_detail && (
            <section className="bg-white border border-slate-200 rounded-xl p-6" data-testid="lokasi-detail-admin">
              <h2 className="font-heading font-bold text-slate-800 mb-3">Detail Lokasi (dari Customer)</h2>
              {order.lokasi_detail.foto_indoor_path ? (
                <div className="grid sm:grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-slate-400 text-xs mb-1">Foto Rencana Indoor + Sumber Listrik</p>
                    <img src={fileUrl(order.lokasi_detail.foto_indoor_path)} alt="indoor" data-testid="lokasi-foto-indoor" className="max-h-40 rounded-lg border border-slate-200" />
                    <p className="text-xs mt-1">{order.lokasi_detail.ket_indoor}</p>
                  </div>
                  <div>
                    <p className="text-slate-400 text-xs mb-1">Foto Rencana Outdoor</p>
                    <img src={fileUrl(order.lokasi_detail.foto_outdoor_path)} alt="outdoor" data-testid="lokasi-foto-outdoor" className="max-h-40 rounded-lg border border-slate-200" />
                    <p className="text-xs mt-1">{order.lokasi_detail.ket_outdoor}</p>
                  </div>
                  {order.lokasi_detail.perkiraan_pipa_meter > 0 && <p className="sm:col-span-2 text-xs text-slate-500">Perkiraan pipa dari customer: {order.lokasi_detail.perkiraan_pipa_meter} m</p>}
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
                  {order.lokasi_detail.lantai && <p><span className="text-slate-400 block text-xs">Lantai</span>{order.lokasi_detail.lantai}</p>}
                  {order.lokasi_detail.akses_lokasi && <p><span className="text-slate-400 block text-xs">Akses Lokasi</span>{order.lokasi_detail.akses_lokasi}</p>}
                  {order.lokasi_detail.titik_indoor && <p><span className="text-slate-400 block text-xs">Titik Indoor</span>{order.lokasi_detail.titik_indoor}</p>}
                  {order.lokasi_detail.titik_outdoor && <p><span className="text-slate-400 block text-xs">Titik Outdoor</span>{order.lokasi_detail.titik_outdoor}</p>}
                  {order.lokasi_detail.sumber_listrik && <p><span className="text-slate-400 block text-xs">Sumber Listrik</span>{order.lokasi_detail.sumber_listrik}</p>}
                </div>
              )}
            </section>
          )}

          <section className="bg-white border border-slate-200 rounded-xl p-6">
            <h2 className="font-heading font-bold text-slate-800 mb-4">Detail Sewa & Alokasi Unit</h2>
            <div className="space-y-3 text-sm">
              {order.details.map((d, i) => (
                <div key={i} className="border border-slate-100 rounded-lg p-4" data-testid={`detail-${i}`}>
                  <div className="flex justify-between flex-wrap gap-2">
                    <p className="font-semibold">{d.nama} ×{d.quantity}</p>
                    <p className="font-medium text-[#0047AB]">{rupiah(d.harga || d.harga_sewa_bulanan)}/bln</p>
                  </div>
                  {d.unit_ids?.length > 0 && (
                    <div className="flex gap-2 mt-2 flex-wrap">
                      {d.unit_ids.map((uid) => {
                        const u = units.find((x) => x.id === uid);
                        return <span key={uid} className="text-xs bg-slate-100 rounded-full px-2.5 py-1 font-medium">{u ? `${u.kode_unit} (${u.merk})` : uid}</span>;
                      })}
                    </div>
                  )}
                  {canAllocate && (
                    <div className="mt-3">
                      <p className="text-xs text-slate-500 mb-2">Pilih {d.quantity} unit ({d.kapasitas} {d.variant || "Standart"}) — terpilih: {(alloc[i] || []).length}</p>
                      <div className="flex gap-2 flex-wrap">
                        {readyUnits.filter((u) => u.kapasitas === d.kapasitas && (u.variant || "Standart") === (d.variant || "Standart")).map((u) => (
                          <button key={u.id} type="button" data-testid={`alloc-${i}-${u.kode_unit}`} onClick={() => toggleUnit(i, u.id, d.quantity)}
                            className={`text-xs rounded-full px-3 py-1.5 border font-medium transition-colors ${(alloc[i] || []).includes(u.id) ? "bg-[#0047AB] text-white border-[#0047AB]" : "bg-white border-slate-200 hover:border-[#0047AB]"}`}>
                            {u.kode_unit} · {u.merk}
                          </button>
                        ))}
                        {readyUnits.filter((u) => u.kapasitas === d.kapasitas && (u.variant || "Standart") === (d.variant || "Standart")).length === 0 && <span className="text-xs text-red-500">Tidak ada unit ready yang cocok</span>}
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {canAllocate && (
                <Button data-testid="btn-allocate" disabled={!allocValid || busy} onClick={allocate} className="rounded-full bg-[#0047AB] hover:bg-[#003a8c]">Alokasikan Unit</Button>
              )}
              {order.estimasi && (
                <div className="pt-3 border-t border-slate-100 space-y-1 text-sm" data-testid="estimasi-admin">
                  <div className="flex justify-between"><span className="text-slate-500">Sewa bulanan ({order.details.reduce((a, d) => a + d.quantity, 0)} unit)</span><span>{rupiah(order.estimasi.sewa_bulanan)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Jasa Pasang + Jasa Lepas</span><span>{rupiah(order.estimasi.jasa_pasang + order.estimasi.jasa_lepas)}</span></div>
                  <div className="flex justify-between font-bold pt-1 border-t border-slate-100"><span>Estimasi tagihan awal</span><span>{rupiah(order.estimasi.total)}</span></div>
                </div>
              )}
              {!order.estimasi && <div className="flex justify-between font-bold pt-2"><span>Total</span><span data-testid="order-total">{rupiah(order.total_biaya)}</span></div>}
              {order.denda > 0 && <div className="flex justify-between text-red-600 text-sm"><span>Denda</span><span>{rupiah(order.denda)}</span></div>}
              {order.catatan && <p className="text-sm text-slate-500 bg-slate-50 rounded-lg p-3">Catatan customer: {order.catatan}</p>}
            </div>
          </section>

          {order.status === "pending" && (
            <section className="bg-white border-2 border-amber-200 rounded-xl p-6" data-testid="verify-section">
              <h2 className="font-heading font-bold text-slate-800 mb-2">Verifikasi Pengajuan</h2>
              <p className="text-xs text-slate-500 mb-4">Menyetujui akan menerbitkan kontrak digital untuk ditandatangani customer. Alokasi unit dilakukan setelah kontrak ditandatangani.</p>
              <Textarea data-testid="verify-note" value={verifyNote} onChange={(e) => setVerifyNote(e.target.value)} placeholder="Catatan verifikasi (opsional)" rows={2} />
              <div className="flex gap-3 mt-4 flex-wrap">
                <Button data-testid="btn-approve" disabled={busy} onClick={() => verify("approved")} className="rounded-full bg-emerald-600 hover:bg-emerald-700"><CheckCircle2 className="w-4 h-4 mr-2" /> Setujui</Button>
                <Button data-testid="btn-reject" disabled={busy} onClick={() => verify("rejected")} variant="outline" className="rounded-full text-red-600 border-red-200 hover:bg-red-50"><XCircle className="w-4 h-4 mr-2" /> Tolak</Button>
              </div>
            </section>
          )}

          {order.status === "verified" && !contractSigned && (
            <section className="bg-amber-50 border border-amber-200 rounded-xl p-6" data-testid="waiting-contract">
              <p className="text-sm text-amber-800 font-medium">Menunggu customer menandatangani kontrak digital melalui halaman tracking.</p>
            </section>
          )}

          {schedule_requests.filter((r) => r.status === "pending").length > 0 && (
            <section className="bg-cyan-50 border border-cyan-200 rounded-xl p-6" data-testid="schedule-requests">
              <h2 className="font-heading font-bold text-slate-800 mb-3">Usulan Jadwal dari Customer</h2>
              {schedule_requests.filter((r) => r.status === "pending").map((r) => (
                <div key={r.id} className="flex items-center justify-between flex-wrap gap-2 text-sm bg-white rounded-lg p-3 border border-cyan-100">
                  <span><span className="text-xs font-semibold text-cyan-700 uppercase">{r.jenis === "installation" ? "Instalasi" : "Pengiriman"}</span> — <b>{r.tanggal} {r.jam}</b>{r.catatan ? ` — ${r.catatan}` : ""}</span>
                  <Button size="sm" data-testid={`use-request-${r.id}`} onClick={() => setSched({ ...sched, tanggal: r.tanggal, jam: r.jam, jenis_kegiatan: r.jenis === "installation" ? "installation" : "delivery" })} className="rounded-full bg-[#0047AB] hover:bg-[#003a8c]">Gunakan</Button>
                </div>
              ))}
            </section>
          )}

          {canSchedule && (
            <section className="bg-white border border-slate-200 rounded-xl p-6" data-testid="schedule-section">
              <h2 className="font-heading font-bold text-slate-800 mb-4 flex items-center gap-2"><CalendarPlus className="w-5 h-5 text-[#0047AB]" /> Buat Jadwal</h2>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label>Jenis Kegiatan</Label>
                  <Select value={sched.jenis_kegiatan} onValueChange={(v) => setSched({ ...sched, jenis_kegiatan: v })}>
                    <SelectTrigger data-testid="sched-jenis" className="mt-1.5"><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(JENIS_KEGIATAN).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{sched.jenis_kegiatan === "delivery" ? "Kurir" : "Teknisi"}</Label>
                  <Select value={sched.technician_id} onValueChange={(v) => setSched({ ...sched, technician_id: v })}>
                    <SelectTrigger data-testid="sched-technician" className="mt-1.5"><SelectValue placeholder={sched.jenis_kegiatan === "delivery" ? "Pilih kurir" : "Pilih teknisi"} /></SelectTrigger>
                    <SelectContent>{(sched.jenis_kegiatan === "delivery" ? couriers : technicians).map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Tanggal</Label><Input type="date" data-testid="sched-tanggal" value={sched.tanggal} onChange={(e) => setSched({ ...sched, tanggal: e.target.value })} className="mt-1.5" /></div>
                <div><Label>Jam</Label><Input type="time" data-testid="sched-jam" value={sched.jam} onChange={(e) => setSched({ ...sched, jam: e.target.value })} className="mt-1.5" /></div>
              </div>
              <Textarea data-testid="sched-catatan" value={sched.catatan} onChange={(e) => setSched({ ...sched, catatan: e.target.value })} placeholder="Catatan untuk teknisi" rows={2} className="mt-4" />
              <Button data-testid="btn-create-schedule" onClick={createSchedule} disabled={busy} className="mt-4 rounded-full bg-[#0047AB] hover:bg-[#003a8c]">Buat Jadwal</Button>
            </section>
          )}

          {invoice && (
            <section className="bg-white border border-slate-200 rounded-xl p-6" data-testid="invoice-admin">
              <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
                <h2 className="font-heading font-bold text-slate-800 flex items-center gap-2"><Receipt className="w-5 h-5 text-[#0047AB]" /> Invoice {invoice.nomor}</h2>
                <StatusBadge status={invoice.status} map={INVOICE_STATUS} testid="invoice-status-admin" />
              </div>
              <div className="space-y-1.5 text-sm">
                {invoice.items.map((it, i) => (
                  <div key={i} className="flex justify-between"><span className="text-slate-600">{it.label}</span><span className="font-medium">{rupiah(it.amount)}</span></div>
                ))}
                <div className="flex justify-between font-bold pt-2 border-t border-slate-100"><span>Total</span><span className="text-[#0047AB]">{rupiah(invoice.total)}</span></div>
                <p className="text-xs text-slate-400 pt-1 flex items-center gap-1"><Landmark className="w-3.5 h-3.5" /> {invoice.rekening} · {invoice.region}</p>
                {invoice.extra_pipa_meter > 0 && <p className="text-xs text-slate-500">Pipa aktual: {invoice.total_pipa_meter} m (extra {invoice.extra_pipa_meter} m)</p>}
              </div>

              <div className="mt-5 space-y-3" data-testid="payments-admin">
                <p className="text-xs font-bold uppercase tracking-[0.15em] text-slate-400">Pembayaran Masuk</p>
                {payments.map((p) => (
                  <div key={p.id} className="border border-slate-100 rounded-lg p-4" data-testid={`payment-${p.id}`}>
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="text-sm">
                        <p className="font-semibold">{rupiah(p.jumlah)} <span className="text-slate-400 font-normal">· {fmtD(p.tanggal_pembayaran)}</span></p>
                        {p.catatan && <p className="text-xs text-slate-500 mt-0.5">"{p.catatan}"</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={p.status} map={PAYMENT_STATUS} />
                        {p.bukti_path && <a href={fileUrl(p.bukti_path)} target="_blank" rel="noreferrer" data-testid={`bukti-${p.id}`} className="text-xs text-[#0047AB] font-semibold hover:underline">Lihat Bukti</a>}
                      </div>
                    </div>
                    {p.status === "pending" && (
                      <div className="flex gap-2 mt-3 flex-wrap">
                        <Input data-testid={`paynote-${p.id}`} value={payNote[p.id] || ""} onChange={(e) => setPayNote({ ...payNote, [p.id]: e.target.value })} placeholder="Catatan (opsional)" className="flex-1 min-w-[180px]" />
                        <Button size="sm" data-testid={`pay-verify-${p.id}`} disabled={busy} onClick={() => reviewPayment(p.id, "verify")} className="rounded-full bg-emerald-600 hover:bg-emerald-700">Verifikasi</Button>
                        <Button size="sm" variant="outline" data-testid={`pay-reject-${p.id}`} disabled={busy} onClick={() => reviewPayment(p.id, "reject")} className="rounded-full text-red-600 border-red-200 hover:bg-red-50">Tolak</Button>
                      </div>
                    )}
                    {p.verified_by_name && <p className="text-xs text-slate-400 mt-2">Diproses oleh {p.verified_by_name}{p.admin_catatan ? ` — "${p.admin_catatan}"` : ""}</p>}
                  </div>
                ))}
                {payments.length === 0 && <p className="text-xs text-slate-400">Belum ada bukti pembayaran diupload.</p>}
              </div>
            </section>
          )}

          {data.invoices?.some((i) => i.jenis === "monthly") && (
            <section className="bg-white border border-slate-200 rounded-xl p-6" data-testid="monthly-billings-admin">
              <h2 className="font-heading font-bold text-slate-800 mb-4">Tagihan Bulanan</h2>
              <div className="space-y-2 text-sm">
                {data.invoices.filter((i) => i.jenis === "monthly").map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between border border-slate-100 rounded-lg p-3 flex-wrap gap-2" data-testid={`monthly-${inv.nomor}`}>
                    <span>Bulan ke-{inv.periode} · tempo {inv.due_date}</span>
                    <div className="flex items-center gap-3">
                      <span className="font-semibold">{rupiah(inv.total)}</span>
                      <StatusBadge status={inv.status} map={{ ...INVOICE_STATUS, scheduled: { label: "Terjadwal", cls: "bg-slate-100 text-slate-500 border-slate-200" }, overdue: { label: "Terlewat", cls: "bg-red-100 text-red-800 border-red-200" } }} />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {order.status === "returned" && (
            <section className="bg-white border-2 border-emerald-200 rounded-xl p-6">
              <h2 className="font-heading font-bold text-slate-800">Penyelesaian Order</h2>
              <p className="text-sm text-slate-500 mt-1">Unit sudah dikembalikan. Klik selesai untuk mengakhiri order dan mengembalikan status unit menjadi ready.</p>
              <Button data-testid="btn-complete" onClick={complete} className="mt-4 rounded-full bg-emerald-600 hover:bg-emerald-700"><FlagTriangleRight className="w-4 h-4 mr-2" /> Selesaikan Order</Button>
            </section>
          )}
        </div>

        <div className="space-y-6">
          {contract && (
            <section className="bg-white border border-slate-200 rounded-xl p-6" data-testid="contract-admin">
              <h2 className="font-heading font-bold text-slate-800 mb-3 flex items-center gap-2"><FileText className="w-5 h-5 text-[#0047AB]" /> Kontrak {contract.content?.nomor}</h2>
              <p className="text-xs text-slate-500">Status: <b>{contractSigned ? "Ditandatangani" : "Menunggu TTD customer"}</b></p>
              {contractSigned && <p className="text-xs text-slate-500 mt-1">Oleh <b>{contract.signer_name}</b> pada {fmtD(contract.signed_at)}</p>}
              {contract.pdf_path && <a href={fileUrl(contract.pdf_path)} target="_blank" rel="noreferrer" data-testid="contract-pdf-link" className="mt-2 inline-block text-xs font-semibold text-[#0047AB] hover:underline">Lihat Kontrak PDF Bertanda Tangan</a>}
              <ul className="list-disc ml-5 mt-3 text-xs text-slate-600 space-y-1">{(contract.content?.items || []).map((it, i) => <li key={i}>{it}</li>)}</ul>
            </section>
          )}

          <section className="bg-white border border-slate-200 rounded-xl p-6">
            <h2 className="font-heading font-bold text-slate-800 mb-4">Timeline Status</h2>
            <ol className="relative border-l-2 border-slate-200 ml-2 space-y-5" data-testid="admin-timeline">
              {[...order.status_history].reverse().map((h, i) => (
                <li key={i} className="ml-5 relative">
                  <span className={`absolute -left-[27px] top-1 w-3.5 h-3.5 rounded-full border-2 ${i === 0 ? "bg-[#0047AB] border-[#0047AB]" : "bg-white border-slate-300"}`} />
                  <StatusBadge status={h.status} />
                  <p className="text-xs text-slate-400 mt-1">{fmtD(h.at)} · {h.by}</p>
                  {h.catatan && <p className="text-xs text-slate-600 mt-0.5">{h.catatan}</p>}
                </li>
              ))}
            </ol>
            {verification && (
              <div className="mt-5 pt-4 border-t border-slate-100 text-xs text-slate-500">
                Diverifikasi oleh {verification.verified_by_name} — {verification.hasil === "approved" ? "Disetujui" : "Ditolak"}
                {verification.catatan && <p className="mt-1 text-slate-600">"{verification.catatan}"</p>}
              </div>
            )}
          </section>

          <section className="bg-white border border-slate-200 rounded-xl p-6">
            <h2 className="font-heading font-bold text-slate-800 mb-4">Jadwal ({schedules.length})</h2>
            <div className="space-y-3">
              {schedules.map((s) => (
                <div key={s.id} data-testid={`schedule-item-${s.id}`} className="text-sm border border-slate-100 rounded-lg p-3">
                  <div className="flex justify-between items-center">
                    <p className="font-semibold">{JENIS_KEGIATAN[s.jenis_kegiatan]}</p>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${s.status === "done" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{s.status === "done" ? "Selesai" : "Terjadwal"}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">{s.tanggal} {s.jam} · {s.technician_name}</p>
                </div>
              ))}
              {schedules.length === 0 && <p className="text-xs text-slate-400">Belum ada jadwal.</p>}
            </div>
          </section>

          <section className="bg-white border border-slate-200 rounded-xl p-6">
            <h2 className="font-heading font-bold text-slate-800 mb-4">Riwayat Pekerjaan</h2>
            <div className="space-y-4 text-xs">
              {[["Pengiriman", deliveries], ["Instalasi", installations], ["Maintenance", maintenances], ["Pengembalian", returns]].map(([label, list]) => (
                <div key={label}>
                  <p className="font-bold text-slate-700 uppercase tracking-wider text-[10px]">{label} ({list.length})</p>
                  {list.map((w) => (
                    <div key={w.id} className="mt-2 border border-slate-100 rounded-lg p-3" data-testid={`work-${w.id}`}>
                      <p className="text-slate-600">{fmtD(w.tanggal)}</p>
                      {(w.kondisi_unit || w.kondisi_instalasi) && <p className="text-slate-500 mt-1">Kondisi: {w.kondisi_unit || w.kondisi_instalasi}</p>}
                      {w.hasil && <p className="text-slate-500">Hasil: {w.hasil}</p>}
                      {w.jenis_maintenance && <p className="text-slate-500">Jenis: {w.jenis_maintenance}</p>}
                      {w.total_pipa_meter > 0 && <p className="text-slate-500">Pipa: dibawa {w.pipa_dibawa_meter || "-"} m · terpakai {w.pipa_terpakai_meter || w.total_pipa_meter} m{w.extra_pipa_meter > 0 ? ` (extra ${w.extra_pipa_meter} m = ${rupiah(w.biaya_extra_pipa)})` : " (dalam paket)"}</p>}
                      {(w.ducttape_terpakai || w.kabel_terpakai) && <p className="text-slate-500">Ducttape: {w.ducttape_terpakai || "-"} · Kabel: {w.kabel_terpakai || "-"}</p>}
                      {w.helper && <p className="text-slate-500">Helper: {w.helper}</p>}
                      {w.koordinat_sesuai && <p className="text-slate-500">Titik koordinat konsumen: {w.koordinat_sesuai === "sesuai" ? "Sesuai" : "Tidak sesuai"}</p>}
                      {w.edukasi_customer && <p className="text-slate-500">Edukasi penggunaan AC: {w.edukasi_customer === "ya" ? "Ya" : "Tidak"}</p>}
                      {w.fotos?.length > 0 && <p className="mt-1 flex gap-2 flex-wrap">{w.fotos.map((fp, fi) => <a key={fi} href={fileUrl(fp)} target="_blank" rel="noreferrer" data-testid={`work-fotos-${w.id}-${fi}`} className="text-[#0047AB] font-semibold hover:underline">Foto {fi + 1}</a>)}</p>}
                      {w.denda > 0 && <p className="text-red-600 font-semibold">Denda: {rupiah(w.denda)}</p>}
                      {w.catatan && <p className="text-slate-500 italic mt-1">"{w.catatan}"</p>}
                      {w.foto && <a href={fileUrl(w.foto)} target="_blank" rel="noreferrer" data-testid={`work-foto-${w.id}`} className="text-[#0047AB] font-semibold hover:underline inline-block mt-1">Lihat Foto</a>}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
