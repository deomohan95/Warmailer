import { envValue } from "./backend-data";
import type { WarmupMailboxStats, WarmupSeedAccount } from "./types";

type WarmupStatsRow = {
  workspace_id: string;
  mailbox_id: string;
  email_address: string;
  warmup_enabled: boolean;
  warmup_daily_limit: number;
  warmup_daily_rampup: number;
  warmup_randomize_daily_count: boolean;
  warmup_random_min_percent: number;
  warmup_reply_rate_percent: number;
  warmup_inbound_original_percent: number;
  warmup_inbound_reply_rate_percent: number;
  warmup_started_at: string | null;
  sent_today: number;
  warmup_raw_target_today: number;
  warmup_target_today: number;
  sent_7d: number;
  received_7d: number;
  inbox_7d: number;
  spam_7d: number;
  saved_from_spam_7d: number;
  replied_7d: number;
  reputation: number | null;
};

type WarmupSeedRow = {
  id: string;
  workspace_id: string;
  provider: "gmail";
  email_address: string;
  status: "connected" | "disabled" | "error";
  last_checked_at: string | null;
  created_at: string;
  updated_at: string;
};

async function rest<T>(path: string): Promise<T> {
  const url = envValue("NEXT_PUBLIC_SUPABASE_URL")?.replace(/\/$/, "");
  const key =
    envValue("SUPABASE_SERVICE_ROLE_KEY") ??
    envValue("SUPABASE_SECRET_KEY") ??
    envValue("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") ??
    envValue("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!url || !key) return [] as T;

  try {
    const response = await fetch(`${url}/rest/v1/${path}`, {
      cache: "no-store",
      headers: { apikey: key, authorization: `Bearer ${key}` },
    });
    if (!response.ok) return [] as T;
    return (await response.json()) as T;
  } catch {
    return [] as T;
  }
}

export function mapWarmupStatsRow(row: WarmupStatsRow): WarmupMailboxStats {
  const time = row.warmup_started_at ?? new Date(0).toISOString();
  return {
    workspaceId: row.workspace_id,
    source: "system",
    entityId: row.mailbox_id,
    mailboxId: row.mailbox_id,
    emailAddress: row.email_address,
    warmupEnabled: row.warmup_enabled,
    warmupDailyLimit: row.warmup_daily_limit,
    warmupDailyRampup: row.warmup_daily_rampup,
    warmupRandomizeDailyCount: row.warmup_randomize_daily_count,
    warmupRandomMinPercent: row.warmup_random_min_percent,
    warmupReplyRatePercent: row.warmup_reply_rate_percent,
    warmupInboundOriginalPercent: row.warmup_inbound_original_percent,
    warmupInboundReplyRatePercent: row.warmup_inbound_reply_rate_percent,
    warmupStartedAt: row.warmup_started_at ?? undefined,
    sentToday: row.sent_today,
    warmupRawTargetToday: row.warmup_raw_target_today,
    warmupTargetToday: row.warmup_target_today,
    sent7d: row.sent_7d,
    received7d: row.received_7d,
    inbox7d: row.inbox_7d,
    spam7d: row.spam_7d,
    savedFromSpam7d: row.saved_from_spam_7d,
    replied7d: row.replied_7d,
    reputation: row.reputation,
    createdAt: time,
    updatedAt: time,
  };
}

export function mapWarmupSeedRow(row: WarmupSeedRow): WarmupSeedAccount {
  return {
    workspaceId: row.workspace_id,
    source: "user_action",
    entityId: row.id,
    seedAccountId: row.id,
    provider: row.provider,
    emailAddress: row.email_address,
    status: row.status,
    lastCheckedAt: row.last_checked_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getWarmupMailboxStats(workspaceId: string) {
  const id = encodeURIComponent(workspaceId);
  const rows = await rest<WarmupStatsRow[]>(`warmup_mailbox_stats?workspace_id=eq.${id}&select=*&order=email_address.asc`);
  return rows.map(mapWarmupStatsRow);
}

export async function getWarmupSeeds(workspaceId: string) {
  const id = encodeURIComponent(workspaceId);
  const rows = await rest<WarmupSeedRow[]>(`warmup_seed_accounts?workspace_id=eq.${id}&select=*&order=created_at.desc`);
  return rows.map(mapWarmupSeedRow);
}
