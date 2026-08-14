import type { CampaignActivity, InboxThread, ThreadStatus } from "@/lib/types";

/**
 * Derived campaign figures. Every rate is a ratio of recorded events — nothing
 * here estimates, smooths or back-fills a number the mail worker never wrote.
 */

export type FunnelCounts = {
  sent: number;
  opened: number;
  replied: number;
  bounced: number;
};

/**
 * A rate is undefined until something was sent — `0 / 0` is "no data", not 0%,
 * and showing 0% would claim a result the workspace has not produced.
 */
export function rate(part: number, whole: number): number | null {
  if (whole <= 0) return null;
  return part / whole;
}

export function formatRate(value: number | null): string {
  if (value === null) return "—";
  // Sub-1% is real but rounds to 0%; one decimal keeps it honest without noise.
  const pct = value * 100;
  return `${pct > 0 && pct < 1 ? pct.toFixed(1) : Math.round(pct)}%`;
}

export function countEvents(activity: readonly CampaignActivity[], type: CampaignActivity["eventType"]): number {
  return activity.filter((event) => event.eventType === type).length;
}

export function funnelCounts(activity: readonly CampaignActivity[]): FunnelCounts {
  return {
    sent: countEvents(activity, "sent"),
    opened: countEvents(activity, "opened"),
    replied: countEvents(activity, "replied"),
    bounced: countEvents(activity, "bounced"),
  };
}

/* ---------- Reply funnel ---------- */

export type FunnelStage = {
  key: "sent" | "opened" | "replied";
  label: string;
  count: number;
  /** Share of sends, 0–1, for the bar width. Null until something was sent. */
  share: number | null;
  /** Rate against the stage above, which is the diagnostic number. */
  ofPrevious: number | null;
  previousLabel: string;
};

/**
 * Sent → Opened → Replied as shares of sends.
 *
 * Each stage is a subset of the one above it, so the bars nest rather than sum.
 * `ofPrevious` is what separates "nobody opens" from "people open but the copy
 * does not land" — the whole reason to draw this as a funnel.
 */
export function funnelStages(counts: FunnelCounts): FunnelStage[] {
  const { sent, opened, replied } = counts;

  return [
    {
      key: "sent",
      label: "Sent",
      count: sent,
      share: sent > 0 ? 1 : null,
      ofPrevious: null,
      previousLabel: "",
    },
    {
      key: "opened",
      label: "Opened",
      count: opened,
      share: rate(opened, sent),
      ofPrevious: rate(opened, sent),
      previousLabel: "sent",
    },
    {
      key: "replied",
      label: "Replied",
      count: replied,
      share: rate(replied, sent),
      ofPrevious: rate(replied, opened),
      previousLabel: "opens",
    },
  ];
}

/* ---------- Inbox status ---------- */

export type ThreadStatusCount = {
  status: ThreadStatus;
  label: string;
  count: number;
  share: number | null;
};

const THREAD_STATUS_ORDER: { status: ThreadStatus; label: string }[] = [
  { status: "unread", label: "Unread" },
  { status: "read", label: "Read" },
  { status: "replied", label: "Replied" },
  { status: "archived", label: "Archived" },
];

/**
 * Thread counts by status, always in the same order so the stacked bar does not
 * reshuffle its segments when the numbers move.
 */
export function threadStatusCounts(threads: readonly InboxThread[]): ThreadStatusCount[] {
  const total = threads.length;

  return THREAD_STATUS_ORDER.map(({ status, label }) => {
    const count = threads.filter((thread) => thread.status === status).length;
    return { status, label, count, share: rate(count, total) };
  });
}

/**
 * Threads still waiting on a human. `read` counts as waiting: someone opened it
 * and did not answer, which is exactly the pile that gets forgotten.
 */
export function awaitingReply(threads: readonly InboxThread[]): number {
  return threads.filter((thread) => thread.status === "unread" || thread.status === "read").length;
}

/* ---------- Daily series ---------- */

export type DayPoint = {
  /** ISO date, `YYYY-MM-DD`. */
  date: string;
  sent: number;
  opened: number;
  replied: number;
};

function isoDate(value: string): string | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

/**
 * Counts per day across a fixed window ending today. Days with no events stay in
 * the series as zeros — dropping them would compress the x-axis and make a gap in
 * sending look like continuous activity.
 */
export function dailySeries(
  activity: readonly CampaignActivity[],
  days = 14,
  today = new Date(),
): DayPoint[] {
  const buckets = new Map<string, DayPoint>();
  const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const day = new Date(end);
    day.setUTCDate(day.getUTCDate() - offset);
    const key = day.toISOString().slice(0, 10);
    buckets.set(key, { date: key, sent: 0, opened: 0, replied: 0 });
  }

  for (const event of activity) {
    const key = isoDate(event.occurredAt);
    if (!key) continue;
    const bucket = buckets.get(key);
    if (!bucket) continue;

    if (event.eventType === "sent") bucket.sent += 1;
    else if (event.eventType === "opened") bucket.opened += 1;
    else if (event.eventType === "replied") bucket.replied += 1;
  }

  return [...buckets.values()];
}

/** The tallest bar in the series, used to scale every column against one axis. */
export function seriesMax(points: readonly DayPoint[]): number {
  return points.reduce((max, point) => Math.max(max, point.sent, point.opened, point.replied), 0);
}

/**
 * A clean axis top at or above the peak, so ticks land on round numbers rather
 * than on whatever the tallest bar happens to be.
 */
export function axisTop(max: number): number {
  if (max <= 0) return 0;
  const magnitude = 10 ** Math.floor(Math.log10(max));
  for (const step of [1, 2, 2.5, 5, 10]) {
    const candidate = step * magnitude;
    if (candidate >= max) return candidate;
  }
  return 10 * magnitude;
}

/** Axis ticks from 0 to the top, inclusive, at a readable count. */
export function axisTicks(top: number, count = 4): number[] {
  if (top <= 0) return [0];
  const ticks: number[] = [];
  for (let i = 0; i <= count; i += 1) ticks.push(Math.round((top / count) * i));
  return [...new Set(ticks)];
}

/** `2026-08-14` → `14 Aug`, for axis labels. */
export function formatDayLabel(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return `${date.getUTCDate()} ${date.toLocaleString("en", { month: "short", timeZone: "UTC" })}`;
}
