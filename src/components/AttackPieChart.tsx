import { useState, useEffect } from "react";
import { PieChart, Pie, Cell, Legend, Tooltip, ResponsiveContainer } from "recharts";
import { getStats } from "@/api/client";

const COLORS = ["#58a6ff", "#f85149", "#e3b341", "#3fb950", "#bc8cff", "#f778ba", "#8b949e"];

const AttackPieChart = () => {
  const [data, setData]       = useState<{ name: string; value: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = () => {
      getStats()
        .then((s) => {
          if (s.attacks_by_type) {
            setData(
              Object.entries(s.attacks_by_type).map(([name, value]) => ({
                name,
                value: value as number,
              }))
            );
          }
          setLoading(false);
        })
        .catch(() => setLoading(false));
    };
    fetchData();
    const id = setInterval(fetchData, 15000);
    return () => clearInterval(id);
  }, []);

  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <div
      className="rounded-xl border p-4 h-full"
      style={{
        background: "rgba(15,18,30,0.7)",
        borderColor: "rgba(56,139,253,0.12)",
        boxShadow: "0 4px 24px rgba(0,0,0,0.25)",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold" style={{ color: "#e6edf3" }}>
          Attack Type Distribution
        </span>
        {total > 0 && (
          <span
            className="text-[10px] font-mono-code px-2 py-0.5 rounded-full"
            style={{
              background: "rgba(56,139,253,0.1)",
              color: "#58a6ff",
              border: "1px solid rgba(56,139,253,0.2)",
            }}
          >
            {total} total
          </span>
        )}
      </div>

      {loading ? (
        <div className="h-48 rounded-lg animate-pulse" style={{ background: "rgba(255,255,255,0.04)" }} />
      ) : data.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 gap-2"
          style={{ color: "rgba(255,255,255,0.2)" }}>
          <span className="text-2xl">📊</span>
          <span className="text-sm">No data yet</span>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <PieChart>
            <Pie
              data={data}
              cx="40%"
              cy="50%"
              innerRadius={55}
              outerRadius={85}
              paddingAngle={3}
              dataKey="value"
              label={false}
            >
              {data.map((_, i) => (
                <Cell
                  key={i}
                  fill={COLORS[i % COLORS.length]}
                  stroke="rgba(0,0,0,0.3)"
                  strokeWidth={1}
                />
              ))}
            </Pie>

            {/* Center label */}
            <text x="40%" y="48%" textAnchor="middle" dominantBaseline="middle"
              fill="#e6edf3" fontSize={22} fontWeight="700">
              {total}
            </text>
            <text x="40%" y="60%" textAnchor="middle" dominantBaseline="middle"
              fill="rgba(255,255,255,0.3)" fontSize={10}>
              detected
            </text>

            <Tooltip
              contentStyle={{
                backgroundColor: "#0d1117",
                border: "1px solid rgba(56,139,253,0.2)",
                borderRadius: "8px",
                color: "#e6edf3",
                fontSize: 12,
              }}
            />
            <Legend
              layout="vertical"
              align="right"
              verticalAlign="middle"
              formatter={(value) => (
                <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 11 }}>{value}</span>
              )}
            />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  );
};

export default AttackPieChart;