import { useState, useEffect, useRef } from "react";
import { getStats } from "@/api/client";
import { Activity, AlertTriangle, Clock, Shield } from "lucide-react";

interface Stats {
  total_flows: number;
  total_attacks: number;
  uptime_seconds: number;
  benign_count: number;
}

const formatUptime = (s: number) => {
  const h   = Math.floor(s / 3600).toString().padStart(2, "0");
  const m   = Math.floor((s % 3600) / 60).toString().padStart(2, "0");
  const sec = Math.floor(s % 60).toString().padStart(2, "0");
  return `${h}:${m}:${sec}`;
};

const CARD_STYLES = [
  {
    label: "Flows Analyzed",
    icon: Activity,
    accent: "#58a6ff",
    bg: "rgba(56,139,253,0.07)",
    border: "rgba(56,139,253,0.2)",
    glow: "rgba(56,139,253,0.08)",
  },
  {
    label: "Attacks Detected",
    icon: AlertTriangle,
    accent: "#f85149",
    bg: "rgba(248,81,73,0.07)",
    border: "rgba(248,81,73,0.2)",
    glow: "rgba(248,81,73,0.08)",
  },
  {
    label: "System Uptime",
    icon: Clock,
    accent: "#e3b341",
    bg: "rgba(227,179,65,0.07)",
    border: "rgba(227,179,65,0.2)",
    glow: "rgba(227,179,65,0.08)",
  },
  {
    label: "Benign Traffic",
    icon: Shield,
    accent: "#3fb950",
    bg: "rgba(63,185,80,0.07)",
    border: "rgba(63,185,80,0.2)",
    glow: "rgba(63,185,80,0.08)",
  },
];

const KPICards = () => {
  const [stats, setStats]   = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [flash, setFlash]   = useState(false);
  const prevRef             = useRef<Stats | null>(null);

  useEffect(() => {
    const fetchData = () => {
      getStats()
        .then((data) => {
          if (prevRef.current && JSON.stringify(data) !== JSON.stringify(prevRef.current)) {
            setFlash(true);
            setTimeout(() => setFlash(false), 400);
          }
          prevRef.current = data;
          setStats(data);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    };
    fetchData();
    const id = setInterval(fetchData, 10000);
    return () => clearInterval(id);
  }, []);

  const values = stats
    ? [
        stats.total_flows.toLocaleString(),
        stats.total_attacks.toLocaleString(),
        formatUptime(stats.uptime_seconds),
        stats.benign_count.toLocaleString(),
      ]
    : ["—", "—", "—:—:—", "—"];

  if (loading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="rounded-xl border animate-pulse h-24"
            style={{ background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.06)" }} />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {CARD_STYLES.map((c, i) => {
        const Icon = c.icon;
        return (
          <div
            key={c.label}
            className="rounded-xl border p-4 flex items-center gap-3 transition-all duration-200 hover:scale-[1.02]"
            style={{
              background: c.bg,
              borderColor: c.border,
              boxShadow: `0 0 20px ${c.glow}, 0 4px 16px rgba(0,0,0,0.2)`,
            }}
          >
            {/* Icon box */}
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
              style={{
                background: `${c.accent}18`,
                border: `1px solid ${c.accent}35`,
              }}
            >
              <Icon size={18} style={{ color: c.accent }} />
            </div>

            {/* Text */}
            <div className="min-w-0">
              <div
                className={`text-2xl font-bold leading-none mb-1 ${flash ? "animate-pulse-number" : ""}`}
                style={{ color: "#e6edf3" }}
              >
                {values[i]}
              </div>
              <div className="text-[11px] font-medium truncate" style={{ color: "rgba(255,255,255,0.35)" }}>
                {c.label}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default KPICards;