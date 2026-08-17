import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Snowflake, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { fmtErr } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const BG = "https://images.unsplash.com/photo-1660330589827-da8ab7dd3c02?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1NjZ8MHwxfHNlYXJjaHwyfHxodmFjJTIwdGVjaG5pY2lhbiUyMGluc3RhbGxhdGlvbnxlbnwwfHx8fDE3ODYxODk0NzR8MA&ixlib=rb-4.1.0&q=85";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const user = await login(email, password);
      toast.success(`Selamat datang, ${user.name}`);
      navigate(user.role === "admin" ? "/admin" : user.role === "courier" ? "/kurir" : "/teknisi");
    } catch (err) {
      toast.error(fmtErr(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2" data-testid="login-page">
      <div className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <Link to="/" data-testid="login-logo" className="flex items-center">
            <img src="/assets/logo.jpeg" alt="CollerMind" className="h-11 w-auto object-contain rounded-lg" />
          </Link>
          <h1 className="font-heading text-3xl font-black tracking-tight text-slate-900 mt-10">Masuk Portal</h1>
          <p className="text-slate-500 text-sm mt-2">Khusus Admin, Teknisi & Kurir. Customer tidak memerlukan akun.</p>
          <form onSubmit={submit} className="mt-8 space-y-5">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" data-testid="login-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1.5 h-12" placeholder="nama@email.com" />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input id="password" data-testid="login-password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1.5 h-12" placeholder="••••••••" />
            </div>
            <Button type="submit" data-testid="login-submit" disabled={loading} className="w-full h-12 rounded-full bg-[#0047AB] hover:bg-[#003a8c] font-semibold">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Masuk"}
            </Button>
          </form>
          <Link to="/" data-testid="login-back" className="block text-center text-sm text-slate-500 mt-6 hover:text-[#0047AB] transition-colors">← Kembali ke beranda</Link>
        </div>
      </div>
      <div className="hidden lg:block relative">
        <img src={BG} alt="Teknisi" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-[#0047AB]/60" />
        <div className="relative h-full flex flex-col justify-end p-12 text-white">
          <h2 className="font-heading text-3xl font-black tracking-tight">Kelola operasional penyewaan dalam satu sistem.</h2>
          <p className="text-blue-100 mt-3 text-sm leading-relaxed">Verifikasi, kontrak digital, penjadwalan, instalasi, invoice, hingga pengembalian.</p>
        </div>
      </div>
    </div>
  );
}
