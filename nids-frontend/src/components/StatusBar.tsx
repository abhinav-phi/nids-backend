import { useState, useEffect } from "react";
import { checkHealth } from "@/api/client";

interface Health {
  status: string;
  db: string;
  model: string;
  sniffer: string;
  uptime_seconds?: number;
  ws_clients?: number;
}

interface StatusBarProps {
  wsConnected: boolean;
}

const StatusBar = ({ wsConnected }: StatusBarProps) => {
  const [health, setHealth] = useState<Health | null>(null);
  const [online, setOnline] = useState(false);
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const check = () => {
      checkHealth()
        .then((h) => {
          setHealth(h);
          setOnline(true);
        })
        .catch(() => {
          setHealth(null);
          setOnline(false);
        });
    };
    check();
    const id = setInterval(check, 10000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const partOk = (v?: string) => !v || v === "ok";
  const modelOk  = partOk(health?.model);
  const dbOk     = partOk(health?.db);
  const snifferOk = !health || health.sniffer !== "error";

  return (
    <header
      className="sticky top-0 z-40 flex items-center justify-between px-8 py-4"
      style={{
        background: "rgba(10,14,25,0.92)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        borderBottom: "1px solid rgba(255,255,255,0.05)",
        boxShadow: "0 0 20px rgba(0,245,255,0.04)",
      }}
    >
      <div className="flex items-center gap-6 flex-wrap">
        <span className="lg:hidden font-bold text-xl" style={{ color: "#a1faff", fontFamily: "'Space Grotesk', sans-serif" }}>
          The Sentinel
        </span>
        <span className="hidden lg:block font-bold text-lg" style={{ color: "rgba(255,255,255,0.5)", fontFamily: "'Space Grotesk', sans-serif" }}>
          Dashboard
        </span>

        {/* Backend */}
        <span
          className="flex items-center gap-2 px-3 py-1 rounded-full"
          style={{
            background: online ? "rgba(161,250,255,0.08)" : "rgba(248,81,73,0.08)",
            border: `1px solid ${online ? "rgba(161,250,255,0.2)" : "rgba(248,81,73,0.2)"}`,
          }}
        >
          <span
            className={`w-2 h-2 rounded-full ${online ? "animate-blink-dot" : ""}`}
            style={{ backgroundColor: online ? "#a1faff" : "#f85149" }}
          />
          <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: online ? "#a1faff" : "#f85149" }}>
            {online ? "System Active" : "Offline"}
          </span>
        </span>

        {/* Model */}
        <span
          className="flex items-center gap-1.5 px-3 py-1 rounded-full"
          style={{
            background: modelOk ? "rgba(161,250,255,0.06)" : "rgba(248,81,73,0.08)",
            border: `1px solid ${modelOk ? "rgba(161,250,255,0.15)" : "rgba(248,81,73,0.2)"}`,
          }}
        >
          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: modelOk ? "#a1faff" : "#f85149" }} />
          <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: modelOk ? "rgba(161,250,255,0.7)" : "#f85149" }}>
            Model {modelOk ? (health?.model || "OK") : (health?.model || "Unknown")}
          </span>
        </span>

        {/* DB */}
        <span
          className="flex items-center gap-1.5 px-3 py-1 rounded-full"
          style={{
            background: dbOk ? "rgba(161,250,255,0.06)" : "rgba(248,81,73,0.08)",
            border: `1px solid ${dbOk ? "rgba(161,250,255,0.15)" : "rgba(248,81,73,0.2)"}`,
          }}
        >
          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: dbOk ? "#a1faff" : "#f85149" }} />
          <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: dbOk ? "rgba(161,250,255,0.7)" : "#f85149" }}>
            DB {dbOk ? "OK" : "Error"}
          </span>
        </span>

        {/* Sniffer */}
        {health?.sniffer && (
          <span
            className="flex items-center gap-1.5 px-3 py-1 rounded-full"
            style={{
              background: snifferOk ? "rgba(161,250,255,0.06)" : "rgba(248,81,73,0.08)",
              border: `1px solid ${snifferOk ? "rgba(161,250,255,0.15)" : "rgba(248,81,73,0.2)"}`,
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: snifferOk ? "#a1faff" : "#f85149" }} />
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: snifferOk ? "rgba(161,250,255,0.7)" : "#f85149" }}>
              Sniffer {health.sniffer}
            </span>
          </span>
        )}

        {/* WebSocket */}
        {!wsConnected && (
          <span className="text-xs flex items-center gap-1.5 animate-pulse" style={{ color: "#e3b341" }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "#e3b341" }} />
            WebSocket reconnecting...
          </span>
        )}
        {wsConnected && (
          <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "rgba(161,250,255,0.45)" }}>
            Live
          </span>
        )}
      </div>

      <div className="flex items-center gap-6">
        <div className="hidden xl:flex flex-col items-end">
          <span className="text-[10px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.3)" }}>
            Local Time
          </span>
          <span className="text-sm font-bold font-mono-code" style={{ color: "#a1faff" }}>
            {time.toLocaleTimeString("en-US", { hour12: false })}
          </span>
        </div>
        <span className="xl:hidden font-mono-code text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>
          {time.toLocaleTimeString()}
        </span>
        {health?.uptime_seconds != null && (
          <span className="text-[10px] font-bold uppercase tracking-widest hidden md:block" style={{ color: "rgba(255,255,255,0.25)" }}>
            Up {Math.floor(health.uptime_seconds / 3600)}h {(Math.floor(health.uptime_seconds % 3600 / 60))}m
          </span>
        )}
      </div>
    </header>
  );
};
export default StatusBar;