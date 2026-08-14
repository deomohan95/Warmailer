import { describe, expect, it } from "vitest";

import {
  CampaignStatusSchema,
  CampaignCreateInputSchema,
  CampaignListItemSchema,
  DashboardOverviewSchema,
  EmailStatusSchema,
  JobStatusSchema,
  LeadListQuerySchema,
  MailboxCreateInputSchema,
  MailboxStatusSchema,
  LeadSelectionSchema,
  MessageDirectionSchema,
  MessageEventTypeSchema,
  InboxThreadListItemSchema,
  WarmupMailboxUpdateInputSchema,
  WarmupSeedCreateInputSchema,
  WorkspaceRoleSchema,
} from "../src/index";

describe("Warmailer shared contracts", () => {
  it("exports the frozen status enums used across workers and the app", () => {
    expect(JobStatusSchema.options).toEqual([
      "queued",
      "running",
      "completed",
      "completed_with_errors",
      "failed",
      "cancelled",
    ]);
    expect(WorkspaceRoleSchema.options).toEqual(["owner", "admin", "member"]);
    expect(EmailStatusSchema.options).toEqual(["not_enriched", "queued", "processing", "found", "not_found", "failed"]);
    expect(MailboxStatusSchema.options).toEqual(["not_connected", "connected", "warming", "sending_paused", "error"]);
    expect(CampaignStatusSchema.options).toEqual([
      "draft",
      "scheduled",
      "sending",
      "paused",
      "completed",
      "failed",
    ]);
    expect(MessageDirectionSchema.options).toEqual(["inbound", "outbound"]);
    expect(MessageEventTypeSchema.options).toEqual([
      "queued",
      "smtp_accepted",
      "delivery_unknown",
      "open",
      "click",
      "reply",
      "bounce",
      "unsubscribe",
      "failed",
      "suppressed",
    ]);
  });

  it("accepts lead list filters without accepting a browser workspace id", () => {
    expect(LeadListQuerySchema.parse({ search: "ops", emailStatus: "found", pageSize: 50 })).toEqual({
      search: "ops",
      emailStatus: "found",
      pageSize: 50,
    });
    expect(() => LeadListQuerySchema.parse({ workspaceId: "browser_ws", search: "ops" })).toThrow();
    expect(() => LeadListQuerySchema.parse({ pageSize: 501 })).toThrow();
  });

  it("describes the dashboard numbers that pages may render", () => {
    expect(
      DashboardOverviewSchema.parse({
        workspaceId: "ws_mymaidspro",
        importedCount: 10,
        emailFoundCount: 4,
        enrichmentEligibleCount: 6,
        connectedMailboxCount: 2,
        sendCapacityToday: 80,
        activeCampaignCount: 0,
        unreadThreadCount: 0,
      }),
    ).toMatchObject({ workspaceId: "ws_mymaidspro", sendCapacityToday: 80 });

    expect(() => DashboardOverviewSchema.parse({ workspaceId: "ws_mymaidspro", importedCount: -1 })).toThrow();
  });

  it("accepts mailbox connection input without accepting browser-owned capacity counters", () => {
    expect(
      MailboxCreateInputSchema.parse({
        emailAddress: "sender@example.com",
        displayName: "Sales Sender",
        appPassword: "zoho-app-password",
        zohoRegion: "in",
        dailyHardLimit: 75,
        hourlyHardLimit: 12,
        sendingWindowStart: "09:00",
        sendingWindowEnd: "17:30",
        timezone: "Asia/Kolkata",
      }),
    ).toMatchObject({ emailAddress: "sender@example.com", dailyHardLimit: 75 });

    expect(() =>
      MailboxCreateInputSchema.parse({
        emailAddress: "sender@example.com",
        appPassword: "zoho-app-password",
        dailyHardLimit: 75,
        hourlyHardLimit: 12,
        usedToday: 40,
        reservedToday: 10,
      }),
    ).toThrow();
  });

  it("accepts warmup settings and seed registration without browser workspace ids", () => {
    expect(
      WarmupMailboxUpdateInputSchema.parse({
        mailboxId: "mailbox_1",
        warmupEnabled: true,
        warmupDailyLimit: 25,
        warmupDailyRampup: 5,
        warmupRandomizeDailyCount: true,
        warmupReplyRatePercent: 20,
      }),
    ).toMatchObject({ mailboxId: "mailbox_1", warmupReplyRatePercent: 20 });

    expect(
      WarmupSeedCreateInputSchema.parse({
        emailAddress: "Seed@Gmail.com",
        composioUserId: "seed-user",
        composioConnectedAccountId: "ca_seed",
      }),
    ).toMatchObject({ emailAddress: "seed@gmail.com" });

    expect(() =>
      WarmupMailboxUpdateInputSchema.parse({
        mailboxId: "mailbox_1",
        workspaceId: "browser_ws",
        warmupEnabled: true,
        warmupDailyLimit: 25,
        warmupDailyRampup: 5,
        warmupRandomizeDailyCount: true,
        warmupReplyRatePercent: 101,
      }),
    ).toThrow();
  });

  it("accepts explicit lead IDs or a saved filter token, but not browser workspace IDs", () => {
    expect(LeadSelectionSchema.parse({ leadIds: ["lead_1", "lead_2"] })).toEqual({
      leadIds: ["lead_1", "lead_2"],
    });
    expect(LeadSelectionSchema.parse({ filterToken: "flt_123", excludedLeadIds: ["lead_3"] })).toEqual({
      filterToken: "flt_123",
      excludedLeadIds: ["lead_3"],
    });

    expect(() => LeadSelectionSchema.parse({ workspaceId: "workspace_from_browser", leadIds: ["lead_1"] })).toThrow();
    expect(() => LeadSelectionSchema.parse({ filterToken: "flt_123" })).toThrow();
  });

  it("accepts campaign creation input without accepting browser-owned counters", () => {
    expect(
      CampaignCreateInputSchema.parse({
        name: "MyMaidsPro founders",
        timezone: "Asia/Kolkata",
        leadIds: ["lead_1"],
        mailboxIds: ["mailbox_1"],
        sequence: [{ subject: "Quick question", body: "Hi {{first_name}}", delayDays: 0 }],
        schedule: {
          startDate: "2026-08-13",
          sendingDays: [1, 2, 3, 4, 5],
          windowStart: "09:00",
          windowEnd: "17:00",
          perMailboxDelaySeconds: 120,
          maxSendsPerDay: 50,
        },
      }),
    ).toMatchObject({ name: "MyMaidsPro founders", mailboxIds: ["mailbox_1"] });

    expect(() =>
      CampaignCreateInputSchema.parse({
        name: "Bad campaign",
        workspaceId: "browser_ws",
        dailyCapacity: 9999,
      }),
    ).toThrow();
  });

  it("describes campaign list items and inbox threads with lineage IDs", () => {
    expect(
      CampaignListItemSchema.parse({
        campaignId: "campaign_1",
        workspaceId: "ws_mymaidspro",
        name: "MyMaidsPro owners",
        status: "draft",
        selectedLeadCount: 10,
        selectedMailboxCount: 2,
        dailyCapacity: 80,
        lastActivityAt: null,
      }),
    ).toMatchObject({ campaignId: "campaign_1", dailyCapacity: 80 });

    expect(
      InboxThreadListItemSchema.parse({
        threadId: "thread_1",
        workspaceId: "ws_mymaidspro",
        mailboxId: "mailbox_1",
        leadId: "lead_1",
        campaignId: "campaign_1",
        messageId: "message_1",
        fromEmail: "reply@example.com",
        subject: "Re: Quick question",
        lastMessageAt: "2026-08-12T10:00:00.000Z",
        status: "unread",
        preview: "Interested",
      }),
    ).toMatchObject({ campaignId: "campaign_1", mailboxId: "mailbox_1" });
  });
});
