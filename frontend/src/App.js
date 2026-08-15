import { BrowserRouter, Routes, Route } from "react-router-dom";
import "@/App.css";
import { AuthProvider } from "@/context/AuthContext";
import { Toaster } from "@/components/ui/sonner";

import Landing from "@/pages/public/Landing";
import RentalForm from "@/pages/public/RentalForm";
import Tracking from "@/pages/public/Tracking";
import Login from "@/pages/Login";

import AdminLayout from "@/layouts/AdminLayout";
import Dashboard from "@/pages/admin/Dashboard";
import Orders from "@/pages/admin/Orders";
import OrderDetail from "@/pages/admin/OrderDetail";
import Customers from "@/pages/admin/Customers";
import Units from "@/pages/admin/Units";
import Tariffs from "@/pages/admin/Tariffs";
import Schedules from "@/pages/admin/Schedules";
import Operations from "@/pages/admin/Operations";
import Reports from "@/pages/admin/Reports";
import Users from "@/pages/admin/Users";
import Settings from "@/pages/admin/Settings";

import TechLayout from "@/layouts/TechLayout";
import TechDashboard from "@/pages/tech/TechDashboard";
import TechTask from "@/pages/tech/TechTask";

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster richColors position="top-center" />
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/sewa" element={<RentalForm />} />
          <Route path="/tracking" element={<Tracking />} />
          <Route path="/login" element={<Login />} />

          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="orders" element={<Orders />} />
            <Route path="orders/:id" element={<OrderDetail />} />
            <Route path="customers" element={<Customers />} />
            <Route path="units" element={<Units />} />
            <Route path="tariffs" element={<Tariffs />} />
            <Route path="schedules" element={<Schedules />} />
            <Route path="operations" element={<Operations />} />
            <Route path="reports" element={<Reports />} />
            <Route path="users" element={<Users />} />
            <Route path="settings" element={<Settings />} />
          </Route>

          <Route path="/teknisi" element={<TechLayout />}>
            <Route index element={<TechDashboard />} />
            <Route path="tugas/:id" element={<TechTask />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
