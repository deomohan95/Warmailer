import { describe, expect, it } from "vitest";

import {
  awaitingReply,
  axisTicks,
  axisTop,
  dailySeries,
  formatRate,
  funnelCounts,
  funnelStages,
  rate,
  seriesMax,
  threadStatusCounts,
} from "../lib/metrics";
import type { CampaignActivity, CampaignEventType, InboxThread, ThreadStatus } from "../lib/types";

function thread(status: ThreadStatus, id: string): InboxThread {
  return {
    workspaceId: "ws_1",
    source: "zoho_mail",
    entityId: id,
    threadId: id,
    mailboxId: "mb_1",
    createdAt: "2026-08-14T09:00:00.000Z",
    updatedAt: "2026-08-14T09:00:00.000Z",
    fromEmail: "lead@example.com",
    subject: "Re: hello",
    lastMessageAt: "2026-08-14T09:00:00.000Z",
    status,
    preview: "…",
  };
}

function event(type: CampaignEventType, occurredAt: string): CampaignActivity {
  return {
    workspaceId: "ws_1",
    source: "system",
    entityId: `${type}_${occurredAt}_${Math.random()}`,
    campaignId: "c_1",
    createdAt: occurredAt,
    updatedAt: occurredAt,
    eventType: type,
    occurredAt,
  };
}

describe("rates", () => {
  it("is undefined until something was sent, never 0%", () => {
    // 0/0 is "no data". Rendering 0% would claim a result that does not exist.
    expect(rate(0, 0)).toBeNull();
    expect(formatRate(rate(0, 0))).toBe("—");
  });

  it("divides the part by the sends", () => {
    expect(rate(25, 100)).toBe(0.25);
    expect(formatRate(rate(25, 100))).toBe("25%");
    expect(formatRate(rate(1, 3))).toBe("33%");
  });

  it("keeps a sub-1% rate visible instead of rounding it to zero", () => {
    expect(formatRate(rate(1, 500))).toBe("0.2%");
    expect(formatRate(rate(0, 500))).toBe("0%");
  });

  it("counts each event type off one activity list", () => {
    const activity = [
      event("sent", "2026-08-14T09:00:00.000Z"),
      event("sent", "2026-08-14T10:00:00.000Z"),
      event("opened", "2026-08-14T11:00:00.000Z"),
      event("replied", "2026-08-14T12:00:00.000Z"),
      event("bounced", "2026-08-14T13:00:00.000Z"),
    ];

    expect(funnelCounts(activity)).toEqual({ sent: 2, opened: 1, replied: 1, bounced: 1 });
  });
});

describe("reply funnel", () => {
  it("measures each stage against sends, and the reply step against opens", () => {
    const stages = funnelStages({ sent: 100, opened: 40, replied: 8, bounced: 2 });

    expect(stages.map((stage) => stage.key)).toEqual(["sent", "opened", "replied"]);
    // Sent is always the full bar — it is the denominator.
    expect(stages[0]?.share).toBe(1);
    expect(stages[1]?.share).toBe(0.4);
    expect(stages[2]?.share).toBe(0.08);

    // The diagnostic number: 8 of 40 opens replied, not 8 of 100 sends.
    expect(stages[2]?.ofPrevious).toBe(0.2);
    expect(stages[2]?.previousLabel).toBe("opens");
  });

  it("reports no rate at all before anything was sent", () => {
    const stages = funnelStages({ sent: 0, opened: 0, replied: 0, bounced: 0 });

    for (const stage of stages) {
      expect(stage.share).toBeNull();
      expect(formatRate(stage.share)).toBe("—");
    }
  });

  it("does not divide the reply rate by zero opens", () => {
    // Replies can arrive with no recorded open — a lead may reply with images off.
    const stages = funnelStages({ sent: 50, opened: 0, replied: 3, bounced: 0 });

    expect(stages[2]?.ofPrevious).toBeNull();
    expect(stages[2]?.share).toBe(0.06);
  });
});

describe("inbox status", () => {
  const threads = [
    thread("unread", "t1"),
    thread("unread", "t2"),
    thread("read", "t3"),
    thread("replied", "t4"),
    thread("archived", "t5"),
  ];

  it("keeps a fixed segment order so the bar does not reshuffle", () => {
    expect(threadStatusCounts(threads).map((entry) => entry.status)).toEqual([
      "unread",
      "read",
      "replied",
      "archived",
    ]);
  });

  it("counts each status and its share of all threads", () => {
    const counts = threadStatusCounts(threads);

    expect(counts.find((c) => c.status === "unread")).toMatchObject({ count: 2, share: 0.4 });
    expect(counts.find((c) => c.status === "replied")).toMatchObject({ count: 1, share: 0.2 });
  });

  it("counts read-but-unanswered threads as still waiting on a human", () => {
    // The forgotten pile: opened, never answered.
    expect(awaitingReply(threads)).toBe(3);
  });

  it("holds up with no threads at all", () => {
    expect(awaitingReply([])).toBe(0);
    for (const entry of threadStatusCounts([])) {
      expect(entry.count).toBe(0);
      expect(entry.share).toBeNull();
    }
  });
});

describe("daily series", () => {
  const today = new Date("2026-08-14T15:00:00.000Z");

  it("keeps quiet days as zeros so a gap in sending stays visible", () => {
    const points = dailySeries([event("sent", "2026-08-14T09:00:00.000Z")], 5, today);

    expect(points).toHaveLength(5);
    expect(points.map((point) => point.date)).toEqual([
      "2026-08-10",
      "2026-08-11",
      "2026-08-12",
      "2026-08-13",
      "2026-08-14",
    ]);
    expect(points.at(-1)).toEqual({ date: "2026-08-14", sent: 1, opened: 0, replied: 0 });
    expect(points[0]).toEqual({ date: "2026-08-10", sent: 0, opened: 0, replied: 0 });
  });

  it("buckets each event type into its own day", () => {
    const points = dailySeries(
      [
        event("sent", "2026-08-13T09:00:00.000Z"),
        event("sent", "2026-08-13T23:59:00.000Z"),
        event("opened", "2026-08-14T01:00:00.000Z"),
        event("replied", "2026-08-14T02:00:00.000Z"),
      ],
      3,
      today,
    );

    expect(points.find((p) => p.date === "2026-08-13")).toMatchObject({ sent: 2, opened: 0, replied: 0 });
    expect(points.find((p) => p.date === "2026-08-14")).toMatchObject({ sent: 0, opened: 1, replied: 1 });
  });

  it("ignores events outside the window and unparseable dates", () => {
    const points = dailySeries(
      [event("sent", "2026-01-01T09:00:00.000Z"), event("sent", "not-a-date")],
      3,
      today,
    );

    expect(seriesMax(points)).toBe(0);
  });

  it("does not count bounces as bars — the chart is sent/opened/replied only", () => {
    const points = dailySeries([event("bounced", "2026-08-14T09:00:00.000Z")], 2, today);
    expect(seriesMax(points)).toBe(0);
  });
});

describe("axis", () => {
  it("rounds the top up to a clean number at or above the peak", () => {
    expect(axisTop(0)).toBe(0);
    expect(axisTop(7)).toBe(10);
    expect(axisTop(12)).toBe(20);
    expect(axisTop(23)).toBe(25);
    expect(axisTop(140)).toBe(200);
  });

  it("never crops the tallest bar", () => {
    for (const peak of [1, 3, 9, 17, 44, 61, 130, 780]) {
      expect(axisTop(peak)).toBeGreaterThanOrEqual(peak);
    }
  });

  it("returns whole ticks from zero to the top", () => {
    expect(axisTicks(20)).toEqual([0, 5, 10, 15, 20]);
    expect(axisTicks(0)).toEqual([0]);
  });
});
