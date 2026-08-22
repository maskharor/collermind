import axios from "axios";

export const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const api = axios.create({ baseURL: API, withCredentials: true });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("sac_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export function fmtErr(e) {
  const detail = e?.response?.data?.detail;
  if (detail == null) return e?.message || "Terjadi kesalahan. Coba lagi.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail.map((x) => (x && typeof x.msg === "string" ? x.msg : JSON.stringify(x))).filter(Boolean).join(" ");
  if (detail && typeof detail.msg === "string") return detail.msg;
  return String(detail);
}

export function rupiah(n) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n || 0);
}

export function invalidCls(invalid) {
  return invalid ? "cm-invalid" : "";
}

export function fileUrl(path) {
  const token = localStorage.getItem("sac_token");
  return `${API}/admin/files/${path}${token ? `?auth=${token}` : ""}`;
}

export default api;
