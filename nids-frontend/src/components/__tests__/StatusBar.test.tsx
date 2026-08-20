import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import StatusBar from "@/components/StatusBar";

vi.mock("@/api/client", () => ({
  checkHealth: vi.fn(() =>
    Promise.resolve({
      status: "ok",
      db: "ok",
      model: "ok",
      sniffer: "running",
      uptime_seconds: 3660,
    })
  ),
}));

describe("StatusBar", () => {
  it("reports real component states from the health endpoint", async () => {
    render(<StatusBar wsConnected />);
    expect(await screen.findByText(/System Active/i)).toBeInTheDocument();
    expect(screen.getByText(/Model ok/i)).toBeInTheDocument();
    expect(screen.getByText(/DB ok/i)).toBeInTheDocument();
    expect(screen.getByText(/Sniffer running/i)).toBeInTheDocument();
  });

  it("flags a reconnecting websocket", () => {
    render(<StatusBar wsConnected={false} />);
    expect(screen.getByText(/WebSocket reconnecting/i)).toBeInTheDocument();
  });
});