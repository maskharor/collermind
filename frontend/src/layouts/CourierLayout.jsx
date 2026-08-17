import { Outlet, useNavigate, Navigate, Link } from "react-router-dom";
import { Truck, LogOut } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export default function CourierLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  if (user === null) return <div className="min-h-screen flex items-center justify-center text-slate-400">Memuat...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== "courier") return <Navigate to={user.role === "admin" ? "/admin" : "/teknisi"} replace />;

  return (
    <div className="min-h-screen bg-slate-50" data-testid="courier-layout">
      <header className="sticky top-0 z-40 bg-[#0047AB] text-white shadow-md">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link to="/kurir" data-testid="courier-logo" className="flex items-center gap-2 font-heading font-extrabold">
            <Truck className="w-5 h-5 text-cyan-300" /> CollerMind Kurir
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-sm text-blue-100 hidden sm:block" data-testid="courier-name">{user.name}</span>
            <button data-testid="courier-logout" onClick={async () => { await logout(); navigate("/login"); }} className="p-2 rounded-full hover:bg-white/10 transition-colors"><LogOut className="w-5 h-5" /></button>
          </div>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-6"><Outlet /></main>
    </div>
  );
}
