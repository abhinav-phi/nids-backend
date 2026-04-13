import { useState, useEffect } from "react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { getStats } from "@/api/client";

const COLORS = [
  "#4dd9e0", // Bots
  "#5b8ff9", // Brute Force
  "#b37feb", // DDoS
  "#f76560", // DoS
  "#3fb950", // Normal Traffic
  "#e8c33a", // Port Scanning
  "#8c8c8c", // Web Attacks
];

const RADIAN = Math.PI / 180;

const renderCustomLabel = ({
  cx,
  cy,
  midAngle,
  outerRadius,
  percent,
}: any) => {
  if (percent < 0.01) return null;

  const ELBOW_START = outerRadius + 10;
  const ELBOW_END = outerRadius + 28;

  const sx = cx + ELBOW_START * Math.cos(-midAngle * RADIAN);
  const sy = cy + ELBOW_START * Math.sin(-midAngle * RADIAN);
  const ex = cx + ELBOW_END * Math.cos(-midAngle * RADIAN);
  const ey = cy + ELBOW_END * Math.sin(-midAngle * RADIAN);

  const isRight = ex >= cx;
  const textX = ex + (isRight ? 5 : -5);
  const anchor = isRight ? "start" : "end";

  return (
    <g>
      <line
        x1={sx}
        y1={sy}
        x2={ex}
        y2={ey}
        stroke="rgba(255,255,255,0.4)"
        strokeWidth={1}
      />
      <text
        x={textX}
        y={ey}
        textAnchor={anchor}
        dominantBaseline="central"
        fill="rgba(255,255,255,0.9)"
        fontSize={10}
        fontWeight={600}
      >
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    </g>
  );
};

/* ── Custom Tooltip — fully white text, no browser default black ── */
const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload || !payload.length) return null;
  const item = payload[0];
  const total: number = item?.payload?.total ?? 0;

  return (
    <div
      style={{
        background: "rgba(15,18,30,0.97)",
        border: `1px solid ${item.payload.fill}55`,
        borderRadius: "10px",
        padding: "8px 14px",
        color: "#ffffff",
        fontSize: "13px",
        fontWeight: 500,
        boxShadow: "0 4px 20px rgba(0,0,0,0.6)",
        pointerEvents: "none",
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ color: item.payload.fill, fontWeight: 700 }}>
        {item.name}
      </span>
      <span style={{ color: "#ffffff", marginLeft: 6 }}>
        : {item.value}
      </span>
      {total > 0 && (
        <span style={{ color: "rgba(255,255,255,0.5)", marginLeft: 4 }}>
          ({((item.value / total) * 100).toFixed(1)}%)
        </span>
      )}
    </div>
  );
};

/* ── Main Component ── */
const AttackPieChart = () => {
  const [data, setData] = useState<
    { name: string; value: number; fill: string; total: number }[]
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = () => {
      getStats()
        .then((s) => {
          if (s.attacks_by_type) {
            const entries = Object.entries(s.attacks_by_type).map(
              ([name, value], i) => ({
                name,
                value: value as number,
                fill: COLORS[i % COLORS.length],
                total: 0, // will patch below
              })
            );
            const total = entries.reduce((acc, e) => acc + e.value, 0);
            setData(entries.map((e) => ({ ...e, total })));
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
      className="rounded-2xl p-5 flex flex-col h-full"
      style={{
        background: "rgba(26,31,46,0.6)",
        backdropFilter: "blur(12px)",
        border: "1px solid rgba(255,255,255,0.06)",
        boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
      }}
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xl font-bold text-[#e8eafb]">
          Threat Distribution
        </h2>
        {total > 0 && (
          <span className="text-xs font-bold px-3 py-1 rounded-full border border-cyan-300/30 text-cyan-200 bg-cyan-300/10">
            {total} total
          </span>
        )}
      </div>

      {/* ── Body ── */}
      {loading ? (
        <div className="flex-1 animate-pulse bg-white/5 rounded-xl" />
      ) : (
        <div className="flex items-center gap-2 flex-1 min-h-0">

          {/* Donut — smaller radii, generous margin so labels don't clip */}
          <div className="flex-1 h-full" style={{ minHeight: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart margin={{ top: 32, right: 48, bottom: 32, left: 48 }}>
                <Pie
                  data={data}
                  dataKey="value"
                  cx="50%"
                  cy="50%"
                  innerRadius={70}
                  outerRadius={96}
                  paddingAngle={2}
                  startAngle={90}
                  endAngle={-270}
                  labelLine={false}
                  label={renderCustomLabel}
                >
                  {data.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={COLORS[i % COLORS.length]}
                      stroke="rgba(0,0,0,0.5)"
                      strokeWidth={1.5}
                    />
                  ))}
                </Pie>

                {/* Center total */}
                <text
                  x="50%"
                  y="45%"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="#e8eafb"
                  fontSize={30}
                  fontWeight="700"
                >
                  {total}
                </text>
                <text
                  x="50%"
                  y="58%"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="rgba(255,255,255,0.4)"
                  fontSize={11}
                >
                  Active Alerts
                </text>

                {/* Custom tooltip so text is always white */}
                <Tooltip
                  content={<CustomTooltip />}
                  cursor={false}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Legend */}
          <div className="flex flex-col gap-[9px] pr-1 shrink-0">
            {data.map((d, i) => (
              <div key={d.name} className="flex items-center gap-2">
                <div
                  className="shrink-0"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: COLORS[i % COLORS.length],
                  }}
                />
                <span className="text-xs text-white/75 whitespace-nowrap">
                  {d.name}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default AttackPieChart;