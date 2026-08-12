import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { campaignDailyCapacity, launchBlockers, type LaunchCheckInput } from "../lib/capacity";
import { allSeedRecords, seedMailboxes } from "../lib/demo";
import { NAV_ITEMS } from "../lib/nav";
import type { CampaignSchedule, MailboxCapacity, SequenceStep } from "../lib/types";
import { ACTIVE_WORKSPACE } from "../lib/workspace";

/**
 * Invariants only — the rules that make this frontend safe to wire to a real
 * mail worker. Layout and copy are not tested here on purpose.
 */

function source(path: string): Promise<string> {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

const connectedMailbox: MailboxCapacity = {
  mailboxId: "mb_1",
  emailAddress: "a@example.com",
  status: "connected",
  dailyHardLimit: 100,
  hourlyHardLimit: 10,
  usedToday: 20,
  reservedToday: 10,
  availableToday: 70,
  sendingWindowStart: "09:00",
  sendingWindowEnd: "17:00",
  timezone: "Europe/London",
};

const validSchedule: CampaignSchedule = {
  startDate: "2026-09-01",
  sendingDays: [1, 2, 3, 4, 5],
  windowStart: "09:00",
  windowEnd: "17:00",
  perMailboxDelaySeconds: 60,
  maxSendsPerDay: 50,
  timezone: "Europe/London",
};

const validSequence: SequenceStep[] = [
  { stepId: "s1", subject: "Hello {{first_name}}", body: "About {{company}}.", delayDays: 0 },
];

function check(overrides: Partial<LaunchCheckInput> = {}) {
  return launchBlockers({
    eligibleLeadCount: 50,
    selectedMailboxes: [connectedMailbox],
    sequence: validSequence,
    schedule: validSchedule,
    ...overrides,
  });
}

describe("sidebar navigation", () => {
  it("has exactly the six main modules", () => {
    expect(NAV_ITEMS.map((item) => item.key)).toEqual([
      "dashboard",
      "leads",
      "campaigns",
      "inbox",
      "mailboxes",
      "settings",
    ]);
  });

  it("has no top-level item for a nested flow", () => {
    const hrefs = NAV_ITEMS.map((item) => item.href);

    for (const forbidden of ["/leads/imports", "/enrichment", "/warmup", "/settings/billing", "/campaigns/new"]) {
      expect(hrefs).not.toContain(forbidden);
    }
    // Campaign detail is reached from the list, never from the rail.
    expect(hrefs.some((href) => /^\/campaigns\/.+/.test(href))).toBe(false);
  });
});

describe("backend wiring", () => {
  it("does not let route pages read demo data instead of the backend", async () => {
    const routePages = [
      "app/(app)/page.tsx",
      "app/(app)/leads/page.tsx",
      "app/(app)/mailboxes/page.tsx",
      "app/(app)/campaigns/page.tsx",
      "app/(app)/campaigns/new/page.tsx",
      "app/(app)/campaigns/[id]/page.tsx",
      "app/(app)/inbox/page.tsx",
    ];

    for (const page of routePages) {
      expect(await source(page), page).not.toContain("@/lib/demo");
    }
  });
});

describe("app icon", () => {
  it("uses the same campaign mark as the Warmailer rail logo", async () => {
    const icon = await source("app/icon.svg");

    expect(icon).toContain("#d97757");
    expect(icon).toContain("M3 10.5 20 4l-6.5 17-2.6-7.2z");
    expect(icon).toContain("M10.9 13.8 20 4");
  });
});

describe("mailbox hard limits gate campaign launch", () => {
  it("allows launch when the selection fits inside available capacity", () => {
    expect(check()).toEqual([]);
  });

  it("blocks launch when selected leads exceed mailbox capacity", () => {
    // 100 daily - 20 used - 10 reserved = 70 available.
    expect(campaignDailyCapacity([connectedMailbox])).toBe(70);

    const codes = check({ eligibleLeadCount: 71 }).map((blocker) => blocker.code);
    expect(codes).toContain("capacity_exceeded");
  });

  it("blocks launch when the campaign daily cap exceeds mailbox capacity", () => {
    const codes = check({ schedule: { ...validSchedule, maxSendsPerDay: 71 } }).map((blocker) => blocker.code);
    expect(codes).toContain("daily_cap_exceeds_capacity");
  });

  it("blocks launch when a selected mailbox is paused, errored or not connected", () => {
    const paused = { ...connectedMailbox, status: "sending_paused" as const };
    expect(check({ selectedMailboxes: [paused] }).map((b) => b.code)).toContain("mailbox_paused_or_error");

    const errored = { ...connectedMailbox, status: "error" as const };
    expect(check({ selectedMailboxes: [errored] }).map((b) => b.code)).toContain("mailbox_paused_or_error");

    const disconnected = { ...connectedMailbox, status: "not_connected" as const };
    expect(check({ selectedMailboxes: [disconnected] }).map((b) => b.code)).toContain("mailbox_not_connected");
  });

  it("counts no capacity from a mailbox that cannot send", () => {
    const paused = { ...connectedMailbox, status: "sending_paused" as const };
    expect(campaignDailyCapacity([paused])).toBe(0);
  });

  it("blocks launch with no mailbox, an empty sequence, or an unknown variable", () => {
    expect(check({ selectedMailboxes: [] }).map((b) => b.code)).toContain("no_mailbox_selected");
    expect(check({ sequence: [] }).map((b) => b.code)).toContain("empty_sequence");

    const bad: SequenceStep[] = [{ stepId: "s1", subject: "Hi {{nickname}}", body: "Body.", delayDays: 0 }];
    expect(check({ sequence: bad }).map((b) => b.code)).toContain("unresolved_variables");
  });
});

describe("app passwords are write-only", () => {
  it("keeps no password value on a mailbox record", () => {
    for (const mailbox of seedMailboxes) {
      const secretKeys = Object.keys(mailbox).filter((key) => /pass(word)?|secret|token/i.test(key));
      expect(secretKeys).toEqual(["appPasswordConfigured"]);
      expect(typeof mailbox.appPasswordConfigured).toBe("boolean");
    }
  });

  it("renders only the configured flag, and clears the entered value on submit", async () => {
    const component = await source("components/mailboxes/mailboxes-workspace.tsx");

    expect(component).toContain("App password configured");
    expect(component).toContain('type="password"');
    // The entered secret is dropped from state the moment the form is submitted.
    expect(component).toContain('setAppPassword("")');
    // No saved mailbox field is ever read back into an input.
    expect(component).not.toMatch(/mailbox\.appPassword\b/);
  });

  it("posts the entered password to the server instead of discarding it locally", async () => {
    const component = await source("components/mailboxes/mailboxes-workspace.tsx");

    expect(component).toContain('fetch("/api/mailboxes"');
    expect(component).not.toContain("Nothing was saved");
  });
});

describe("lineage metadata", () => {
  it("uses MyMaidsPro as the active workspace until Supabase membership is wired", () => {
    expect(ACTIVE_WORKSPACE).toMatchObject({
      workspaceId: "ws_mymaidspro",
      name: "MyMaidsPro",
      role: "owner",
    });
  });

  it("is present on every visible seeded record", () => {
    expect(allSeedRecords.length).toBeGreaterThan(0);

    for (const record of allSeedRecords) {
      expect(record.workspaceId).toBeTruthy();
      expect(record.source).toBeTruthy();
      expect(record.entityId).toBeTruthy();
      expect(record.createdAt).toBeTruthy();
      expect(record.updatedAt).toBeTruthy();
    }
  });

  it("keeps every record inside one workspace", () => {
    expect(new Set(allSeedRecords.map((record) => record.workspaceId)).size).toBe(1);
    expect(new Set(allSeedRecords.map((record) => record.workspaceId))).toEqual(new Set([ACTIVE_WORKSPACE.workspaceId]));
  });
});

describe("capacity has a single source", () => {
  it("is not recomputed outside lib/capacity.ts", async () => {
    const files = [
      "app/(app)/page.tsx",
      "app/(app)/campaigns/[id]/page.tsx",
      "components/campaigns/campaign-wizard.tsx",
      "components/campaigns/campaign-detail.tsx",
      "components/mailboxes/mailboxes-workspace.tsx",
    ];

    for (const file of files) {
      const text = await source(file);
      // The subtraction that defines headroom belongs to availableToday() alone.
      expect(text).not.toMatch(/dailyHardLimit\s*-\s*/);
    }
  });
});
