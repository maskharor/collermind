import { Link, useNavigate } from "react-router-dom";
import { Snowflake } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export default function PublicLayout({ children }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-white/70 border-b border-slate-200/50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 h-16 flex items-center justify-between">
          <Link to="/" data-testid="nav-logo" className="flex items-center">
            <img src="/assets/logo.jpeg" alt="CollerMind" className="h-9 w-auto object-contain rounded-lg" />
          </Link>
          <nav className="flex items-center gap-1 sm:gap-2">
            <Link to="/" data-testid="nav-home" className="px-3 py-2 text-sm font-medium text-slate-600 hover:text-[#0047AB] transition-colors">Beranda</Link>
            <Link to="/sewa" data-testid="nav-rental" className="px-3 py-2 text-sm font-medium text-slate-600 hover:text-[#0047AB] transition-colors">Sewa AC</Link>
            <Link to="/tracking" data-testid="nav-tracking" className="px-3 py-2 text-sm font-medium text-slate-600 hover:text-[#0047AB] transition-colors">Lacak</Link>
            {user ? (
              <button
                data-testid="nav-dashboard"
                onClick={() => navigate(user.role === "admin" ? "/admin" : user.role === "courier" ? "/kurir" : "/teknisi")}
                className="ml-2 rounded-full bg-[#0047AB] text-white px-5 py-2 text-sm font-semibold hover:bg-[#003a8c] hover:-translate-y-0.5 transition-[transform,background-color] duration-200"
              >
                Dashboard
              </button>
            ) : null}
          </nav>
        </div>
      </header>
      <main>{children}</main>
      <footer className="border-t border-slate-200 bg-slate-50 mt-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-10 flex flex-col sm:flex-row justify-between gap-4 text-sm text-slate-500">
          <div className="flex items-center gap-2 font-heading font-bold text-slate-800">
            <img src="/assets/logo.jpeg" alt="CollerMind" className="h-6 w-auto object-contain rounded" />
          </div>
          <p data-testid="footer-text">Solusi penyewaan AC profesional Jabodetabek — pengiriman, instalasi, dan maintenance terjadwal.</p>
          <Link to="/login" data-testid="footer-login" className="text-xs text-slate-400 hover:text-[#0047AB] transition-colors">Masuk Internal (Admin/Teknisi/Kurir)</Link>
        </div>
      </footer>
    </div>
  );
}
