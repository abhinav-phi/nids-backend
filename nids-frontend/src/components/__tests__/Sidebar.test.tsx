import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Sidebar from "@/components/Sidebar";

vi.mock("@/api/client", () => ({
  getAlerts: vi.fn(() => Promise.resolve([])),
}));

const renderSidebar = () =>
  render(
    <MemoryRouter initialEntries={["/"]}>
      <Sidebar />
    </MemoryRouter>
  );

describe("Sidebar", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists real navigation routes", () => {
    renderSidebar();
    expect(screen.getByRole("link", { name: /Dashboard/i })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: /Alerts/i })).toHaveAttribute("href", "/alerts");
    expect(screen.getByRole("link", { name: /Reports/i })).toHaveAttribute("href", "/reports");
    expect(screen.getByRole("link", { name: /Network Activity/i })).toHaveAttribute("href", "/network");
    expect(screen.getByRole("link", { name: /Settings/i })).toHaveAttribute("href", "/settings");
  });

  it("performs a real CSV export of alerts on click", async () => {
    const { getAlerts } = await import("@/api/client");
    vi.mocked(getAlerts).mockResolvedValue([
      { timestamp: "2026-08-21T10:00:00Z", source_ip: "10.0.0.5", destination_ip: "10.0.0.9", prediction: "DDoS", severity: "CRITICAL", confidence: 0.99 },
    ]);
    const createObjectURL = vi.fn(() => "blob:test");
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { writable: true, value: createObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { writable: true, value: revokeObjectURL });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    renderSidebar();
    const exportBtn = await screen.findByRole("button", { name: /Export Alerts CSV/i });
    fireEvent.click(exportBtn);

    await waitFor(() => expect(createObjectURL).toHaveBeenCalledOnce());
    expect(vi.mocked(getAlerts)).toHaveBeenCalledWith({ limit: 500, exclude_benign: true });
    clickSpy.mockRestore();
  });

  it("does not render placeholder buttons", () => {
    renderSidebar();
    expect(screen.queryByText("Support")).not.toBeInTheDocument();
    expect(screen.queryByText("Global Blocklist")).not.toBeInTheDocument();
  });
});