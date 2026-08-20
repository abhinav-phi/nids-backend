import { useCallback, useEffect, useState } from "react";
import PageShell from "@/components/PageShell";
import { getSystemStatus } from "@/api/client";
import { RefreshCw } from "lucide-react";

interface SystemStatus {
  health?: {
    status?: string;
    db?: string;
    model?: string;
    sniffer?: string;
    uptime_seconds?: number;
    ws_clients?: number;
  };
  manifest?: Record<string, unknown> | null;
  sniffer?: Record<string, unknown> | null;
  rate_limit_per_minute?: number;
  api_secret_configured?: boolean;
  capture_auto_start?: boolean;
}

const Row = ({ label, value, ok }: { label: string; value: string; ok?: boolean }) => (
  <div
    className="flex items-center justify-between gap-4 px-5 py-3"
    style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
  >
    <span className="text-xs font-bold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.35)" }}>
      {label}
    </span>
    <span
      className="font-mono-code text-xs"
      style={{ color: ok === false ? "#f85149" : ok === true ? "#a1faff" : "rgba(255,255,255,0.7)" }}
    >
      {value}
    </span>
  </div>
);

const Settings = () => {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(() => {
    setLoading(true);
    setError(null);
    getSystemStatus()
      .then((s) => {
        setStatus(s);
        setLoading(false);
      })
      .catch((err: unknown) => {
        const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
        setError(typeof detail === "string" ? detail : "Backend unreachable.");
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, 15000);
    return () => clearInterval(id);
  }, [fetchStatus]);

  const h = status?.health ?? {};
  const sniffer = status?.sniffer ?? {};

  return (
    <PageShell title="Settings">
      <div className="flex items-center justify-between">
        <p className="text-sm -mt-4" style={{ color: "rgba(255,255,255,0.4)" }}>
          Operational status of the NIDS backend. Read-only — configure via environment variables on the server.
        </p>
        <button
          onClick={fetchStatus}
          disabled={loading}
          className="flex items-center gap-2 text-xs font-bold px-3 py-2 rounded-md transition-colors"
          style={{ background: "rgba(161,250,255,0.1)", color: "#a1faff", border: "1px solid rgba(161,250,255,0.2)" }}
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-2xl px-6 py-4 text-sm" style={{ background: "rgba(248,81,73,0.08)", border: "1px solid rgba(248,81,73,0.2)", color: "#f85149" }}>
          {error}
        </div>
      )}

      {!error && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Backend health */}
          <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(26,31,46,0.6)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <div className="px-5 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.03)" }}>
              <h2 className="text-sm font-bold" style={{ color: "#e8eafb" }}>Backend Health</h2>
            </div>
            <Row label="API" value={h.status ?? "unknown"} ok={h.status === "ok"} />
            <Row label="Database" value={h.db ?? "unknown"} ok={h.db === "ok"} />
            <Row label="Model" value={h.model ?? "unknown"} ok={h.model === "ok"} />
            <Row label="Sniffer" value={h.sniffer ?? "unknown"} ok={h.sniffer === "running"} />
            <Row label="WebSocket clients" value={String(h.ws_clients ?? 0)} />
            <Row label="Uptime" value={h.uptime_seconds != null ? `${Math.floor(h.uptime_seconds / 3600)}h ${Math.floor((h.uptime_seconds % 3600) / 60)}m` : "—"} />
          </div>

          {/* Model manifest */}
          <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(26,31,46,0.6)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <div className="px-5 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.03)" }}>
              <h2 className="text-sm font-bold" style={{ color: "#e8eafb" }}>Deployed Model</h2>
            </div>
            {status?.manifest ? (
              <>
                <Row label="Model type" value={String(status.manifest.model_type ?? "—")} />
                <Row label="Features" value={String(status.manifest.feature_count ?? "—")} />
                <Row label="Classes" value={String((status.manifest.classes as string[] | undefined)?.join(", ") ?? "—")} />
                <Row label="Feature source" value={String(status.manifest.feature_source ?? "—")} />
                <Row label="Manifest generated by" value={String(status.manifest.generated_by ?? "—")} />
              </>
            ) : (
              <div className="px-5 py-4 text-sm" style={{ color: "rgba(255,255,255,0.3)" }}>
                No manifest.json — run check.py in the backend to generate it.
              </div>
            )}
          </div>

          {/* Sniffer */}
          <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(26,31,46,0.6)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <div className="px-5 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.03)" }}>
              <h2 className="text-sm font-bold" style={{ color: "#e8eafb" }}>Packet Capture</h2>
            </div>
            {status?.sniffer ? (
              <>
                <Row label="Interface" value={String((sniffer.interface ?? "—") as string)} />
                <Row label="State" value={sniffer.running ? "running" : "stopped"} ok={Boolean(sniffer.running)} />
                <Row label="Packets seen" value={String(sniffer.total_packets ?? 0)} />
                <Row label="Flows tracked" value={String(sniffer.total_flows ?? 0)} />
                <Row label="API calls sent" value={String(sniffer.total_api_calls ?? 0)} />
                <Row label="Retries / dropped" value={`${sniffer.total_retries ?? 0} / ${sniffer.total_dropped ?? 0}`} />
                <Row label="Auto-start (NIDS_CAPTURE)" value={status.capture_auto_start ? "enabled" : "disabled"} ok={Boolean(status.capture_auto_start)} />
              </>
            ) : (
              <div className="px-5 py-4 text-sm" style={{ color: "rgba(255,255,255,0.3)" }}>
                Sniffer not initialized (Scapy/Npcap not installed). Prediction API and simulations still work.
              </div>
            )}
          </div>

          {/* Security */}
          <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(26,31,46,0.6)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <div className="px-5 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.03)" }}>
              <h2 className="text-sm font-bold" style={{ color: "#e8eafb" }}>Security & Limits</h2>
            </div>
            <Row label="Rate limit (req/min)" value={String(status?.rate_limit_per_minute ?? "—")} />
            <Row label="API key (NIDS_API_SECRET)" value={status?.api_secret_configured ? "configured" : "not set"} ok={Boolean(status?.api_secret_configured)} />
          </div>
        </div>
      )}
    </PageShell>
  );
};
export default Settings;