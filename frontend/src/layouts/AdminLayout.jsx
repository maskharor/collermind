import { NavLink, Outlet, useNavigate, Navigate } from "react-router-dom";
import { Snowflake, LayoutDashboard, ClipboardList, Users, Snowflake as Unit, Tag, CalendarDays, PackageCheck, BarChart3, UserCog, LogOut, Menu, Landmark } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

const MENU = [
  { to: "/admin", icon: LayoutDashboard, label: "Dashboard", end: true },
  { to: "/admin/orders", icon: ClipboardList, label: "Rental Order" },
  { to: "/admin/customers", icon: Users, label: "Customer" },
  { to: "/admin/units", icon: Unit, label: "Unit AC" },
  { to: "/admin/tariffs", icon: Tag, label: "Tarif" },
  { to: "/admin/schedules", icon: CalendarDays, label: "Jadwal" },
  { to: "/admin/operations", icon: PackageCheck, label: "Operasional" },
  { to: "/admin/reports", icon: BarChart3, label: "Laporan" },
  { to: "/admin/users", icon: UserCog, label: "User" },
  { to: "/admin/settings", icon: Landmark, label: "Pengaturan" },
];

function NavItems({ onClick }) {
  return MENU.map((m) => (
    <NavLink key={m.to} to={m.to} end={m.end} onClick={onClick} data-testid={`menu-${m.label.toLowerCase().replace(/\s/g, "-")}`}
      className={({ isActive }) => `flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${isActive ? "bg-[#0047AB] text-white" : "text-slate-600 hover:bg-slate-100"}`}>
      <m.icon className="w-4 h-4" /> {m.label}
    </NavLink>
  ));
}

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  if (user === null) return <div className="min-h-screen flex items-center justify-center text-slate-400">Memuat...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== "admin") return <Navigate to="/teknisi" replace />;

  return (
    <div className="min-h-screen bg-slate-50" data-testid="admin-layout">
      <aside className="hidden md:flex fixed inset-y-0 left-0 w-64 bg-white border-r border-slate-200 flex-col z-40">
        <div className="h-16 flex items-center gap-2 px-6 border-b border-slate-100 font-heading font-extrabold text-slate-900">
          <span className="w-8 h-8 rounded-lg bg-[#0047AB] text-white flex items-center justify-center"><Snowflake className="w-4 h-4" /></span>
          Coller<span className="text-cyan-500">Mind</span>
        </div>
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto"><NavItems /></nav>
        <div className="p-4 border-t border-slate-100">
          <p className="text-sm font-semibold text-slate-800 truncate" data-testid="admin-name">{user.name}</p>
          <p className="text-xs text-slate-400 truncate">{user.email}</p>
          <button data-testid="admin-logout" onClick={async () => { await logout(); navigate("/login"); }} className="mt-3 flex items-center gap-2 text-sm text-red-500 hover:text-red-600 transition-colors">
            <LogOut className="w-4 h-4" /> Keluar
          </button>
        </div>
      </aside>

      <div className="md:hidden sticky top-0 z-40 bg-white border-b border-slate-200 h-14 flex items-center justify-between px-4">
        <span className="font-heading font-extrabold text-slate-900 flex items-center gap-2"><Snowflake className="w-5 h-5 text-[#0047AB]" /> Admin</span>
        <Sheet>
          <SheetTrigger data-testid="admin-mobile-menu"><Menu className="w-6 h-6 text-slate-700" /></SheetTrigger>
          <SheetContent side="left" className="w-64 p-4">
            <nav className="space-y-1 mt-6"><NavItems /></nav>
            <button data-testid="admin-logout-mobile" onClick={async () => { await logout(); navigate("/login"); }} className="mt-6 flex items-center gap-2 text-sm text-red-500"><LogOut className="w-4 h-4" /> Keluar</button>
          </SheetContent>
        </Sheet>
      </div>

      <main className="md:ml-64 p-4 sm:p-8"><Outlet /></main>
    </div>
  );
}
