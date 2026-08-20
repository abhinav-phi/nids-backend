import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { Alert } from "@/hooks/useWebSocket";
import SHAPExplainer from "./SHAPExplainer";
import { ChevronRight, Download, RefreshCw } from "lucide-react";
import { getAlerts } from "@/api/client";

interface Props {
  /** Live stream from WebSocket (dashboard mode). */
  history?: Alert[];
  /** Archive mode: fetch pages from GET /api/alerts with filters. */
  archive?: boolean;
  pageSize?: number;
}

export const SEV_STYLES: Record<string, { color: string; bg: string; border: string; label: string }> = {
  CRITICAL: { color: "#ff716c", bg: "rgba(255,113,108,0.12)", border: "rgba(255,113,108,0.25)", label: "Critical" },
  HIGH:     { color: "#699cff", bg: "rgba(0,90,194,0.2)",     border: "rgba(105,156,255,0.25)", label: "High" },
  MEDIUM:   { color: "#ac8aff", bg: "rgba(143,96,250,0.12)",  border: "rgba(172,138,255,0.2)",  label: "Medium" },
  LOW:      { color: "rgba(255,255,255,0.4)", bg: "rgba(255,255,255,0.05)", border: "rgba(255,255,255,0.1)", label: "Low" },
  NONE:     { color: "rgba(255,255,255,0.25)", bg: "rgba(255,255,255,0.03)", border: "rgba(255,255,255,0.06)", label: "None" },
};

const ATTACK_TYPES = ["Bots", "Brute Force", "DDoS", "DoS", "Port Scanning", "Web Attacks"];
const SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

export const httpErrorDetail = (err: unknown, fallback: string): string => {
  const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
  return detail ?? fallback;
};

export const alertsToCsv = (alerts: Alert[]) => {
  const rows = alerts.map((a) => ({
    timestamp: a.timestamp,
    source_ip: a.src_ip,
    prediction: a.attack_type ?? "",
    severity: a.severity ?? "",
    confidence: a.confidence ?? 0,
  }));
  const headers = Object.keys(rows[0] ?? {});
  const escape = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))].join("\n");
};

const AlertFeed = ({ history, archive = false, pageSize = 25 }: Props) => {
  const [selected, setSelected] = useState<Alert | null>(null);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const prevLenRef = useRef(0);

  const [archiveAlerts, setArchiveAlerts] = useState<Alert[]>([]);
  const [archLoading, setArchLoading] = useState(false);
  const [archError, setArchError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [filterType, setFilterType] = useState("all");
  const [filterSeverity, setFilterSeverity] = useState("all");
  const [search, setSearch] = useState("");

  const liveAlerts = history ?? [];
  const showError = archive ? archError : null;

  const fetchArchive = useCallback(async () => {
    setArchLoading(true);
    setArchError(null);
    try {
      const params: Record<string, unknown> = { limit: pageSize, offset: page * pageSize, exclude_benign: true };
      if (filterType !== "all") params.type = filterType;
      if (filterSeverity !== "all") params.severity = filterSeverity;
      if (search.trim()) params.type = search.trim();
      const data = await getAlerts(params);
      setArchiveAlerts(Array.isArray(data) ? data : []);
    } catch (err: unknown) {
      setArchError(httpErrorDetail(err, "Could not load alerts from the backend."));
      setArchiveAlerts([]);
    } finally {
      setArchLoading(false);
    }
  }, [pageSize, page, filterType, filterSeverity, search]);

  useEffect(() => {
    if (archive) {
      void fetchArchive();
    }
  }, [archive, fetchArchive]);

  useEffect(() => {
    if (liveAlerts.length > prevLenRef.current) {
      const fresh = liveAlerts.slice(0, liveAlerts.length - prevLenRef.current);
      const ids = new Set(fresh.map((a) => a.timestamp + a.src_ip));
      setNewIds(ids);
      const t = setTimeout(() => setNewIds(new Set()), 600);
      prevLenRef.current = liveAlerts.length;
      return () => clearTimeout(t);
    }
  }, [liveAlerts]);

  let alerts: Alert[];
  if (archive) {
    alerts = archiveAlerts;
  } else {
    alerts = liveAlerts.slice(0, 50).filter((a) => {
      if (filterType !== "all" && (a.attack_type ?? "") !== filterType) return false;
      if (filterSeverity !== "all" && (a.severity ?? "").toUpperCase() !== filterSeverity) return false;
      if (search.trim() && !`${a.src_ip} ${a.attack_type}`.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }

  const handleExport = () => {
    const blob = new Blob([alertsToCsv(alerts)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nids_alerts_view_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const resetToFirstPageAndFetch = () => {
    if (page !== 0) setPage(0);
    else fetchArchive();
  };

  return (
    <div
      className="rounded-2xl border flex flex-col h-full overflow-hidden"
      style={{
        background: "rgba(26,31,46,0.6)",
        backdropFilter: "blur(12px)",
        borderColor: "rgba(255,255,255,0.06)",
        boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between gap-4 px-6 py-4 shrink-0 flex-wrap"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.03)" }}
      >
        <div className="flex items-center gap-3">
          <span
            className="w-2 h-2 rounded-full animate-blink-dot"
            style={{ backgroundColor: alerts.length > 0 ? "#ff716c" : "#a1faff" }}
          />
          <span className="text-lg font-bold" style={{ color: "#e8eafb", fontFamily: "'Space Grotesk', sans-serif" }}>
            {archive ? "Alert Archive" : "Live Threat Log"}
          </span>
          {alerts.length > 0 && (
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: "rgba(255,113,108,0.12)", color: "#ff716c", border: "1px solid rgba(255,113,108,0.2)" }}
            >
              {alerts.length} shown
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Filters */}
          <select
            aria-label="Filter by attack type"
            value={filterType}
            onChange={(e) => { setFilterType(e.target.value); if (archive) setPage(0); }}
            className="text-xs rounded-md px-2 py-1.5 outline-none"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.7)" }}
          >
            <option value="all">All types</option>
            {ATTACK_TYPES.map((t) => (
              <option key={t} value={t} style={{ color: "#0a0e19" }}>{t}</option>
            ))}
          </select>
          <select
            aria-label="Filter by severity"
            value={filterSeverity}
            onChange={(e) => { setFilterSeverity(e.target.value); if (archive) setPage(0); }}
            className="text-xs rounded-md px-2 py-1.5 outline-none"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.7)" }}
          >
            <option value="all">All severities</option>
            {SEVERITIES.map((s) => (
              <option key={s} value={s} style={{ color: "#0a0e19" }}>{s}</option>
            ))}
          </select>
          <input
            aria-label="Search alerts"
            type="search"
            placeholder="Search IP or type..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="text-xs rounded-md px-2 py-1.5 outline-none w-40"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.7)" }}
          />
          <button
            onClick={resetToFirstPageAndFetch}
            aria-label="Refresh alerts"
            className="p-1.5 rounded-md transition-colors"
            style={{ color: "rgba(255,255,255,0.5)" }}
            title="Refresh"
          >
            <RefreshCw size={14} className={archLoading ? "animate-spin" : ""} />
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 text-xs font-bold px-2.5 py-1.5 rounded-md transition-colors"
            style={{ background: "rgba(161,250,255,0.1)", color: "#a1faff", border: "1px solid rgba(161,250,255,0.2)" }}
            title="Export the current view as CSV"
          >
            <Download size={13} /> CSV
          </button>
          {!archive && (
            <Link
              to="/alerts"
              className="text-xs font-bold transition-colors hover:underline ml-2"
              style={{ color: "#a1faff" }}
            >
              Historical Archive
            </Link>
          )}
        </div>
      </div>

      {/* Body */}
      {showError ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 p-8 text-sm" style={{ color: "#f85149" }}>
          <span>{showError}</span>
        </div>
      ) : alerts.length === 0 && !archLoading ? (
        <div className="flex-1 flex items-center justify-center text-sm" style={{ color: "rgba(255,255,255,0.25)" }}>
          No matching alerts in the current view.
        </div>
      ) : archLoading && archive && alerts.length === 0 ? (
        <div className="flex-1" style={{ minHeight: 220 }}>
          <div className="h-full animate-pulse rounded-xl" style={{ background: "rgba(255,255,255,0.03)" }} />
        </div>
      ) : (
        <div className="overflow-auto flex-1">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-10" style={{ background: "rgba(26,31,46,0.98)" }}>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                {["Timestamp", "Source IP", "Destination", "Attack Type", "Confidence", "Severity", "Explain"].map((h, idx) => (
                  <th
                    key={h}
                    className="py-4 text-[10px] font-bold uppercase tracking-widest"
                    style={{
                      color: "rgba(255,255,255,0.3)",
                      paddingLeft: idx === 0 ? "2rem" : "1rem",
                      paddingRight: idx === 6 ? "2rem" : "1rem",
                      textAlign: idx === 6 ? "right" : "left",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {alerts.map((alert, i) => {
                const sev = (alert.severity || "LOW").toUpperCase();
                const style = SEV_STYLES[sev] || SEV_STYLES.LOW;
                const id = alert.timestamp + alert.src_ip;
                const isNew = newIds.has(id);
                const isSelected = selected === alert;
                return (
                  <tr
                    key={(alert.id ?? "") + i}
                    onClick={() => setSelected(isSelected ? null : alert)}
                    className={`cursor-pointer transition-all duration-150 ${isNew ? "animate-flash-new" : ""}`}
                    style={{
                      background: isSelected ? `${style.color}14` : i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)",
                      borderLeft: isSelected ? `2px solid ${style.color}` : "2px solid transparent",
                    }}
                  >
                    <td className="py-4 font-mono-code text-xs" style={{ color: "rgba(255,255,255,0.35)", paddingLeft: "2rem" }}>
                      {new Date(alert.timestamp).toLocaleString()}
                    </td>
                    <td className="py-4 px-4 font-mono-code text-sm" style={{ color: "#a1faff" }}>
                      {alert.src_ip}
                    </td>
                    <td className="py-4 px-4 font-mono-code text-xs" style={{ color: "rgba(255,255,255,0.45)" }}>
                      {alert.destination_ip ?? "—"}
                    </td>
                    <td className="py-4 px-4 text-sm font-medium" style={{ color: "#e8eafb" }}>
                      {alert.attack_type}
                    </td>
                    <td className="py-4 px-4 text-xs font-mono-code" style={{ color: "rgba(255,255,255,0.5)" }}>
                      {(alert.confidence ?? 0).toFixed(2)}
                    </td>
                    <td className="py-4 px-4">
                      <span
                        className="px-2.5 py-0.5 rounded text-[10px] font-black uppercase"
                        style={{ background: style.bg, color: style.color, border: `1px solid ${style.border}` }}
                      >
                        {style.label}
                      </span>
                    </td>
                    <td className="py-4 text-right" style={{ paddingRight: "2rem" }}>
                      <Link
                        to={`/explain?src=${encodeURIComponent(alert.src_ip)}&t=${encodeURIComponent(alert.timestamp)}`}
                        className="inline-flex items-center gap-1 text-xs font-bold ml-auto transition-colors"
                        style={{ color: "#a1faff" }}
                      >
                        SHAP
                        <ChevronRight size={14} />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer / pagination */}
      {archive && (
        <div
          className="flex items-center justify-between px-6 py-3 shrink-0"
          style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}
        >
          <span className="text-[10px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.3)" }}>
            Page {page + 1} · {pageSize} rows
          </span>
          <div className="flex gap-2">
            <button
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="text-xs font-bold px-3 py-1.5 rounded-md transition-colors disabled:opacity-30"
              style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.7)" }}
            >
              Previous
            </button>
            <button
              disabled={alerts.length < pageSize}
              onClick={() => setPage((p) => p + 1)}
              className="text-xs font-bold px-3 py-1.5 rounded-md transition-colors disabled:opacity-30"
              style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.7)" }}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
export default AlertFeed;