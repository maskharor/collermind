import { useEffect, useState } from "react";
import { Landmark, Save } from "lucide-react";
import { toast } from "sonner";
import api, { fmtErr } from "@/lib/api";
import { usePolling } from "@/lib/usePolling";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function Settings() {
  const [accounts, setAccounts] = useState({});
  const [regions, setRegions] = useState({});
  const [busy, setBusy] = useState(false);

  const load = () => api.get("/admin/settings/bank-accounts")
      .then((r) => { setAccounts(r.data.accounts); setRegions(r.data.regions); })
      .catch((e) => toast.error(fmtErr(e)));
  useEffect(() => { load(); }, []); // eslint-disable-line
  usePolling(load, 30000);

  async function save() {
    setBusy(true);
    try {
      await api.put("/admin/settings/bank-accounts", { accounts });
      toast.success("Rekening tersimpan");
    } catch (e) { toast.error(fmtErr(e)); } finally { setBusy(false); }
  }

  return (
    <div data-testid="admin-settings" className="max-w-3xl">
      <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight text-slate-800 flex items-center gap-3">
        <Landmark className="w-7 h-7 text-[#0047AB]" /> Pengaturan Rekening
      </h1>
      <p className="text-sm text-slate-500 mt-2">Rekening tujuan transfer yang tampil di invoice customer, dipilih otomatis berdasarkan daerah alamat pemasangan.</p>

      <div className="bg-white border border-slate-200 rounded-xl p-6 mt-6 space-y-4">
        {Object.entries(regions).map(([key, label]) => (
          <div key={key}>
            <Label>{label}</Label>
            <Input data-testid={`account-${key}`} value={accounts[key] || ""} onChange={(e) => setAccounts({ ...accounts, [key]: e.target.value })} className="mt-1.5" placeholder="BCA 1234567890 a.n. CollerMind" />
          </div>
        ))}
        <Button data-testid="btn-save-accounts" onClick={save} disabled={busy} className="rounded-full bg-[#0047AB] hover:bg-[#003a8c]">
          <Save className="w-4 h-4 mr-2" /> Simpan
        </Button>
      </div>
    </div>
  );
}
