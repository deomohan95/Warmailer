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
  it("uses simple Supabase password login before loading the app workspace", async () => {
    const loginPage = await source("app/login/page.tsx");
    const signupPage = await source("app/signup/page.tsx");
    const loginRoute = await source("app/api/auth/login/route.ts");
    const signupRoute = await source("app/api/auth/signup/route.ts");
    const logoutRoute = await source("app/api/auth/logout/route.ts");
    const data = await source("lib/backend-data.ts");
    const layout = await source("app/(app)/layout.tsx");

    expect(loginPage).toContain('name="identifier"');
    expect(loginPage).toContain('action="/api/auth/login"');
    for (const field of ['name="name"', 'name="email"', 'name="phone"', 'name="company"', 'name="password"']) {
      expect(signupPage).toContain(field);
    }
    expect(signupRoute).toContain("/auth/v1/admin/users");
    expect(signupRoute).toContain("workspace_members");
    expect(signupRoute).toContain("owner");
    expect(loginRoute).toContain("/auth/v1/token?grant_type=password");
    expect(logoutRoute).toContain("ACCESS_COOKIE");
    expect(data).toContain("getAuthUser");
    expect(data).toContain("workspace_members");
    expect(layout).toContain('redirect("/login")');
  });

  it("does not prefill a client-specific username on login", async () => {
    const loginPage = await source("app/login/page.tsx");

    expect(loginPage).not.toContain('defaultValue="infomymaidspro"');
  });

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

  it("wires lead import buttons to the CSV file input and API route", async () => {
    const page = await source("app/(app)/leads/page.tsx");
    const component = await source("components/leads/leads-workspace.tsx");

    expect(page).toContain('htmlFor="lead-csv-file"');
    expect(component).toContain('id="lead-csv-file"');
    expect(component).toContain('type="file"');
    expect(component).toContain('accept=".csv,text/csv"');
    expect(component).toContain('fetch("/api/leads/import"');
  });

  it("wires find emails to the enrichment batch API", async () => {
    const component = await source("components/leads/leads-workspace.tsx");

    expect(component).toContain('fetch("/api/enrichment-batches"');
    expect(component).toContain("setEnrichmentMessage");
    expect(component).toContain("batchId");
  });

  it("lets leads be filtered and summarized by upload", async () => {
    const component = await source("components/leads/leads-workspace.tsx");

    expect(component).toContain("selectedImportId");
    expect(component).toContain('aria-label="Upload"');
    expect(component).toContain("Upload overview");
  });

  it("can open the campaign builder with selected found leads preloaded", async () => {
    const leads = await source("components/leads/leads-workspace.tsx");
    const page = await source("app/(app)/campaigns/new/page.tsx");
    const wizard = await source("components/campaigns/campaign-wizard.tsx");

    expect(leads).toContain("createCampaign");
    expect(leads).toContain("/campaigns/new?leadIds=");
    expect(page).toContain("searchParams");
    expect(page).toContain("initialLeadIds");
    expect(wizard).toContain("initialLeadIds");
    expect(wizard).toContain("visibleLeads");
    expect(wizard).toContain("validInitialLeadIds.length > 0");
  });

  it("helps campaign body copy use supported variables", async () => {
    const wizard = await source("components/campaigns/campaign-wizard.tsx");

    expect(wizard).toContain("Hi {{first_name}}");
    expect(wizard).toContain("insertBodyVariable");
    expect(wizard).toContain("Insert variable");
    expect(wizard).toContain("draggable");
    expect(wizard).not.toContain("Available variables:");
  });

  it("launches campaigns through the backend with selected leads, mailboxes, sequence and schedule", async () => {
    const wizard = await source("components/campaigns/campaign-wizard.tsx");
    const route = await source("app/api/campaigns/route.ts");

    expect(wizard).toContain('fetch("/api/campaigns"');
    expect(wizard).toContain("eligible.map");
    expect(wizard).toContain("router.push(`/campaigns/${data.campaignId}`)");
    for (const table of ["campaigns", "campaign_leads", "campaign_mailboxes", "campaign_sequence_steps"]) {
      expect(route).toMatch(new RegExp(`supabasePost\\(\\s*"${table}"`));
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

describe("root layout", () => {
  it("suppresses body hydration warnings from browser extension attributes", async () => {
    const layout = await source("app/layout.tsx");

    expect(layout).toContain("<body suppressHydrationWarning>{children}</body>");
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

  it("lets saved mailbox hard limits be edited without exposing the password", async () => {
    const component = await source("components/mailboxes/mailboxes-workspace.tsx");
    const route = await source("app/api/mailboxes/route.ts");

    expect(component).toContain('method: "PATCH"');
    expect(component).toContain("Save limits");
    expect(component).not.toMatch(/mailbox\.appPassword\b/);
    expect(route).toContain("export async function PATCH");
    expect(route).toContain("limits_updated");
  });

  it("lets saved mailbox sender display names be edited", async () => {
    const component = await source("components/mailboxes/mailboxes-workspace.tsx");
    const route = await source("app/api/mailboxes/route.ts");

    expect(component).toContain("senderName");
    expect(component).toContain("Sender display name");
    expect(route).toContain("display_name: input.displayName");
  });
});

describe("warmup wiring", () => {
  it("loads warmup mailbox stats from backend data, not demo state", async () => {
    const page = await source("app/(app)/mailboxes/page.tsx");
    const data = await source("lib/warmup-data.ts");

    expect(page).toContain("getWarmupMailboxStats");
    expect(page).not.toContain("getWarmupSeeds");
    expect(data).toContain("warmup_mailbox_stats");
    expect(data).toContain("warmup_seed_accounts");
  });

  it("shows warmup metrics and mailbox controls without seed account admin UI", async () => {
    const component = await source("components/mailboxes/mailboxes-workspace.tsx");

    expect(component).toContain('type MailboxTab = "mailboxes" | "warmup"');
    expect(component).toContain('aria-label="Mailbox sections"');
    expect(component).toContain("Warmup reputation");
    expect(component).toContain("Saved from spam");
    expect(component).toContain("Landed in inbox");
    expect(component).toContain("Warmup emails sent");
    expect(component).toContain("Fresh emails received");
    expect(component).toContain("warmup-settings-grid");
    expect(component).toContain('type="range"');
    expect(component).toContain("Warmup sends low-volume real emails in both directions");
    expect(component).not.toContain("warmup-table");
    expect(component).not.toContain("Gmail seed accounts");
    expect(component).not.toContain('fetch("/api/warmup/seeds"');
    expect(component).toContain("sentToday");
    expect(component).toContain("warmupTargetToday");
    expect(component).toContain("received7d");
    expect(component).toContain("warmupDailyLimit");
    expect(component).toContain("warmupDailyRampup");
    expect(component).toContain("warmupRandomizeDailyCount");
    expect(component).toContain("warmupRandomMinPercent");
    expect(component).toContain('max={100}');
    expect(component).toContain("100%");
    expect(component).toContain("Approx range today");
    expect(component).toContain("warmupReplyRatePercent");
    expect(component).toContain("warmupInboundOriginalPercent");
    expect(component).toContain("warmupInboundReplyRatePercent");
    expect(component).toContain("Fresh inbound (%)");
    expect(component).toContain("Inbound reply (%)");
    expect(component).not.toContain("stat?.reputation ?? 100");
  });

  it("keeps warmup seed management behind the app owner admin gate", async () => {
    const settingsPage = await source("app/(app)/settings/page.tsx");
    const adminPage = await source("app/(app)/settings/admin/page.tsx");
    const adminComponent = await source("components/settings/warmup-admin.tsx");
    const seedRoute = await source("app/api/warmup/seeds/route.ts");

    expect(settingsPage).toContain("isWarmupAdminEmail");
    expect(settingsPage).toContain("/settings/admin");
    expect(adminPage).toContain("requireWarmupAdmin");
    expect(adminPage).toContain("getWarmupSeeds");
    expect(adminComponent).toContain("Gmail seed accounts");
    expect(adminComponent).toContain('fetch("/api/warmup/seeds"');
    expect(seedRoute).toContain("requireWarmupAdmin");
  });
});

describe("inbox empty states", () => {
  it("does not tell the user to connect a mailbox when one is already connected", async () => {
    const component = await source("components/inbox/inbox-workspace.tsx");

    expect(component).toContain("const hasMailbox = mailboxes.length > 0");
    expect(component).toContain("Zoho inbox sync worker pulls them");
    expect(component).toContain("hasMailbox ? undefined");
  });

  it("lets the user reply through the same Zoho thread", async () => {
    const component = await source("components/inbox/inbox-workspace.tsx");
    const route = await source("app/api/inbox/reply/route.ts");

    expect(component).toContain('fetch("/api/inbox/reply"');
    expect(component).not.toContain("Replying is not wired to Zoho yet.");
    expect(route).toContain("inReplyTo");
    expect(route).toContain("message_events");
    expect(route).toContain("smtp_accepted");
  });

  it("renders the inbox as a master mailbox with folders, filters, sorting and full message trail", async () => {
    const page = await source("app/(app)/inbox/page.tsx");
    const component = await source("components/inbox/inbox-workspace.tsx");

    expect(page).toContain("getInboxMessages");
    expect(page).toContain("getCampaigns");
    expect(component).toContain("folder");
    expect(component).toContain("Sent");
    expect(component).toContain("Campaign");
    expect(component).toContain("Mailbox");
    expect(component).toContain("Latest first");
    expect(component).toContain("conversationMessages.map");
    expect(component).not.toContain('<div className="message-body">{selected.preview}</div>');
  });

  it("renders dashboard metrics from campaigns, messages and activity with a campaign filter", async () => {
    const page = await source("app/(app)/page.tsx");
    const component = await source("components/dashboard/dashboard-workspace.tsx");
    const data = await source("lib/backend-data.ts");

    expect(data).toContain("getCampaigns(workspace.workspaceId)");
    expect(data).toContain("getInboxThreads(workspace.workspaceId)");
    expect(data).toContain("getInboxMessages(workspace.workspaceId)");
    expect(page).toContain("DashboardWorkspace");
    expect(component).toContain('aria-label="Campaign filter"');
    for (const label of ["Emails sent", "Opened", "Replied", "Bounced", "Reply funnel", "Needs your reply"]) {
      expect(component).toContain(label);
    }
    expect(component).not.toContain("No active campaigns");
    expect(component).not.toContain("No replies synced");
  });

  it("drops the reverse-chronological list cards that only restated other pages", async () => {
    const component = await source("components/dashboard/dashboard-workspace.tsx");

    expect(component).not.toContain("Recent events");
    expect(component).not.toContain("Latest replies");
    // The row-rendering machinery they needed should be gone with them.
    expect(component).not.toContain("EVENT_LABELS");
    expect(component).not.toContain("recentReplies");
  });

  it("backtracks every inbox figure to the folder it was counted from", async () => {
    const status = await source("components/dashboard/inbox-status.tsx");
    const page = await source("app/(app)/inbox/page.tsx");
    const workspace = await source("components/inbox/inbox-workspace.tsx");

    // Dashboard → a real Inbox folder, not just /inbox.
    expect(status).toContain("/inbox?folder=");
    expect(status).toContain("FOLDER_FOR_STATUS");

    // The Inbox has to honour that param rather than always opening on "inbox".
    expect(page).toContain("searchParams");
    expect(page).toContain("initialFolder={folder}");
    expect(workspace).toContain("folderFromParam(initialFolder)");
    // An unknown folder name must fall back instead of showing an empty tab.
    expect(workspace).toMatch(/FOLDERS\.some\(\(item\) => item\.key === value\)/);
  });

  it("shows every headline count as a rate of the same denominator", async () => {
    const component = await source("components/dashboard/dashboard-workspace.tsx");

    // One denominator — sent — so open, reply and bounce rates are comparable.
    for (const label of ["estimated open rate of", "reply rate of", "bounce rate of"]) {
      expect(component).toContain(label);
    }
    expect(component).toContain("rate(opened, sent)");
    expect(component).toContain("rate(replied, sent)");
    expect(component).toContain("rate(bounced, sent)");
  });

  it("charts sent, opened and replied per day with validated series colours", async () => {
    const chart = await source("components/dashboard/activity-chart.tsx");
    const styles = await source("app/styles/pages.css");

    // Grouped, not stacked: opens and replies are subsets of sends, so a stack
    // would imply a total that never happened.
    for (const key of ['key: "sent"', 'key: "opened"', 'key: "replied"']) {
      expect(chart).toContain(key);
    }
    expect(chart).toContain("chart-bar chart-bar-${series.key}");
    for (const cls of [".chart-bar-sent", ".chart-bar-opened", ".chart-bar-replied"]) {
      expect(styles).toContain(cls);
    }

    // The exact hexes the dataviz validator passed against Warmailer's surfaces.
    expect(styles).toContain("--series-sent: #d97757");
    expect(styles).toContain("--series-opened: #4a3aa7");
    expect(styles).toContain("--series-replied: #1baf7a");
    // Dark steps are selected for the dark band, not the light hexes reused.
    expect(styles).toContain("--series-sent: #d4744f");

    // Relief for the sub-3:1 light steps, and identity that is never colour alone.
    expect(chart).toContain("chart-legend");
    expect(chart).toContain("View as table");
    // 2px surface gap separates neighbouring bars instead of a stroke.
    expect(styles).toMatch(/\.chart-bars\s*\{[^}]*gap:\s*2px/);
    expect(styles).toMatch(/\.chart-bar\s*\{[^}]*border-radius:\s*4px 4px 0 0/);
  });

  it("does not show stale open-tracking setup copy after open events are wired", async () => {
    const component = await source("components/dashboard/dashboard-workspace.tsx");
    const detail = await source("components/campaigns/campaign-detail.tsx");

    for (const text of [component, detail]) {
      expect(text).not.toContain("tracking not configured yet");
      expect(text).not.toContain("Open tracking not configured yet");
      expect(text).not.toContain("Will count when tracking pixel is added.");
    }
  });

  it("keeps Inbox and Leads as full-page workspaces without header explainer copy", async () => {
    const inboxPage = await source("app/(app)/inbox/page.tsx");
    const leadsPage = await source("app/(app)/leads/page.tsx");
    const inbox = await source("components/inbox/inbox-workspace.tsx");
    const leads = await source("components/leads/leads-workspace.tsx");
    const styles = await source("app/styles/pages.css");

    expect(inboxPage).not.toContain("Every reply from every connected mailbox");
    expect(leadsPage).not.toContain("Every lead in this workspace");
    expect(inboxPage).toContain('className="page page-fit"');
    expect(inbox).toContain('className="workspace-full"');
    expect(leads).toContain('className="workspace-full"');
    expect(leadsPage).toContain('className="page page-fit"');
    expect(inbox).not.toContain('<Card>\n      <div className="inbox-toolbar">');
    expect(leads).not.toContain('<Card className="section">');
    expect(styles).toContain(".page-fit");
    // Derived from the topbar token, not a guessed constant that drifts when the
    // header changes size.
    expect(styles).toContain("height: calc(100dvh - var(--topbar-h))");
  });

  it("keeps the reply composer on screen however long the conversation is", async () => {
    const component = await source("components/inbox/inbox-workspace.tsx");
    const styles = await source("app/styles/pages.css");

    // The pane is three fixed bands; only the middle one scrolls, so the header
    // and the Send button can never be scrolled out of view.
    expect(styles).toMatch(/\.reading-pane\s*\{[^}]*grid-template-rows:\s*auto minmax\(0, 1fr\) auto/);
    expect(styles).toMatch(/\.message-trail\s*\{[^}]*overflow-y:\s*auto/);
    expect(styles).not.toMatch(/\.page-fit \.reading-pane\s*\{[^}]*overflow-y:\s*auto/);

    // Composer is a sibling of the trail, never nested inside it.
    const trailIndex = component.indexOf('<div className="message-trail">');
    const composerIndex = component.indexOf('<div className="composer">');
    expect(trailIndex).toBeGreaterThan(-1);
    expect(composerIndex).toBeGreaterThan(trailIndex);
  });

  it("aligns the inbox trail by sender direction and trims quoted reply history", async () => {
    const component = await source("components/inbox/inbox-workspace.tsx");
    const styles = await source("app/styles/pages.css");

    expect(component).toContain("message.direction === \"outbound\" ? \"message-card message-card-outbound\"");
    expect(component).toContain("cleanMessageBody");
    expect(component).toContain("/\\nOn .+ wrote:\\n/s");
    expect(styles).toContain(".message-card-outbound");
    expect(styles).toContain(".message-card-inbound");
    expect(styles).toContain("justify-self: end");
  });

  it("does not duplicate outbound messages that already belong to a thread in Sent", async () => {
    const component = await source("components/inbox/inbox-workspace.tsx");

    expect(component).toContain("hasOutbound");
    expect(component).toContain("!threads.some((thread) => belongsToThread(message, thread))");
    expect(component).toContain('if (folder === "sent") return item.hasOutbound');
  });

  it("lets real threads be archived or returned to inbox through the backend", async () => {
    const component = await source("components/inbox/inbox-workspace.tsx");
    const route = await source("app/api/inbox/status/route.ts");

    expect(component).toContain('fetch("/api/inbox/status"');
    expect(route).toContain("export async function PATCH");
    expect(route).toContain("archived");
    expect(route).toContain("revalidatePath(\"/inbox\")");
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
