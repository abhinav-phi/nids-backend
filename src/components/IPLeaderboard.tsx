import { useState, useEffect } from "react";
import { getIPLeaderboard } from "@/api/client";

interface IPEntry {
  ip?: string;
  source_ip?: string;
  attack_count: number;
  last_seen: string;
  top_attack_type?: string;
}

const RANK_MEDAL = ["🥇", "🥈", "🥉"];
const RANK_COLOR = ["#e3b341", "#8b949e", "#cd7f32"];

const relativeTime = (ts: string) => {
  if (!ts) return "—";
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
};

const IPLeaderboard = () => {
  const [data, setData]       = useState<IPEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = () => {
      getIPLeaderboard()
        .then((d) => {
          setData(Array.isArray(d) ? d : d.leaderboard || []);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    };
    fetchData();
    const id = setInterval(fetchData, 30000);
    return () => clearInterval(id);
  }, []);

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
          Top Attacker IPs
        </span>
        {data.length > 0 && (
          <span
            className="text-[10px] font-mono-code px-2 py-0.5 rounded-full"
            style={{
              background: "rgba(248,81,73,0.1)",
              color: "#f85149",
              border: "1px solid rgba(248,81,73,0.2)",
            }}
          >
            {data.length} tracked
          </span>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-9 rounded-lg animate-pulse"
              style={{ background: "rgba(255,255,255,0.04)" }} />
          ))}
        </div>
      ) : data.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 gap-2"
          style={{ color: "rgba(255,255,255,0.2)" }}>
          <span className="text-2xl">🔍</span>
          <span className="text-sm">No attackers tracked yet</span>
        </div>
      ) : (
        <div className="space-y-1.5">
          {data.slice(0, 10).map((entry, i) => {
            const ip = entry.ip || entry.source_ip || "unknown";
            return (
              <div
                key={ip + i}
                className="flex items-center gap-3 px-3 py-2 rounded-lg transition-all hover:scale-[1.01]"
                style={{
                  background: i < 3
                    ? `${RANK_COLOR[i]}0a`
                    : "rgba(255,255,255,0.02)",
                  border: `1px solid ${i < 3 ? RANK_COLOR[i] + "20" : "rgba(255,255,255,0.05)"}`,
                }}
              >
                {/* Rank */}
                <div className="w-7 text-center shrink-0">
                  {i < 3 ? (
                    <span className="text-sm">{RANK_MEDAL[i]}</span>
                  ) : (
                    <span className="text-xs font-bold font-mono-code"
                      style={{ color: "rgba(255,255,255,0.25)" }}>
                      {i + 1}
                    </span>
                  )}
                </div>

                {/* IP */}
                <div className="flex-1 min-w-0">
                  <div className="font-mono-code text-xs font-medium truncate"
                    style={{ color: i < 3 ? RANK_COLOR[i] : "#e6edf3" }}>
                    {ip}
                  </div>
                  <div className="text-[10px] mt-0.5" style={{ color: "rgba(255,255,255,0.25)" }}>
                    {relativeTime(entry.last_seen)}
                  </div>
                </div>

                {/* Attack count */}
                <div className="text-right shrink-0">
                  <div className="text-sm font-bold" style={{ color: "#f85149" }}>
                    {entry.attack_count}
                  </div>
                  <div className="text-[10px]" style={{ color: "rgba(255,255,255,0.25)" }}>
                    attacks
                  </div>
                </div>

                {/* Badge */}
                {entry.top_attack_type && entry.top_attack_type !== "—" && (
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded shrink-0"
                    style={{
                      background: "rgba(248,81,73,0.1)",
                      color: "rgba(248,81,73,0.7)",
                      border: "1px solid rgba(248,81,73,0.15)",
                    }}
                  >
                    {entry.top_attack_type}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default IPLeaderboard;