import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard, BellRing, FileText, Network,
  Brain, Settings, Download, Shield, Menu, X,
} from "lucide-react";
import { getAlerts } from "@/api/client";

const NAV_ITEMS = [
  { icon: LayoutDashboard, label: "Dashboard",        to: "/" },
  { icon: BellRing,        label: "Alerts",           to: "/alerts" },
  { icon: FileText,        label: "Reports",          to: "/reports" },
  { icon: Network,         label: "Network Activity", to: "/network" },
  { icon: Brain,           label: "AI Explainability", to: "/explain" },
  { icon: Settings,        label: "Settings",         to: "/settings" },
];

const toCsv = (rows: Record<string, unknown>[]) => {
  if (rows.length === 0) return "timestamp,source_ip,destination_ip,prediction,severity,confidence";
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))].join("\n");
};

const Sidebar = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const location = useLocation();

  const handleExportLogs = async () => {
    setExporting(true);
    try {
      const alerts = await getAlerts({ limit: 500, exclude_benign: true });
      const rows = (Array.isArray(alerts) ? alerts : []).map((a) => ({
        timestamp: a.timestamp,
        source_ip: a.source_ip,
        destination_ip: a.destination_ip ?? "",
        prediction: a.prediction,
        severity: a.severity,
        confidence: a.confidence,
      }));
      const blob = new Blob([toCsv(rows)], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `nids_alerts_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("[Export] Failed to fetch alerts:", err);
    } finally {
      setExporting(false);
    }
  };

  const nav = (
    <nav className="flex-1 px-4 py-2 space-y-1 overflow-y-auto" aria-label="Primary">
      {NAV_ITEMS.map(({ icon: Icon, label, to }) => {
        const isActive = location.pathname === to;
        return (
          <NavLink
            key={to}
            to={to}
            onClick={() => setMobileOpen(false)}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-all duration-150"
            style={{
              background: isActive ? "rgba(161,250,255,0.08)" : "transparent",
              borderLeft: isActive ? "3px solid #a1faff" : "3px solid transparent",
              color: isActive ? "#a1faff" : "rgba(255,255,255,0.55)",
            }}
          >
            <Icon size={18} />
            <span className="text-sm font-medium">{label}</span>
          </NavLink>
        );
      })}
    </nav>
  );

  const brand = (
    <div className="p-6 flex items-center gap-3 shrink-0">
      <div
        className="w-10 h-10 rounded-lg flex items-center justify-center shadow-lg"
        style={{
          background: "linear-gradient(135deg, #a1faff, #699cff)",
          boxShadow: "0 4px 16px rgba(161,250,255,0.25)",
        }}
      >
        <Shield size={20} style={{ color: "#006165" }} />
      </div>
      <div>
        <h1
          className="font-bold text-xl leading-none"
          style={{ color: "#a1faff", fontFamily: "'Space Grotesk', sans-serif" }}
        >
          The Sentinel
        </h1>
        <p className="text-[10px] uppercase tracking-widest mt-1" style={{ color: "rgba(255,255,255,0.55)" }}>
          NIDS Command Center
        </p>
      </div>
    </div>
  );

  const footer = (
    <div className="p-4 shrink-0 space-y-3" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
      <button
        onClick={handleExportLogs}
        disabled={exporting}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold transition-all hover:brightness-110 disabled:opacity-50"
        style={{
          background: "rgba(161,250,255,0.15)",
          color: "#a1faff",
          border: "1px solid rgba(161,250,255,0.2)",
        }}
        title="Exports the latest 500 attack alerts as CSV"
      >
        <Download size={16} />
        {exporting ? "Exporting..." : "Export Alerts CSV"}
      </button>
      <div className="flex justify-between px-1">
        <span className="text-[10px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.25)" }}>
          v1.0.0
        </span>
        <a
          href="http://localhost:8000/docs"
          target="_blank"
          rel="noreferrer"
          className="text-[10px] font-bold uppercase tracking-widest transition-colors"
          style={{ color: "rgba(255,255,255,0.35)" }}
        >
          API Docs
        </a>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile top bar */}
      <header
        className="lg:hidden fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-3"
        style={{
          background: "rgba(10,14,25,0.95)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <div className="flex items-center gap-2">
          <Shield size={18} style={{ color: "#a1faff" }} />
          <span className="font-bold text-lg" style={{ color: "#a1faff", fontFamily: "'Space Grotesk', sans-serif" }}>
            The Sentinel
          </span>
        </div>
        <button
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          onClick={() => setMobileOpen((o) => !o)}
          className="p-2 rounded-lg transition-colors"
          style={{ color: "rgba(255,255,255,0.7)", background: "rgba(255,255,255,0.05)" }}
        >
          {mobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </header>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 flex"
          role="dialog"
          aria-label="Navigation menu"
        >
          <div
            className="absolute inset-0"
            style={{ background: "rgba(0,0,0,0.6)" }}
            onClick={() => setMobileOpen(false)}
          />
          <aside
            className="relative flex flex-col w-64 h-full"
            style={{ background: "linear-gradient(180deg, #0f131f 0%, #0a0e19 100%)" }}
          >
            <div className="pt-16" />
            {brand}
            {nav}
            {footer}
          </aside>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside
        className="hidden lg:flex flex-col h-screen w-64 fixed left-0 top-0 z-50 border-r"
        style={{
          background: "linear-gradient(180deg, #0f131f 0%, #0a0e19 100%)",
          borderColor: "rgba(255,255,255,0.05)",
        }}
      >
        {brand}
        {nav}
        {footer}
      </aside>
    </>
  );
};
export default Sidebar;