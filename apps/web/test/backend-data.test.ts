import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getActiveWorkspace,
  getCampaignDetail,
  getInboxMessages,
  getLeads,
  getMailboxes,
  mapCampaignActivityRow,
  mapCampaignRow,
  mapInboxMessageRow,
  mapLeadRow,
  mapMailboxRow,
  parseDotenv,
  requireSupabaseConfig,
} from "../lib/backend-data";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("backend data mapping", () => {
  it("requires Supabase URL and a server-side key", () => {
    expect(() => requireSupabaseConfig({})).toThrow("Missing NEXT_PUBLIC_SUPABASE_URL");
    expect(() => requireSupabaseConfig({ NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co" })).toThrow(
      "Missing Supabase API key",
    );
  });

  it("parses the repo dotenv format without reading secrets into the client", () => {
    expect(parseDotenv("# comment\nNEXT_PUBLIC_SUPABASE_URL=https://project.supabase.co\nKEY='value'\n")).toEqual({
      NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
      KEY: "value",
    });
  });

  it("does not fall back to a static workspace without a logged-in user", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));

    await expect(getActiveWorkspace()).rejects.toThrow("Unauthenticated");
  });

  it("returns empty read data when Supabase is temporarily unreachable", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));

    await expect(getMailboxes("workspace_1")).resolves.toEqual([]);
  });

  it("maps database lead status to the frontend status label contract", () => {
    expect(
      mapLeadRow({
        lead_id: "lead_1",
        workspace_id: "workspace_1",
        source_file: "apollo.csv",
        name: "Jane Doe",
        job_title: "Owner",
        company: "MyMaidsPro",
        link: "https://linkedin.com/in/jane",
        location: "US",
        employees: "1-10",
        industry: "Cleaning",
        email: "jane@example.com",
        email_status: "found",
        created_at: "2026-08-12T00:00:00.000Z",
        updated_at: "2026-08-12T00:00:00.000Z",
      }),
    ).toMatchObject({ leadId: "lead_1", emailStatus: "email_found", source: "apify_primary" });
  });

  it("attaches upload lineage to leads from import rows", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          Response.json([
            {
              lead_id: "lead_1",
              workspace_id: "workspace_1",
              source_file: "apollo.csv",
              name: "Jane Doe",
              job_title: "Owner",
              company: "MyMaidsPro",
              link: "https://linkedin.com/in/jane",
              location: "US",
              employees: "1-10",
              industry: "Cleaning",
              email: "jane@example.com",
              email_status: "found",
              created_at: "2026-08-12T00:00:00.000Z",
              updated_at: "2026-08-12T00:00:00.000Z",
            },
          ]),
        )
        .mockResolvedValueOnce(Response.json([{ lead_id: "lead_1", import_id: "import_1" }])),
    );

    await expect(getLeads("workspace_1")).resolves.toMatchObject([{ leadId: "lead_1", importIds: ["import_1"] }]);
  });

  it("maps mailbox capacity from the database view without recomputing fake counters", () => {
    expect(
      mapMailboxRow({
        mailbox_id: "mailbox_1",
        workspace_id: "workspace_1",
        email_address: "sender@example.com",
        display_name: "Sender",
        status: "connected",
        daily_hard_limit: 100,
        hourly_hard_limit: 10,
        used_today: 40,
        reserved_today: 15,
        available_today: 45,
        sending_window_start: "09:00:00",
        sending_window_end: "17:00:00",
        timezone: "Asia/Kolkata",
        app_password_configured: true,
        created_at: "2026-08-12T00:00:00.000Z",
        updated_at: "2026-08-12T00:00:00.000Z",
      }),
    ).toMatchObject({ availableToday: 45, usedToday: 40, reservedToday: 15 });
  });

  it("maps campaign rows and campaign activity lineage", () => {
    expect(
      mapCampaignRow({
        campaign_id: "campaign_1",
        workspace_id: "workspace_1",
        name: "Owners",
        status: "sending",
        selected_lead_count: 4,
        selected_mailbox_count: 1,
        daily_capacity: 20,
        last_activity_at: null,
        created_at: "2026-08-12T00:00:00.000Z",
        updated_at: "2026-08-12T00:00:00.000Z",
      }),
    ).toMatchObject({ campaignId: "campaign_1", dailyCapacity: 20, sequence: [], mailboxIds: [] });

    expect(
      mapCampaignActivityRow({
        entity_id: "event_1",
        workspace_id: "workspace_1",
        campaign_id: "campaign_1",
        lead_id: "lead_1",
        mailbox_id: "mailbox_1",
        message_id: "message_1",
        event_type: "reply",
        occurred_at: "2026-08-12T00:00:00.000Z",
        source: "zoho_mail",
        created_at: "2026-08-12T00:00:00.000Z",
        updated_at: "2026-08-12T00:00:00.000Z",
      }),
    ).toMatchObject({ eventType: "replied", messageId: "message_1" });
  });

  it("maps inbox messages so the inbox can render the full email trail", () => {
    expect(
      mapInboxMessageRow({
        id: "message_1",
        workspace_id: "workspace_1",
        thread_id: "thread_1",
        campaign_id: "campaign_1",
        lead_id: "lead_1",
        mailbox_id: "mailbox_1",
        direction: "inbound",
        subject: "Re: Hi",
        body_text: "Full reply body",
        body_preview: "Full reply body",
        sent_at: null,
        received_at: "2026-08-13T08:00:00.000Z",
        created_at: "2026-08-13T08:00:00.000Z",
      }),
    ).toMatchObject({
      messageId: "message_1",
      threadId: "thread_1",
      campaignId: "campaign_1",
      direction: "inbound",
      bodyText: "Full reply body",
    });
  });

  it("loads inbox messages from the messages source table, not just thread previews", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        Response.json([
          {
            id: "message_1",
            workspace_id: "workspace_1",
            thread_id: "thread_1",
            campaign_id: "campaign_1",
            lead_id: "lead_1",
            mailbox_id: "mailbox_1",
            direction: "outbound",
            subject: "Hi",
            body_text: "Sent body",
            body_preview: "Sent body",
            sent_at: "2026-08-13T08:00:00.000Z",
            received_at: null,
            created_at: "2026-08-13T08:00:00.000Z",
          },
        ]),
      ),
    );

    await expect(getInboxMessages("workspace_1")).resolves.toMatchObject([{ direction: "outbound", bodyText: "Sent body" }]);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/rest/v1/messages?workspace_id=eq.workspace_1"),
      expect.any(Object),
    );
  });

  it("counts enrolled campaign leads on the detail model", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          Response.json([
            {
              campaign_id: "campaign_1",
              workspace_id: "workspace_1",
              name: "Owners",
              status: "scheduled",
              timezone: "Asia/Kolkata",
              start_date: "2026-08-13",
              sending_days: [1, 2, 3, 4, 5],
              sending_window_start: "13:16:00",
              sending_window_end: "14:15:00",
              per_mailbox_delay_seconds: 120,
              max_sends_per_day: 25,
              created_at: "2026-08-13T00:00:00.000Z",
              updated_at: "2026-08-13T00:00:00.000Z",
              last_activity_at: null,
            },
          ]),
        )
        .mockResolvedValueOnce(Response.json([]))
        .mockResolvedValueOnce(Response.json([{ mailbox_id: "mailbox_1" }]))
        .mockResolvedValueOnce(Response.json([{ lead_id: "lead_1" }, { lead_id: "lead_2" }, { lead_id: "lead_3" }]))
        .mockResolvedValueOnce(Response.json([]))
        .mockResolvedValueOnce(Response.json([]))
        .mockResolvedValueOnce(Response.json([])),
    );

    await expect(getCampaignDetail("workspace_1", "campaign_1")).resolves.toMatchObject({
      campaign: { selectedLeadCount: 3, selectedMailboxCount: 1 },
    });
  });
});
