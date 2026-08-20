import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AlertFeed, { alertsToCsv } from "@/components/AlertFeed";
import { buildAlert } from "@/test/helpers";

vi.mock("@/hooks/useWebSocket", () => ({
  useWebSocket: () => ({ lastAlert: null, isConnected: true, alertHistory: [] }),
}));

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  BarChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  LabelList: () => null,
  Tooltip: () => null,
  Cell: () => null,
  Legend: () => null,
}));

const renderFeed = (history: ReturnType<typeof buildAlert>[]) =>
  render(
    <MemoryRouter>
      <AlertFeed history={history} />
    </MemoryRouter>
  );

describe("AlertFeed", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders alerts from the live stream", () => {
    renderFeed([
      buildAlert({ src_ip: "10.1.1.1", attack_type: "DDoS", severity: "CRITICAL" }),
    ]);
    expect(screen.getByText("Live Threat Log")).toBeInTheDocument();
    expect(screen.getByText("10.1.1.1")).toBeInTheDocument();
    expect(screen.getAllByText("DDoS").length).toBeGreaterThan(0);
    expect(screen.getByText("Critical")).toBeInTheDocument();
  });

  it("shows a real empty state when no alerts exist", () => {
    renderFeed([]);
    expect(screen.getByText(/No matching alerts in the current view/i)).toBeInTheDocument();
  });

  it("exports the current view as CSV with real fields", () => {
    const alerts = [
      buildAlert({ id: "7", timestamp: "2026-08-21T10:00:00Z", src_ip: "10.0.0.1", attack_type: "Bots", severity: "HIGH", confidence: 0.8 }),
      buildAlert({ id: "8", timestamp: "2026-08-21T10:01:00Z", src_ip: "10.0.0.2", attack_type: "DDoS", severity: "CRITICAL", confidence: 0.99 }),
    ];
    const csv = alertsToCsv(alerts);
    expect(csv).toContain("timestamp,source_ip,prediction,severity,confidence");
    expect(csv).toContain("10.0.0.1");
    expect(csv).toContain("Bots");
    expect(csv).not.toContain("undefined");
  });

  it("links to the historical archive", () => {
    renderFeed([buildAlert()]);
    expect(screen.getByRole("link", { name: /Historical Archive/i })).toHaveAttribute("href", "/alerts");
  });
});