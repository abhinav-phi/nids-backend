import { useState, useEffect } from "react";
import { checkHealth } from "@/api/client";

interface StatusBarProps {
  wsConnected: boolean;
}

const StatusBar = ({ wsConnected }: StatusBarProps) => {
  const [online, setOnline] = useState(false);
  const [time, setTime]     = useState(new Date());

  useEffect(() => {
    const check = () => {
      checkHealth().then(() => setOnline(true)).catch(() => setOnline(false));
    };
    check();
    const id = setInterval(check, 10000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <header
      className="h-14 flex items-center justify-between px-5 sticky top-0 z-50"
      style={{
        background: "rgba(10,12,20,0.92)",
        backdropFilter: "blur(12px)",
        borderBottom: "1px solid rgba(56,139,253,0.12)",
        boxShadow: "0 1px 0 0 rgba(56,139,253,0.06)",
      }}
    >
      {/* Left — Logo */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          {/* Small shield icon accent */}
          <div
            className="w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold"
            style={{
              background: "linear-gradient(135deg, rgba(56,139,253,0.25), rgba(56,139,253,0.08))",
              border: "1px solid rgba(56,139,253,0.3)",
              color: "#58a6ff",
            }}
          >
            ⬡
          </div>
          <span className="font-bold text-lg tracking-tight" style={{ color: "#58a6ff" }}>
            NIDS
          </span>
        </div>
        <div
          className="hidden sm:block h-4 w-px"
          style={{ background: "rgba(255,255,255,0.1)" }}
        />
        <span className="hidden sm:inline text-sm" style={{ color: "rgba(255,255,255,0.35)" }}>
          Network Intrusion Detection System
        </span>
      </div>

      {/* Right — Status indicators */}
      <div className="flex items-center gap-5">
        {/* WS reconnecting */}
        {!wsConnected && (
          <span
            className="text-xs flex items-center gap-1.5 animate-pulse"
            style={{ color: "#e3b341" }}
          >
            <span>⚡</span> Reconnecting...
          </span>
        )}

        {/* System status */}
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${online ? "animate-blink-dot" : ""}`}
            style={{ backgroundColor: online ? "#3fb950" : "#f85149" }}
          />
          <span
            className="text-xs font-semibold tracking-wide"
            style={{ color: online ? "#3fb950" : "#f85149" }}
          >
            {online ? "SYSTEM ACTIVE" : "OFFLINE"}
          </span>
        </div>

        {/* Divider */}
        <div className="h-4 w-px" style={{ background: "rgba(255,255,255,0.08)" }} />

        {/* Clock */}
        <span className="font-mono-code text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>
          {time.toLocaleTimeString()}
        </span>
      </div>
    </header>
  );
};

export default StatusBar;