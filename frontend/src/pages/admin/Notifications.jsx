import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Copy, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import api, { fmtErr } from "@/lib/api";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePolling } from "@/lib/usePolling";

function waLink(phone, message) {
  let p = (phone || "").replace(/\D/g, "");
  if (p.startsWith("0")) p = "62" + p.slice(1);
  return `https://wa.me/${p}?text=${encodeURIComponent(message)}`;
}

export default function Notifications() {
  const [notifs, setNotifs] = useState([]);
  const [channel, setChannel] = useState("");

  const load = () => api.get("/admin/notifications", { params: channel ? { channel } : {} })
      .then((r) => setNotifs(r.data))
      .catch(() => {});
  useEffect(() => { load(); }, [channel]); // eslint-disable-line
  usePolling(load, 15000);

  return (
    <div data-testid="admin-notifications">
      <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight text-slate-800">Notifikasi</h1>
      <p className="text-sm text-slate-500 mt-2">Email terkirim otomatis via sistem. WhatsApp disimulasikan — gunakan tombol WA untuk mengirim pesan yang sudah digenerate secara manual.</p>

      <div className="flex gap-2 mt-6" data-testid="notif-filters">
        {[["", "Semua"], ["email", "Email"], ["whatsapp", "WhatsApp"]].map(([v, l]) => (
          <button key={v} onClick={() => setChannel(v)} data-testid={`nf-${v || "all"}`} className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${channel === v ? "bg-[#0047AB] text-white" : "bg-white border border-slate-200 text-slate-600 hover:border-[#0047AB]"}`}>{l}</button>
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl mt-6 overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Waktu</TableHead><TableHead>Order</TableHead><TableHead>Customer</TableHead><TableHead>Channel</TableHead><TableHead>Tujuan</TableHead><TableHead>Status</TableHead><TableHead>Pesan</TableHead><TableHead>Aksi</TableHead></TableRow></TableHeader>
          <TableBody>
            {notifs.map((n) => (
              <TableRow key={n.id} data-testid={`notif-row-${n.id}`} className="hover:bg-slate-50">
                <TableCell className="text-xs whitespace-nowrap">{format(new Date(n.created_at), "dd/MM/yy HH:mm")}</TableCell>
                <TableCell className="font-semibold text-xs">{n.kode}</TableCell>
                <TableCell className="text-xs">{n.customer_nama}</TableCell>
                <TableCell>
                  <span className={`text-xs font-semibold px-2 py-1 rounded-full ${n.channel === "email" ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"}`}>
                    {n.channel === "email" ? "Email" : "WhatsApp"}
                  </span>
                </TableCell>
                <TableCell className="text-xs">{n.to}</TableCell>
                <TableCell className="text-xs">{n.status === "sent" ? <span className="text-emerald-600 font-semibold">Terkirim</span> : <span className="text-amber-600 font-semibold">{n.status === "simulated" ? "Simulasi" : "Tercatat"}</span>}</TableCell>
                <TableCell className="max-w-[280px]"><p className="text-xs text-slate-500 truncate" title={n.message}>{n.subject}</p></TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <button data-testid={`copy-${n.id}`} aria-label="Salin pesan" onClick={() => { navigator.clipboard.writeText(n.message); toast.success("Pesan disalin"); }} className="p-2 text-slate-500 hover:text-[#0047AB] transition-colors" title="Salin pesan"><Copy className="w-4 h-4" /></button>
                    {n.channel === "whatsapp" && (
                      <a data-testid={`wa-${n.id}`} href={waLink(n.to, n.message)} target="_blank" rel="noreferrer" className="p-2 text-slate-500 hover:text-emerald-600 transition-colors" title="Buka WhatsApp dengan pesan ini"><MessageCircle className="w-4 h-4" /></a>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {notifs.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-slate-400 py-10">Belum ada notifikasi</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
