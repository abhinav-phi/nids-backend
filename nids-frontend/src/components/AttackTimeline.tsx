import { useEffect, useMemo, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, LabelList,
} from "recharts";
import { getAlerts } from "@/api/client";
import { httpErrorDetail } from "@/components/AlertFeed";

interface TimelineAlert {
  timestamp: string;
  severity?: string;
}

const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: "#ff716c",
  HIGH:     "#699cff",
  MEDIUM:   "#ac8aff",
  LOW:      "rgba(255,255,255,0.2)",
};
const SEVERITY_RANK: Record<string, number> = {
  CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1,
};

export const bucketByHour = (alerts: TimelineAlert[], now = new Date()) => {
  const buckets: { hour: string; count: number; maxSeverity: string }[] = [];
  for (let i = 11; i >= 0; i--) {
    const h = new Date(now.getTime() - i * 3600000);
    const label = h.toLocaleTimeString("en-US", { hour: "2-digit", hour12: false });
    const start = new Date(h);
    start.setMinutes(0, 0, 0);
    const end = new Date(start.getTime() + 3600000);
    let count = 0;
    let maxSev = "LOW";
    for (const a of alerts) {
      const d = new Date(a.timestamp);
      if (isNaN(d.getTime())) continue;
      if (d >= start && d < end && now.getTime() - d.getTime() < 12 * 3600000) {
        count += 1;
        const sev = (a.severity || "LOW").toUpperCase();
        if ((SEVERITY_RANK[sev] || 0) > (SEVERITY_RANK[maxSev] || 0)) maxSev = sev;
      }
    }
    buckets.push({ hour: label, count, maxSeverity: maxSev });
  }
  return buckets;
};

const AttackTimeline = () => {
  const [alerts, setAlerts] = useState<TimelineAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = () => {
      getAlerts({ limit: 500, exclude_benign: true })
        .then((data) => {
          setAlerts(Array.isArray(data) ? data : data.alerts || []);
          setError(null);
        })
        .catch((err: unknown) => {
          setError(httpErrorDetail(err, "Could not load alerts."));
        })
        .finally(() => setLoading(false));
    };
    fetchData();
    const id = setInterval(fetchData, 30000);
    return () => clearInterval(id);
  }, []);

  const data = useMemo(() => bucketByHour(alerts), [alerts]);
  const total = data.reduce((s, d) => s + d.count, 0);
  const hasAny = total > 0;

  return (
    <div
      className="rounded-2xl p-8"
      style={{
        background: "rgba(26,31,46,0.6)",
        backdropFilter: "blur(12px)",
        border: "1px solid rgba(255,255,255,0.06)",
        boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
      }}
    >
      <div className="flex items-start justify-between mb-8 flex-wrap gap-4">
        <div>
          <h2
            className="text-xl font-bold"
            style={{ color: "#e8eafb", fontFamily: "'Space Grotesk', sans-serif" }}
          >
            12-Hour Intrusion Timeline
          </h2>
          <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.4)" }}>
            Detected attack alerts grouped into hourly buckets
            {total > 0 && ` — ${total} alerts in the last 12 hours`}
          </p>
        </div>
      </div>

      {error && (
        <div className="text-sm py-10 text-center" style={{ color: "#f85149" }}>
          {error}
        </div>
      )}
      {!error && loading && (
        <div className="h-52 rounded-xl animate-pulse" style={{ background: "rgba(255,255,255,0.04)" }} />
      )}
      {!error && !loading && !hasAny && (
        <div
          className="flex items-center justify-center h-52 rounded-xl"
          style={{ background: "rgba(255,255,255,0.02)", border: "1px dashed rgba(255,255,255,0.06)" }}
        >
          <span className="text-sm" style={{ color: "rgba(255,255,255,0.3)" }}>
            No attack alerts in the last 12 hours.
          </span>
        </div>
      )}
      {!error && !loading && hasAny && (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data} barCategoryGap="20%">
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis
              dataKey="hour"
              tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }}
              axisLine={false} tickLine={false}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }}
              axisLine={false} tickLine={false}
            />
            <Tooltip
              contentStyle={{
                background: "rgba(10,14,25,0.95)",
                border: "1px solid rgba(161,250,255,0.2)",
                borderRadius: "8px",
                color: "#e8eafb",
                fontSize: 12,
              }}
              cursor={{ fill: "rgba(255,255,255,0.03)" }}
            />
            <Bar dataKey="count" radius={[4, 4, 0, 0]} name="Alerts" isAnimationActive={false}>
              {data.map((entry, i) => (
                <Cell
                  key={i}
                  fill={SEVERITY_COLORS[entry.maxSeverity] || "rgba(255,255,255,0.2)"}
                  fillOpacity={0.85}
                />
              ))}
              <LabelList dataKey="count" position="top" fill="rgba(255,255,255,0.5)" fontSize={10} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
};
export default AttackTimeline;