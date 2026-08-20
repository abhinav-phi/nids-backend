import { useEffect, useMemo, useState } from "react";
import PageShell from "@/components/PageShell";
import { SEV_STYLES } from "@/components/AlertFeed";
import { getAlerts } from "@/api/client";
import { httpErrorDetail } from "@/components/AlertFeed";

interface FlowEdge {
  src: string;
  dst: string;
  count: number;
  attacks: Set<string>;
  maxSeverity: string;
}

const NetworkActivity = () => {
  const [alerts, setAlerts] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAlerts({ limit: 500, exclude_benign: true })
      .then((data) => {
        setAlerts(Array.isArray(data) ? data : []);
        setError(null);
      })
      .catch((err: unknown) => setError(httpErrorDetail(err, "Could not load alert data.")))
      .finally(() => setLoading(false));
  }, []);

  const edges = useMemo<FlowEdge[]>(() => {
    const map = new Map<string, FlowEdge>();
    for (const a of alerts) {
      const src = String(a.source_ip ?? "unknown");
      const dst = String(a.destination_ip ?? "unknown");
      const key = `${src}->${dst}`;
      let edge = map.get(key);
      if (!edge) {
        edge = { src, dst, count: 0, attacks: new Set(), maxSeverity: "LOW" };
        map.set(key, edge);
      }
      edge.count += 1;
      if (a.prediction) edge.attacks.add(String(a.prediction));
      const sev = String(a.severity ?? "LOW").toUpperCase();
      const rank: Record<string, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
      if ((rank[sev] ?? 0) > (rank[edge.maxSeverity] ?? 0)) edge.maxSeverity = sev;
    }
    return [...map.values()].sort((x, y) => y.count - x.count);
  }, [alerts]);

  const maxCount = edges.length ? edges[0].count : 1;

  return (
    <PageShell title="Network Activity">
      <p className="text-sm -mt-4" style={{ color: "rgba(255,255,255,0.4)" }}>
        Attack flows between source and destination addresses from the latest 500 alerts.
      </p>
      {error && (
        <div className="text-sm py-10 text-center rounded-2xl border" style={{ color: "#f85149", borderColor: "rgba(248,81,73,0.2)" }}>
          {error}
        </div>
      )}
      {!error && loading && (
        <div className="h-64 rounded-2xl animate-pulse" style={{ background: "rgba(255,255,255,0.03)" }} />
      )}
      {!error && !loading && edges.length === 0 && (
        <div
          className="flex items-center justify-center h-64 rounded-2xl"
          style={{ background: "rgba(255,255,255,0.02)", border: "1px dashed rgba(255,255,255,0.06)" }}
        >
          <span className="text-sm" style={{ color: "rgba(255,255,255,0.3)" }}>
            No attack flows recorded yet.
          </span>
        </div>
      )}
      {!error && !loading && edges.length > 0 && (
        <div
          className="rounded-2xl overflow-hidden"
          style={{ background: "rgba(26,31,46,0.6)", border: "1px solid rgba(255,255,255,0.06)" }}
        >
          <table className="w-full text-left border-collapse">
            <thead style={{ background: "rgba(255,255,255,0.03)" }}>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                {["Source", "Destination", "Flows", "Relative Volume", "Attack Types", "Max Severity"].map((h, idx) => (
                  <th
                    key={h}
                    className="py-4 text-[10px] font-bold uppercase tracking-widest px-6"
                    style={{ color: "rgba(255,255,255,0.3)" }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {edges.slice(0, 100).map((e, i) => {
                const sevStyle = SEV_STYLES[e.maxSeverity] || SEV_STYLES.LOW;
                return (
                  <tr
                    key={`${e.src}->${e.dst}`}
                    style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)" }}
                  >
                    <td className="py-3 px-6 font-mono-code text-sm" style={{ color: "#a1faff" }}>{e.src}</td>
                    <td className="py-3 px-6 font-mono-code text-xs" style={{ color: "rgba(255,255,255,0.5)" }}>{e.dst}</td>
                    <td className="py-3 px-6 text-sm font-bold" style={{ color: "#e8eafb" }}>{e.count}</td>
                    <td className="py-3 px-6">
                      <div
                        className="h-1.5 rounded-full"
                        style={{
                          width: `${Math.max(4, (e.count / maxCount) * 100)}%`,
                          background: "rgba(161,250,255,0.6)",
                          maxWidth: 160,
                        }}
                      />
                    </td>
                    <td className="py-3 px-6 text-xs" style={{ color: "rgba(255,255,255,0.55)" }}>
                      {[...e.attacks].join(", ")}
                    </td>
                    <td className="py-3 px-6">
                      <span
                        className="px-2.5 py-0.5 rounded text-[10px] font-black uppercase"
                        style={{ background: sevStyle.bg, color: sevStyle.color, border: `1px solid ${sevStyle.border}` }}
                      >
                        {sevStyle.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </PageShell>
  );
};
export default NetworkActivity;