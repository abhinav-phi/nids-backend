import { useState, useEffect, useRef, useCallback } from "react";

export interface Alert {
  id?: string;
  timestamp: string;
  src_ip: string;
  source_ip?: string;         // backend sends source_ip
  attack_type?: string;       // frontend alias
  prediction?: string;        // backend sends prediction
  severity: string;
  confidence: number;
  shap_top5?: { feature: string; impact: number }[];
  [key: string]: unknown;
}

// Helper: normalize alert from backend format → frontend format
function normalizeAlert(raw: Record<string, unknown>): Alert {
  return {
    ...raw,
    // backend sends source_ip, frontend uses src_ip
    src_ip:      (raw.src_ip as string)      || (raw.source_ip as string) || "unknown",
    // backend sends prediction, frontend uses attack_type
    attack_type: (raw.attack_type as string) || (raw.prediction as string) || "Unknown",
    severity:    (raw.severity as string)    || "LOW",
    confidence:  (raw.confidence as number)  || 0,
    timestamp:   (raw.timestamp as string)   || new Date().toISOString(),
  } as Alert;
}

export function useWebSocket(url = "ws://localhost:8000/ws/live") {
  const [lastAlert, setLastAlert]       = useState<Alert | null>(null);
  const [isConnected, setIsConnected]   = useState(false);
  const [alertHistory, setAlertHistory] = useState<Alert[]>([]);
  const wsRef        = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout>>();

  const connect = useCallback(() => {
    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("[WS] Connected to NIDS backend");
        setIsConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const raw = JSON.parse(event.data);

          // Backend sends either a single alert or an array (initial load)
          if (Array.isArray(raw)) {
            const normalized = raw.map(normalizeAlert);
            setAlertHistory(normalized.slice(0, 100));
          } else {
            const alert = normalizeAlert(raw);
            setLastAlert(alert);
            setAlertHistory((prev) => [alert, ...prev].slice(0, 100));
          }
        } catch (e) {
          console.error("[WS] Parse error", e);
        }
      };

      ws.onclose = () => {
        console.log("[WS] Disconnected — reconnecting in 3s...");
        setIsConnected(false);
        reconnectRef.current = setTimeout(connect, 3000);
      };

      ws.onerror = (err) => {
        console.error("[WS] Error", err);
        ws.close();
      };
    } catch (e) {
      console.error("[WS] Connection failed", e);
      reconnectRef.current = setTimeout(connect, 3000);
    }
  }, [url]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { lastAlert, isConnected, alertHistory };
}