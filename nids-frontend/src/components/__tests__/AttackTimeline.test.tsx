import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import AttackTimeline, { bucketByHour } from "@/components/AttackTimeline";

vi.mock("@/api/client", () => ({
  getAlerts: vi.fn(),
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
}));

import { getAlerts } from "@/api/client";

const mockedGetAlerts = vi.mocked(getAlerts);

describe("AttackTimeline", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders an honest empty state when the API returns no alerts (no dummy data)", async () => {
    mockedGetAlerts.mockResolvedValue([]);
    render(<AttackTimeline />);
    await waitFor(() => {
      expect(screen.getByText(/No attack alerts in the last 12 hours/i)).toBeInTheDocument();
    });
  });

  it("shows an error state when the backend is unreachable", async () => {
    mockedGetAlerts.mockRejectedValue({ response: { data: { detail: "Backend offline" } } });
    render(<AttackTimeline />);
    await waitFor(() => {
      expect(screen.getByText(/Backend offline/i)).toBeInTheDocument();
    });
  });

  it("buckets real alerts into 12 hourly buckets of real counts", () => {
    const now = new Date("2026-08-21T12:00:00Z");
    const buckets = bucketByHour(
      [
        { timestamp: "2026-08-21T11:59:00Z", severity: "CRITICAL" },
        { timestamp: "2026-08-21T11:30:00Z", severity: "LOW" },
        { timestamp: "2026-08-21T10:15:00Z", severity: "HIGH" },
      ],
      now
    );
    expect(buckets).toHaveLength(12);
    // Bucket 11 is the current hour (now); 11:59Z/11:30Z always fall inside it.
    expect(buckets[11].count).toBe(2);
    expect(buckets[11].maxSeverity).toBe("CRITICAL");
    // The 10:15Z alert lands in exactly one other (timezone-dependent) bucket.
    const singleBucket = buckets.find((b) => b.count === 1);
    expect(singleBucket).toBeDefined();
    expect(singleBucket?.maxSeverity).toBe("HIGH");
    const counts = buckets.map((b) => b.count);
    expect(counts.reduce((s, c) => s + c, 0)).toBe(3);
  });
});