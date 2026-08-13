import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { cache } from "react";

import { ACTIVE_WORKSPACE, type ActiveWorkspace } from "./workspace";
import type {
  Campaign,
  CampaignActivity,
  CampaignEventType,
  InboxThread,
  Lead,
  LeadImport,
  LeadStatus,
  LineageSource,
  Mailbox,
  SequenceStep,
} from "./types";

type Env = Record<string, string | undefined>;

type SupabaseConfig = {
  url: string;
  key: string;
};

let localEnvCache: Env | null = null;

type WorkspaceRow = {
  id: string;
  name: string;
};

type LeadRow = {
  lead_id: string;
  workspace_id: string;
  source_file: string | null;
  name: string;
  job_title: string | null;
  company: string | null;
  link: string | null;
  location: string | null;
  employees: string | null;
  industry: string | null;
  email: string | null;
  email_status: "not_enriched" | "queued" | "processing" | "found" | "not_found" | "failed";
  last_enriched_at?: string | null;
  created_at: string;
  updated_at: string;
};

type ImportRow = {
  id: string;
  workspace_id: string;
  source_file: string;
  status: "queued" | "running" | "completed" | "completed_with_errors" | "failed" | "cancelled";
  total_rows: number;
  inserted_rows: number;
  updated_rows: number;
  rejected_rows: number;
  created_at: string;
  completed_at: string | null;
};

type MailboxRow = {
  mailbox_id: string;
  workspace_id: string;
  email_address: string;
  display_name: string;
  status: Mailbox["status"];
  daily_hard_limit: number;
  hourly_hard_limit: number;
  used_today: number;
  reserved_today: number;
  available_today: number;
  sending_window_start: string;
  sending_window_end: string;
  timezone: string;
  app_password_configured: boolean;
  created_at: string;
  updated_at: string;
};

type CampaignRow = {
  campaign_id: string;
  workspace_id: string;
  name: string;
  status: Campaign["status"];
  selected_lead_count: number;
  selected_mailbox_count: number;
  daily_capacity: number;
  last_activity_at: string | null;
  created_at: string;
  updated_at: string;
};

type CampaignDetailRow = {
  campaign_id: string;
  workspace_id: string;
  name: string;
  status: Campaign["status"];
  timezone: string;
  start_date: string | null;
  sending_days: number[] | null;
  sending_window_start: string;
  sending_window_end: string;
  per_mailbox_delay_seconds: number;
  max_sends_per_day: number;
  created_at: string;
  updated_at: string;
  last_activity_at: string | null;
};

type SequenceRow = {
  id: string;
  step_order: number;
  subject: string;
  body: string;
  delay_days: number;
};

type CampaignMailboxRow = {
  mailbox_id: string;
};

type CampaignLeadRow = {
  lead_id: string;
};

type CampaignActivityRow = {
  entity_id: string;
  workspace_id: string;
  campaign_id: string;
  lead_id: string | null;
  mailbox_id: string | null;
  message_id: string | null;
  event_type: string;
  occurred_at: string;
  source: LineageSource;
  created_at: string;
  updated_at: string;
};

type InboxThreadRow = {
  thread_id: string;
  workspace_id: string;
  mailbox_id: string;
  lead_id: string | null;
  campaign_id: string | null;
  message_id: string | null;
  from_email: string;
  subject: string;
  last_message_at: string;
  status: InboxThread["status"];
  preview: string;
  created_at: string;
  updated_at: string;
};

export function parseDotenv(text: string): Env {
  return Object.fromEntries(
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const index = line.indexOf("=");
        const key = line.slice(0, index).trim();
        let value = line.slice(index + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        return [key, value];
      }),
  );
}

function localEnv(): Env {
  if (localEnvCache) return localEnvCache;

  const initCwd = process.env.INIT_CWD;
  const files = [
    join(process.cwd(), ".env.local"),
    join(process.cwd(), "..", "..", ".env.local"),
    ...(initCwd ? [join(initCwd, ".env.local")] : []),
  ];

  for (const file of files) {
    if (existsSync(/* turbopackIgnore: true */ file)) {
      localEnvCache = parseDotenv(readFileSync(/* turbopackIgnore: true */ file, "utf8"));
      return localEnvCache;
    }
  }

  localEnvCache = {};
  return localEnvCache;
}

export function envValue(name: string, env: Env = process.env): string | undefined {
  return env[name] ?? (env === process.env ? localEnv()[name] : undefined);
}

export function requireSupabaseConfig(env: Env = process.env): SupabaseConfig {
  const url = envValue("NEXT_PUBLIC_SUPABASE_URL", env);
  if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");

  const key =
    envValue("SUPABASE_SERVICE_ROLE_KEY", env) ??
    envValue("SUPABASE_SECRET_KEY", env) ??
    envValue("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", env) ??
    envValue("NEXT_PUBLIC_SUPABASE_ANON_KEY", env);
  if (!key) throw new Error("Missing Supabase API key");

  return { url: url.replace(/\/$/, ""), key };
}

async function rest<T>(path: string): Promise<T> {
  const { url, key } = requireSupabaseConfig();
  let response: Response;

  try {
    response = await fetch(`${url}/rest/v1/${path}`, {
      cache: "no-store",
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
      },
    });
  } catch {
    // ponytail: keep local pages open during temporary Supabase/network outages; add a visible ops banner when UX matters.
    return [] as T;
  }

  if (!response.ok) {
    throw new Error(`Supabase request failed: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as T;
}

function cleanTime(value: string): string {
  return value.slice(0, 5);
}

function eventType(value: string): CampaignEventType {
  const map: Record<string, CampaignEventType> = {
    queued: "scheduled",
    smtp_accepted: "sent",
    delivery_unknown: "delivered",
    open: "opened",
    reply: "replied",
    bounce: "bounced",
    scheduled: "scheduled",
    paused: "paused",
    resumed: "resumed",
    stopped: "stopped",
    failed: "stopped",
    suppressed: "stopped",
    unsubscribe: "replied",
    click: "opened",
  };
  return map[value] ?? "scheduled";
}

export function mapLeadRow(row: LeadRow): Lead {
  const emailStatus: LeadStatus = row.email_status === "found" ? "email_found" : row.email_status;
  return {
    workspaceId: row.workspace_id,
    source: row.email_status === "found" ? "apify_primary" : "apollo_csv",
    entityId: row.lead_id,
    leadId: row.lead_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    name: row.name,
    jobTitle: row.job_title ?? "",
    company: row.company ?? "",
    link: row.link ?? "",
    location: row.location ?? "",
    employees: row.employees ?? "",
    industry: row.industry ?? "",
    email: row.email ?? undefined,
    emailStatus,
    sourceFile: row.source_file ?? "",
  };
}

export function mapImportRow(row: ImportRow): LeadImport {
  return {
    workspaceId: row.workspace_id,
    source: "apollo_csv",
    entityId: row.id,
    importId: row.id,
    createdAt: row.created_at,
    updatedAt: row.completed_at ?? row.created_at,
    fileName: row.source_file,
    rowCount: row.total_rows,
    importedCount: row.inserted_rows + row.updated_rows,
    duplicateCount: Math.max(0, row.total_rows - row.inserted_rows - row.updated_rows - row.rejected_rows),
    status: row.status === "completed" ? "completed" : row.status === "failed" ? "failed" : "importing",
  };
}

export function mapMailboxRow(row: MailboxRow): Mailbox {
  return {
    workspaceId: row.workspace_id,
    source: "zoho_mail",
    entityId: row.mailbox_id,
    mailboxId: row.mailbox_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    emailAddress: row.email_address,
    displayName: row.display_name,
    status: row.status,
    dailyHardLimit: row.daily_hard_limit,
    hourlyHardLimit: row.hourly_hard_limit,
    usedToday: row.used_today,
    reservedToday: row.reserved_today,
    availableToday: row.available_today,
    sendingWindowStart: cleanTime(row.sending_window_start),
    sendingWindowEnd: cleanTime(row.sending_window_end),
    timezone: row.timezone,
    appPasswordConfigured: row.app_password_configured,
  };
}

export function mapCampaignRow(row: CampaignRow): Campaign {
  return {
    workspaceId: row.workspace_id,
    source: "user_action",
    entityId: row.campaign_id,
    campaignId: row.campaign_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    name: row.name,
    status: row.status,
    selectedLeadCount: row.selected_lead_count,
    selectedMailboxCount: row.selected_mailbox_count,
    dailyCapacity: row.daily_capacity,
    lastActivityAt: row.last_activity_at,
    mailboxIds: [],
    sequence: [],
    schedule: {
      startDate: "",
      sendingDays: [],
      windowStart: "09:00",
      windowEnd: "17:00",
      perMailboxDelaySeconds: 120,
      maxSendsPerDay: Math.max(1, row.daily_capacity),
      timezone: "UTC",
    },
  };
}

function mapCampaignDetail(row: CampaignDetailRow, sequence: SequenceStep[], mailboxIds: string[]): Campaign {
  return {
    ...mapCampaignRow({
      campaign_id: row.campaign_id,
      workspace_id: row.workspace_id,
      name: row.name,
      status: row.status,
      selected_lead_count: 0,
      selected_mailbox_count: mailboxIds.length,
      daily_capacity: 0,
      last_activity_at: row.last_activity_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }),
    mailboxIds,
    sequence,
    schedule: {
      startDate: row.start_date ?? "",
      sendingDays: row.sending_days ?? [],
      windowStart: cleanTime(row.sending_window_start),
      windowEnd: cleanTime(row.sending_window_end),
      perMailboxDelaySeconds: row.per_mailbox_delay_seconds,
      maxSendsPerDay: row.max_sends_per_day,
      timezone: row.timezone,
    },
  };
}

export function mapCampaignActivityRow(row: CampaignActivityRow): CampaignActivity {
  return {
    workspaceId: row.workspace_id,
    source: row.source,
    entityId: row.entity_id,
    campaignId: row.campaign_id,
    leadId: row.lead_id ?? undefined,
    mailboxId: row.mailbox_id ?? undefined,
    messageId: row.message_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    eventType: eventType(row.event_type),
    occurredAt: row.occurred_at,
  };
}

export function mapInboxThreadRow(row: InboxThreadRow): InboxThread {
  return {
    workspaceId: row.workspace_id,
    source: "zoho_mail",
    entityId: row.thread_id,
    threadId: row.thread_id,
    mailboxId: row.mailbox_id,
    leadId: row.lead_id ?? undefined,
    campaignId: row.campaign_id ?? undefined,
    messageId: row.message_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    fromEmail: row.from_email,
    subject: row.subject,
    lastMessageAt: row.last_message_at,
    status: row.status,
    preview: row.preview,
  };
}

export const getActiveWorkspace = cache(async (): Promise<ActiveWorkspace> => {
  const params = new URLSearchParams({
    select: "id,name",
    name: `ilike.${ACTIVE_WORKSPACE.name}`,
    limit: "1",
  });
  let workspace: WorkspaceRow | undefined;

  try {
    const preferred = await rest<WorkspaceRow[]>(`workspaces?${params}`);
    workspace = preferred[0] ?? (await rest<WorkspaceRow[]>("workspaces?select=id,name&limit=1"))[0];
  } catch {
    // Keep local/dev pages usable when Supabase is temporarily unreachable.
  }

  return {
    workspaceId: workspace?.id ?? ACTIVE_WORKSPACE.workspaceId,
    name: workspace?.name ?? ACTIVE_WORKSPACE.name,
    role: ACTIVE_WORKSPACE.role,
    userInitials: ACTIVE_WORKSPACE.userInitials,
  };
});

export async function getDashboardData() {
  const workspace = await getActiveWorkspace();
  const [overview] = await rest<
    {
      imported_count: number;
      email_found_count: number;
      enrichment_eligible_count: number;
      connected_mailbox_count: number;
      send_capacity_today: number;
      active_campaign_count: number;
      unread_thread_count: number;
    }[]
  >(`dashboard_overview?workspace_id=eq.${workspace.workspaceId}&select=*&limit=1`);
  const [mailboxes, activity] = await Promise.all([getMailboxes(workspace.workspaceId), getCampaignActivity(workspace.workspaceId)]);

  return { workspace, overview, mailboxes, activity };
}

export async function getLeads(workspaceId: string) {
  const rows = await rest<LeadRow[]>(
    `lead_list?workspace_id=eq.${workspaceId}&select=*&order=created_at.desc&limit=500`,
  );
  return rows.map(mapLeadRow);
}

export async function getImports(workspaceId: string) {
  const rows = await rest<ImportRow[]>(
    `lead_imports?workspace_id=eq.${workspaceId}&select=*&order=created_at.desc&limit=50`,
  );
  return rows.map(mapImportRow);
}

export async function getMailboxes(workspaceId: string) {
  const rows = await rest<MailboxRow[]>(
    `mailbox_capacity?workspace_id=eq.${workspaceId}&select=*&order=created_at.desc`,
  );
  return rows.map(mapMailboxRow);
}

export async function getCampaigns(workspaceId: string) {
  const rows = await rest<CampaignRow[]>(
    `campaign_list?workspace_id=eq.${workspaceId}&select=*&order=updated_at.desc`,
  );
  return rows.map(mapCampaignRow);
}

export async function getCampaignDetail(workspaceId: string, campaignId: string) {
  const [rows, sequenceRows, mailboxRows, campaignLeadRows, leadRows, mailboxes, activity] = await Promise.all([
    rest<CampaignDetailRow[]>(
      `campaign_detail?workspace_id=eq.${workspaceId}&campaign_id=eq.${campaignId}&select=*&limit=1`,
    ),
    rest<SequenceRow[]>(
      `campaign_sequence_steps?workspace_id=eq.${workspaceId}&campaign_id=eq.${campaignId}&select=*&order=step_order.asc`,
    ),
    rest<CampaignMailboxRow[]>(
      `campaign_mailboxes?workspace_id=eq.${workspaceId}&campaign_id=eq.${campaignId}&select=mailbox_id`,
    ),
    rest<CampaignLeadRow[]>(
      `campaign_leads?workspace_id=eq.${workspaceId}&campaign_id=eq.${campaignId}&select=lead_id`,
    ),
    rest<LeadRow[]>(`lead_list?workspace_id=eq.${workspaceId}&select=*&limit=500`),
    getMailboxes(workspaceId),
    getCampaignActivity(workspaceId, campaignId),
  ]);

  const row = rows[0];
  if (!row) return null;

  const sequence = sequenceRows.map((step) => ({
    stepId: step.id,
    subject: step.subject,
    body: step.body,
    delayDays: step.delay_days,
  }));
  const mailboxIds = mailboxRows.map((mailbox) => mailbox.mailbox_id);
  const leadIds = new Set(campaignLeadRows.map((lead) => lead.lead_id));
  const campaign = mapCampaignDetail(row, sequence, mailboxIds);
  const selectedMailboxes = mailboxes.filter((mailbox) => mailboxIds.includes(mailbox.mailboxId));
  const leads = leadRows.filter((lead) => leadIds.has(lead.lead_id)).map(mapLeadRow);

  return { campaign, leads, mailboxes: selectedMailboxes, activity };
}

export async function getCampaignActivity(workspaceId: string, campaignId?: string) {
  const campaignFilter = campaignId ? `&campaign_id=eq.${campaignId}` : "";
  const rows = await rest<CampaignActivityRow[]>(
    `campaign_activity?workspace_id=eq.${workspaceId}${campaignFilter}&select=*&order=occurred_at.desc&limit=200`,
  );
  return rows.map(mapCampaignActivityRow);
}

export async function getInboxThreads(workspaceId: string) {
  const rows = await rest<InboxThreadRow[]>(
    `inbox_thread_list?workspace_id=eq.${workspaceId}&select=*&order=last_message_at.desc&limit=200`,
  );
  return rows.map(mapInboxThreadRow);
}
