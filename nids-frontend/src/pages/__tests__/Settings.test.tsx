import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import Settings from "@/pages/Settings";

vi.mock("@/api/client", () => ({
  getSystemStatus: vi.fn(() =>
    Promise.resolve({
      health: { status: "ok", db: "ok", model: "ok", sniffer: "running", uptime_seconds: 120, ws_clients: 1 },
      manifest: {
        model_type: "LGBMClassifier",
        feature_count: 52,
        classes: ["Bots", "DDoS", "Normal Traffic"],
        feature_source: "CICIDS_FEATURES (src/features/extractor.py)",
        generated_by: "check.py",
      },
      sniffer: { interface: "Ethernet0", running: true, total_packets: 999, total_flows: 42, total_api_calls: 40, total_retries: 1, total_dropped: 0 },
      rate_limit_per_minute: 120,
      api_secret_configured: false,
      capture_auto_start: false,
    })
  ),
  getAlerts: vi.fn(() => Promise.resolve([])),
  getStats: vi.fn(() => Promise.resolve({})),
  getIPLeaderboard: vi.fn(() => Promise.resolve([])),
  checkHealth: vi.fn(() => Promise.resolve({ status: "ok", db: "ok", model: "ok", sniffer: "running" })),
  getSnifferStats: vi.fn(() => Promise.resolve({ status: "ok" })),
}));

vi.mock("@/hooks/useWebSocket", () => ({
  useWebSocket: () => ({ lastAlert: null, isConnected: true, alertHistory: [] }),
}));

describe("Settings route", () => {
  it("renders real system status data", async () => {
    render(
      <MemoryRouter initialEntries={["/settings"]}>
        <Routes>
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </MemoryRouter>
    );
    expect(await screen.findByText("Backend Health")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/LGBMClassifier/i)).toBeInTheDocument());
    expect(screen.getByText("52")).toBeInTheDocument();
    expect(screen.getByText(/Ethernet0/i)).toBeInTheDocument();
    expect(screen.getByText("120")).toBeInTheDocument();
    expect(screen.getByText(/not set/i)).toBeInTheDocument();
  });
});