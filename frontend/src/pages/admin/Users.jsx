import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import api, { fmtErr } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const EMPTY = { name: "", email: "", role: "technician", password: "" };

export default function Users() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);

  const load = () => api.get("/admin/users").then((r) => setUsers(r.data)).catch((e) => toast.error(fmtErr(e)));
  useEffect(() => { load(); }, []);

  async function save() {
    try {
      if (editId) await api.put(`/admin/users/${editId}`, form);
      else await api.post("/admin/users", form);
      toast.success("User disimpan");
      setOpen(false); setForm(EMPTY); setEditId(null);
      load();
    } catch (e) { toast.error(fmtErr(e)); }
  }

  async function remove(u) {
    if (!window.confirm(`Hapus user ${u.name}?`)) return;
    try { await api.delete(`/admin/users/${u.id}`); toast.success("User dihapus"); load(); } catch (e) { toast.error(fmtErr(e)); }
  }

  return (
    <div data-testid="admin-users">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight text-slate-800">User & Teknisi</h1>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setForm(EMPTY); setEditId(null); } }}>
          <DialogTrigger asChild><Button data-testid="btn-add-user" className="rounded-full bg-[#0047AB] hover:bg-[#003a8c]"><Plus className="w-4 h-4 mr-2" /> Tambah User</Button></DialogTrigger>
          <DialogContent data-testid="user-dialog">
            <DialogHeader><DialogTitle>{editId ? "Edit User" : "Tambah User"}</DialogTitle></DialogHeader>
            <div className="space-y-4 mt-2">
              <div><Label>Nama</Label><Input data-testid="user-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1.5" /></div>
              <div><Label>Email</Label><Input type="email" data-testid="user-email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1.5" /></div>
              <div>
                <Label>Role</Label>
                <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                  <SelectTrigger data-testid="user-role" className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="technician">Teknisi</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Password {editId && "(kosongkan jika tidak diubah)"}</Label><Input type="password" data-testid="user-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="mt-1.5" /></div>
            </div>
            <Button data-testid="btn-save-user" onClick={save} className="mt-4 rounded-full bg-[#0047AB] hover:bg-[#003a8c]">Simpan</Button>
          </DialogContent>
        </Dialog>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl mt-6 overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Nama</TableHead><TableHead>Email</TableHead><TableHead>Role</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id} data-testid={`user-row-${u.id}`} className="hover:bg-slate-50">
                <TableCell className="font-semibold">{u.name}{u.id === me?.id && <span className="text-xs text-slate-400 ml-2">(Anda)</span>}</TableCell>
                <TableCell>{u.email}</TableCell>
                <TableCell><span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${u.role === "admin" ? "bg-[#0047AB]/10 text-[#0047AB]" : "bg-cyan-100 text-cyan-700"}`}>{u.role === "admin" ? "Admin" : "Teknisi"}</span></TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <button data-testid={`edit-user-${u.id}`} onClick={() => { setForm({ name: u.name, email: u.email, role: u.role, password: "" }); setEditId(u.id); setOpen(true); }} className="p-2 text-slate-500 hover:text-[#0047AB] transition-colors"><Pencil className="w-4 h-4" /></button>
                    {u.id !== me?.id && <button data-testid={`delete-user-${u.id}`} onClick={() => remove(u)} className="p-2 text-slate-500 hover:text-red-500 transition-colors"><Trash2 className="w-4 h-4" /></button>}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
