import { useState, useEffect, useRef } from "react";
import type { Alert } from "@/hooks/useWebSocket";
import SHAPExplainer from "./SHAPExplainer";

interface Props {
  alertHistory: Alert[];
}

const SEV_COLOR: Record<string, string> = {
  CRITICAL: "#f85149",
  HIGH:     "#e3b341",
  MEDIUM:   "#3fb950",
  LOW:      "#8b949e",
  NONE:     "#8b949e",
};

const SEV_BG: Record<string, string> = {
  CRITICAL: "rgba(248,81,73,0.08)",
  HIGH:     "rgba(227,179,65,0.08)",
  MEDIUM:   "rgba(63,185,80,0.08)",
  LOW:      "rgba(139,148,158,0.05)",
  NONE:     "transparent",
};

const AlertFeed = ({ alertHistory }: Props) => {
  const [selected, setSelected] = useState<Alert | null>(null);
  const [newIds, setNewIds]      = useState<Set<string>>(new Set());
  const prevLenRef               = useRef(0);
  const alerts                   = alertHistory.slice(0, 50);

  useEffect(() => {
    if (alertHistory.length > prevLenRef.current) {
      const fresh = alertHistory.slice(0, alertHistory.length - prevLenRef.current);
      const ids   = new Set(fresh.map((a) => a.timestamp + a.src_ip));
      setNewIds(ids);
      const t = setTimeout(() => setNewIds(new Set()), 600);
      prevLenRef.current = alertHistory.length;
      return () => clearTimeout(t);
    }
  }, [alertHistory]);

  return (
    <div
      className="rounded-xl border flex flex-col h-full"
      style={{
        background: "rgba(15,18,30,0.7)",
        borderColor: "rgba(56,139,253,0.12)",
        boxShadow: "0 4px 24px rgba(0,0,0,0.25)",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 shrink-0"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <div className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full animate-blink-dot"
            style={{ backgroundColor: alerts.length > 0 ? "#f85149" : "#3fb950" }}
          />
          <span className="text-sm font-semibold" style={{ color: "#e6edf3" }}>
            Live Alert Feed
          </span>
        </div>
        {alerts.length > 0 && (
          <span
            className="text-[10px] font-mono-code px-2 py-0.5 rounded-full"
            style={{
              background: "rgba(248,81,73,0.12)",
              color: "#f85149",
              border: "1px solid rgba(248,81,73,0.2)",
            }}
          >
            {alerts.length} alerts
          </span>
        )}
      </div>

      {/* Body */}
      {alerts.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2"
          style={{ color: "rgba(255,255,255,0.2)" }}>
          <span className="text-2xl">🛡️</span>
          <span className="text-sm">No alerts yet</span>
        </div>
      ) : (
        <div className="overflow-auto flex-1" style={{ maxHeight: 420 }}>
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0" style={{ background: "rgba(10,12,20,0.95)" }}>
              <tr style={{ color: "rgba(255,255,255,0.3)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                {["Time", "Source IP", "Attack", "Severity", "Conf"].map(h => (
                  <th key={h} className="text-left py-2 px-3 font-medium text-[11px]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {alerts.map((alert, i) => {
                const sev   = (alert.severity || "LOW").toUpperCase();
                const id    = alert.timestamp + alert.src_ip;
                const isNew = newIds.has(id);
                const isSelected = selected === alert;
                return (
                  <>
                    <tr
                      key={i}
                      onClick={() => setSelected(isSelected ? null : alert)}
                      className={`cursor-pointer transition-all duration-150 ${isNew ? "animate-flash-new" : ""}`}
                      style={{
                        backgroundColor: isSelected
                          ? `${SEV_COLOR[sev]}22`
                          : isNew ? undefined : SEV_BG[sev],
                        borderLeft: isSelected ? `2px solid ${SEV_COLOR[sev]}` : "2px solid transparent",
                      }}
                    >
                      <td className="py-2 px-3 font-mono-code" style={{ color: "rgba(255,255,255,0.35)" }}>
                        {new Date(alert.timestamp).toLocaleTimeString()}
                      </td>
                      <td className="py-2 px-3 font-mono-code" style={{ color: "#e6edf3" }}>
                        {alert.src_ip}
                      </td>
                      <td className="py-2 px-3 font-medium" style={{ color: "#e6edf3" }}>
                        {alert.attack_type}
                      </td>
                      <td className="py-2 px-3">
                        <span
                          className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide"
                          style={{
                            backgroundColor: `${SEV_COLOR[sev]}18`,
                            color: SEV_COLOR[sev],
                            border: `1px solid ${SEV_COLOR[sev]}35`,
                          }}
                        >
                          {sev}
                        </span>
                      </td>
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-1.5">
                          <div
                            className="w-10 h-1 rounded-full overflow-hidden"
                            style={{ background: "rgba(255,255,255,0.08)" }}
                          >
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${alert.confidence * 100}%`,
                                backgroundColor: SEV_COLOR[sev],
                              }}
                            />
                          </div>
                          <span style={{ color: "rgba(255,255,255,0.4)" }}>
                            {(alert.confidence * 100).toFixed(0)}%
                          </span>
                        </div>
                      </td>
                    </tr>
                    {isSelected && (
                      <tr key={`shap-${i}`}>
                        <td colSpan={5} className="px-3 pb-2">
                          <SHAPExplainer alert={alert} onClose={() => setSelected(null)} />
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AlertFeed;