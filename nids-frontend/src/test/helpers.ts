import type { Alert } from "@/hooks/useWebSocket";

let counter = 0;

export const buildAlert = (overrides: Partial<Alert> = {}): Alert => {
  counter += 1;
  const ts = overrides.timestamp ?? `2026-08-21T10:${String(counter % 60).padStart(2, "0")}:00Z`;
  return {
    id: overrides.id ?? String(counter),
    timestamp: ts,
    src_ip: overrides.src_ip ?? `10.0.0.${counter}`,
    attack_type: overrides.attack_type ?? "DDoS",
    severity: overrides.severity ?? "HIGH",
    confidence: overrides.confidence ?? 0.92,
    ...overrides,
  };
};

export const makeAlert = (overrides: Record<string, unknown> = {}) => ({
  id: String(counter++),
  timestamp: "2026-08-21T10:00:00Z",
  source_ip: "192.168.1.10",
  destination_ip: "192.168.1.20",
  prediction: "DDoS",
  severity: "HIGH",
  confidence: 0.95,
  ...overrides,
});