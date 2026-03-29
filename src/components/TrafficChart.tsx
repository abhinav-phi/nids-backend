import { useMemo, useState, useEffect, useRef } from "react";
import {
  AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import type { Alert } from "@/hooks/useWebSocket";
import { getStats } from "@/api/client";

interface Props {
  alertHistory: Alert[];
}

interface DataPoint {
  time: string;
  alerts: number;
  flows: number;
}

const TrafficChart = ({ alertHistory }: Props) => {
  const [flowHistory, setFlowHistory] = useState<{ time: string; flows: number }[]>([]);
  const prevFlows = useRef(0);

  // Poll stats every 5s to track total_flows over time
  useEffect(() => {
    const tick = () => {
      getStats()
        .then((data) => {
          const newFlows = (data.total_flows || 0) - prevFlows.current;
          prevFlows.current = data.total_flows || 0;
          const time = new Date().toLocaleTimeString("en-US", { hour12: false });
          setFlowHistory((prev) => [...prev, { time, flows: Math.max(0, newFlows) }].slice(-60));
        })
        .catch(() => {});
    };
    tick();
    const id = setInterval(tick, 5000);
    return () => clearInterval(id);
  }, []);

  // Count alerts per second from alertHistory
  const alertBuckets = useMemo(() => {
    const buckets: Record<string, number> = {};
    alertHistory.forEach((a) => {
      const key = new Date(a.timestamp).toLocaleTimeString("en-US", { hour12: false });
      buckets[key] = (buckets[key] || 0) + 1;
    });
    return buckets;
  }, [alertHistory]);

  // Merge flows + alerts into one dataset
  const data: DataPoint[] = useMemo(() => {
    return flowHistory.map((f) => ({
      time:   f.time,
      flows:  f.flows,
      alerts: alertBuckets[f.time] || 0,
    }));
  }, [flowHistory, alertBuckets]);

  return (
    <div className="bg-card border border-border rounded-lg p-4 h-full">
      <h3 className="text-sm font-semibold text-foreground mb-3">Live Traffic Activity</h3>
      {data.length === 0 ? (
        <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
          No data yet — waiting for traffic...
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={data}>
            <defs>
              <linearGradient id="blueGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#58a6ff" stopOpacity={0.4} />
                <stop offset="100%" stopColor="#58a6ff" stopOpacity={0.05} />
              </linearGradient>
              <linearGradient id="redGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f85149" stopOpacity={0.4} />
                <stop offset="100%" stopColor="#f85149" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#30363d" />
            <XAxis dataKey="time" tick={{ fill: "#8b949e", fontSize: 10 }} />
            <YAxis tick={{ fill: "#8b949e", fontSize: 10 }} />
            <Tooltip
              contentStyle={{
                backgroundColor: "#161b22",
                border: "1px solid #30363d",
                color: "#fff",
                fontSize: 12,
              }}
            />
            <Legend wrapperStyle={{ fontSize: 11, color: "#8b949e" }} />
            <Area
              type="monotone" dataKey="flows"
              name="Flows/5s"
              stroke="#58a6ff" fill="url(#blueGrad)"
            />
            <Area
              type="monotone" dataKey="alerts"
              name="Attacks"
              stroke="#f85149" fill="url(#redGrad)"
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
};

export default TrafficChart;
