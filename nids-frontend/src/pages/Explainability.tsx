import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import PageShell from "@/components/PageShell";
import SHAPExplainer from "@/components/SHAPExplainer";
import type { Alert } from "@/hooks/useWebSocket";
import { getAlerts } from "@/api/client";

const Explainability = () => {
  const [params] = useSearchParams();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    getAlerts({ limit: 200, exclude_benign: true })
      .then((data) => {
        setAlerts(Array.isArray(data) ? data : []);
        setError(null);
      })
      .catch((err: unknown) => {
        const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
        setError(typeof detail === "string" ? detail : "Could not load alerts.");
      })
      .finally(() => setLoading(false));
  }, []);

  const selected = useMemo(() => {
    const src = params.get("src");
    const t = params.get("t");
    if (src && t) {
      const direct = alerts.find((a) => a.src_ip === src && a.timestamp === t);
      if (direct) return direct;
    }
    return alerts[selectedIndex] ?? null;
  }, [alerts, params, selectedIndex]);

  return (
    <PageShell title="AI Explainability">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div
          className="rounded-2xl p-5 lg:col-span-1"
          style={{ background: "rgba(26,31,46,0.6)", border: "1px solid rgba(255,255,255,0.06)" }}
        >
          <h2 className="text-sm font-bold mb-3 uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.4)" }}>
            Select an alert
          </h2>
          {loading && (
            <div className="space-y-2">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-10 rounded-md animate-pulse" style={{ background: "rgba(255,255,255,0.04)" }} />
              ))}
            </div>
          )}
          {error && <p className="text-xs" style={{ color: "#f85149" }}>{error}</p>}
          {!loading && !error && alerts.length === 0 && (
            <p className="text-sm" style={{ color: "rgba(255,255,255,0.3)" }}>
              No alerts available for explanation.
            </p>
          )}
          {!loading && !error && alerts.length > 0 && (
            <div className="space-y-1 max-h-[60vh] overflow-y-auto">
              {alerts.slice(0, 100).map((a, i) => (
                <button
                  key={`${a.id ?? ""}${i}`}
                  onClick={() => {
                    setSelectedIndex(i);
                    window.history.replaceState(null, "", "/explain");
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg transition-colors"
                  style={{
                    background: i === selectedIndex ? "rgba(161,250,255,0.08)" : "transparent",
                    border: i === selectedIndex ? "1px solid rgba(161,250,255,0.2)" : "1px solid transparent",
                  }}
                >
                  <span className="block font-mono-code text-xs truncate" style={{ color: "#a1faff" }}>
                    {a.src_ip}
                  </span>
                  <span className="block text-[10px] mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>
                    {new Date(a.timestamp).toLocaleString()} — {a.attack_type}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-3">
          {selected ? (
            <SHAPExplainer alert={selected} onClose={() => {}} />
          ) : (
            <div
              className="rounded-2xl flex items-center justify-center min-h-[40vh]"
              style={{ background: "rgba(255,255,255,0.02)", border: "1px dashed rgba(255,255,255,0.06)" }}
            >
              <p className="text-sm" style={{ color: "rgba(255,255,255,0.3)" }}>
                Select an alert from the list to view its SHAP explanation.
              </p>
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
};
export default Explainability;