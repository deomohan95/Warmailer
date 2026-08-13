import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { envValue, getActiveWorkspace } from "../../../lib/backend-data";
import { campaignDailyCapacity, launchBlockers } from "../../../lib/capacity";
import type { CampaignSchedule, Mailbox, SequenceStep } from "../../../lib/types";

export const runtime = "nodejs";

type CampaignInput = {
  name?: string;
  leadIds?: string[];
  mailboxIds?: string[];
  sequence?: SequenceStep[];
  schedule?: CampaignSchedule;
};

type LeadRow = {
  lead_id: string;
  email: string | null;
  email_status: "not_enriched" | "queued" | "processing" | "found" | "not_found" | "failed";
};

type MailboxRow = {
  mailbox_id: string;
  email_address: string;
  status: Mailbox["status"];
  daily_hard_limit: number;
  hourly_hard_limit: number;
  used_today: number;
  reserved_today: number;
  available_today: number;
  sending_window_start: string;
  sending_window_end: string;
  timezone: string;
};

export async function POST(request: Request) {
  try {
    const input = validate(await request.json());
    const workspace = await getActiveWorkspace();
    const [leads, mailboxes] = await Promise.all([
      supabaseGet<LeadRow[]>(
        `lead_list?workspace_id=eq.${workspace.workspaceId}&lead_id=in.(${input.leadIds.join(",")})&select=lead_id,email,email_status`,
      ),
      supabaseGet<MailboxRow[]>(
        `mailbox_capacity?workspace_id=eq.${workspace.workspaceId}&mailbox_id=in.(${input.mailboxIds.join(",")})&select=*`,
      ),
    ]);

    if (leads.length !== input.leadIds.length) throw new Error("One or more selected leads no longer exist.");
    if (mailboxes.length !== input.mailboxIds.length) throw new Error("One or more selected mailboxes no longer exist.");

    const selectedMailboxes = mailboxes.map((mailbox) => ({
      mailboxId: mailbox.mailbox_id,
      emailAddress: mailbox.email_address,
      status: mailbox.status,
      dailyHardLimit: mailbox.daily_hard_limit,
      hourlyHardLimit: mailbox.hourly_hard_limit,
      usedToday: mailbox.used_today,
      reservedToday: mailbox.reserved_today,
      availableToday: mailbox.available_today,
      sendingWindowStart: mailbox.sending_window_start,
      sendingWindowEnd: mailbox.sending_window_end,
      timezone: mailbox.timezone,
    }));
    const blockers = launchBlockers({
      eligibleLeadCount: leads.filter((lead) => lead.email && lead.email_status === "found").length,
      selectedMailboxes,
      sequence: input.sequence,
      schedule: input.schedule,
    });
    if (blockers.length > 0) throw new Error(blockers.map((blocker) => blocker.message).join(" "));

    const campaignId = randomUUID();
    const now = new Date().toISOString();

    await supabasePost("campaigns", {
      id: campaignId,
      workspace_id: workspace.workspaceId,
      name: input.name || "Untitled campaign",
      status: "scheduled",
      timezone: input.schedule.timezone,
      start_date: input.schedule.startDate,
      sending_days: input.schedule.sendingDays,
      sending_window_start: input.schedule.windowStart,
      sending_window_end: input.schedule.windowEnd,
      per_mailbox_delay_seconds: input.schedule.perMailboxDelaySeconds,
      max_sends_per_day: input.schedule.maxSendsPerDay,
      created_at: now,
      updated_at: now,
      last_activity_at: now,
    });
    await Promise.all([
      supabasePost(
        "campaign_leads",
        input.leadIds.map((leadId) => ({
          workspace_id: workspace.workspaceId,
          campaign_id: campaignId,
          lead_id: leadId,
          status: "selected",
          created_at: now,
          updated_at: now,
        })),
      ),
      supabasePost(
        "campaign_mailboxes",
        input.mailboxIds.map((mailboxId) => ({
          workspace_id: workspace.workspaceId,
          campaign_id: campaignId,
          mailbox_id: mailboxId,
          created_at: now,
        })),
      ),
      supabasePost(
        "campaign_sequence_steps",
        input.sequence.map((step, index) => ({
          workspace_id: workspace.workspaceId,
          campaign_id: campaignId,
          step_order: index,
          subject: step.subject,
          body: step.body,
          delay_days: step.delayDays,
          created_at: now,
          updated_at: now,
        })),
      ),
      supabasePost("campaign_events", {
        workspace_id: workspace.workspaceId,
        campaign_id: campaignId,
        event_type: "scheduled",
        source: "user_action",
        metadata: {
          leadCount: input.leadIds.length,
          mailboxCount: input.mailboxIds.length,
          dailyCapacity: campaignDailyCapacity(selectedMailboxes),
        },
        created_at: now,
      }),
    ]);

    revalidatePath("/");
    revalidatePath("/campaigns");
    revalidatePath(`/campaigns/${campaignId}`);
    await triggerImmediateSend(request.url);

    return NextResponse.json({ campaignId });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Campaign launch failed" }, { status: 400 });
  }
}

function validate(input: CampaignInput) {
  const leadIds = [...new Set(input.leadIds ?? [])].map(String).filter(Boolean);
  const mailboxIds = [...new Set(input.mailboxIds ?? [])].map(String).filter(Boolean);
  const sequence = (input.sequence ?? []).filter((step) => step.body.trim());
  const schedule = input.schedule;

  if (leadIds.length === 0) throw new Error("Select at least one lead with an email.");
  if (mailboxIds.length === 0) throw new Error("Select at least one mailbox.");
  if (sequence.length === 0) throw new Error("Write at least one email.");
  if (!schedule) throw new Error("Schedule is required.");

  return {
    name: String(input.name ?? "").trim(),
    leadIds,
    mailboxIds,
    sequence,
    schedule,
  };
}

export async function triggerImmediateSend(requestUrl: string) {
  const secret = envValue("CRON_SECRET");
  if (!secret) return;
  const url = new URL("/api/cron/send", requestUrl);
  await fetch(url.toString(), { headers: { authorization: `Bearer ${secret}` } }).catch(() => {});
}

async function supabaseGet<T>(path: string): Promise<T> {
  const response = await supabaseFetch(path, { method: "GET" });
  return (await response.json()) as T;
}

async function supabasePost(table: string, body: unknown) {
  await supabaseFetch(table, {
    method: "POST",
    headers: { "content-type": "application/json", prefer: "return=minimal" },
    body: JSON.stringify(body),
  });
}

async function supabaseFetch(path: string, init: RequestInit) {
  const url = envValue("NEXT_PUBLIC_SUPABASE_URL")?.replace(/\/$/, "");
  const key = envValue("SUPABASE_SERVICE_ROLE_KEY") ?? envValue("SUPABASE_SECRET_KEY");
  if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  if (!key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) throw new Error((await response.text()) || `Supabase request failed: ${response.status}`);
  return response;
}
