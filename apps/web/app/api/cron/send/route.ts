import { createDecipheriv } from "node:crypto";

import { NextResponse } from "next/server";
import nodemailer from "nodemailer";

import { sendDueCampaigns } from "../../../../../worker/src/campaign-mailer.mjs";
import { envValue } from "../../../../lib/backend-data";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const runtime = "nodejs";

type MailboxSecret = {
  nonce: string;
  ciphertext: string;
  authTag: string;
};

type SendPayload = {
  host?: string;
  port?: number;
  user: string;
  pass: string;
  from: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
};

type SendConfig = {
  supabaseUrl: string;
  supabaseKey: string;
  encryptionKey: Buffer;
  trackingBaseUrl: string;
  trackingHmacKey: Buffer;
  smtpHost: string;
  smtpPort: number;
};

type MailboxRow = Record<string, unknown> & {
  id: string;
  smtp_host?: string | null;
  smtp_port?: number | null;
};

export async function GET(request: Request) {
  const secret = envValue("CRON_SECRET");
  if (!secret) return NextResponse.json({ error: "Missing CRON_SECRET" }, { status: 500 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const config = loadSendConfig();
  const summary = await sendDueCampaigns({
    db: supabaseDb(config),
    limit: 1,
    decryptSecret: (encrypted: MailboxSecret, mailboxId: string) => decryptSecret(encrypted, config.encryptionKey, mailboxId),
    tracking: { baseUrl: config.trackingBaseUrl, hmacKey: config.trackingHmacKey },
    sendMail: (payload: SendPayload) => sendSmtp(payload, config),
  });

  return NextResponse.json(summary);
}

export function loadSendConfig(env: Record<string, string | undefined> = process.env): SendConfig {
  const supabaseUrl = envValue("NEXT_PUBLIC_SUPABASE_URL", env)?.replace(/\/$/, "");
  const supabaseKey = envValue("SUPABASE_SERVICE_ROLE_KEY", env) ?? envValue("SUPABASE_SECRET_KEY", env);
  const trackingBaseUrl = envValue("TRACKING_BASE_URL", env)?.replace(/\/$/, "");
  const config = {
    supabaseUrl,
    supabaseKey,
    encryptionKey: Buffer.from(envValue("WORKER_ENCRYPTION_KEY", env) ?? "", "base64"),
    trackingBaseUrl,
    trackingHmacKey: Buffer.from(envValue("TRACKING_HMAC_KEY", env) ?? "", "base64"),
    smtpHost: envValue("ZOHO_SMTP_HOST", env) ?? "smtp.zoho.com",
    smtpPort: Number(envValue("ZOHO_SMTP_PORT", env) ?? 465),
  };

  if (!config.supabaseUrl) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  if (!config.supabaseKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  if (!config.trackingBaseUrl) throw new Error("Missing TRACKING_BASE_URL");
  if (config.encryptionKey.length !== 32) throw new Error("Missing WORKER_ENCRYPTION_KEY");
  if (config.trackingHmacKey.length !== 32) throw new Error("Missing TRACKING_HMAC_KEY");
  return config as SendConfig;
}

function supabaseDb(config: SendConfig) {
  const headers = {
    apikey: config.supabaseKey,
    authorization: `Bearer ${config.supabaseKey}`,
    "content-type": "application/json",
  } satisfies Record<string, string>;
  const request = async (path: string, init: RequestInit = {}) => {
    const initHeaders = init.headers instanceof Headers ? Object.fromEntries(init.headers) : ((init.headers ?? {}) as Record<string, string>);
    const response = await fetch(`${config.supabaseUrl}/rest/v1/${path}`, {
      ...init,
      headers: { ...headers, ...initHeaders },
    });
    if (!response.ok) throw new Error(`Supabase ${init.method ?? "GET"} failed: ${response.status} ${await response.text()}`);
    return response;
  };
  const get = async <T>(path: string) => ((await (await request(path)).json()) ?? []) as T[];
  const post = async <T>(path: string, body: unknown, prefer = "return=representation") => {
    const response = await request(path, { method: "POST", headers: { prefer }, body: JSON.stringify(body) });
    if (!prefer.includes("return=representation")) return null;
    return ((await response.json()) as T[])[0];
  };
  const patch = (path: string, body: unknown) =>
    request(path, { method: "PATCH", headers: { prefer: "return=minimal" }, body: JSON.stringify(body) });

  return {
    getDueCampaigns: () => get("campaigns?status=in.(scheduled,sending)&select=*&order=created_at.asc&limit=50"),
    getFirstSequenceStep: async (campaignId: string) =>
      (await get(`campaign_sequence_steps?campaign_id=eq.${campaignId}&step_order=eq.0&select=*&limit=1`))[0] ?? null,
    getSendableLeads: async (campaignId: string, limit: number) => {
      const rows = await get<{ id: string; lead_id: string }>(
        `campaign_leads?campaign_id=eq.${campaignId}&status=eq.selected&select=id,lead_id&order=created_at.asc&limit=${limit}`,
      );
      const ids = rows.map((row) => row.lead_id);
      if (ids.length === 0) return [];
      const leads = await get<{ id: string; name: string; company: string; job_title: string; email: string }>(
        `all_leads_mmp?id=in.(${ids.join(",")})&email_status=eq.found&select=id,name,company,job_title,email`,
      );
      const byId = new Map(leads.map((lead) => [lead.id, lead]));
      return rows.flatMap((row) => {
        const lead = byId.get(row.lead_id);
        return lead?.email ? [{ ...lead, campaign_lead_id: row.id, lead_id: row.lead_id }] : [];
      });
    },
    getUsableMailboxes: async (campaignId: string) => {
      const links = await get<{ mailbox_id: string }>(`campaign_mailboxes?campaign_id=eq.${campaignId}&select=mailbox_id`);
      const ids = links.map((link) => link.mailbox_id);
      if (ids.length === 0) return [];
      const [mailboxes, capacity] = await Promise.all([
        get<MailboxRow>(`mailboxes?id=in.(${ids.join(",")})&status=eq.connected&select=*`),
        get<{ mailbox_id: string; available_today: number }>(`mailbox_capacity?mailbox_id=in.(${ids.join(",")})&select=*`),
      ]);
      const byId = new Map(capacity.map((row) => [row.mailbox_id, row]));
      return mailboxes.map((mailbox) => ({
        ...mailbox,
        smtp_host: mailbox.smtp_host ?? config.smtpHost,
        smtp_port: mailbox.smtp_port ?? config.smtpPort,
        available_today: byId.get(mailbox.id)?.available_today ?? 0,
      }));
    },
    getLastSendAtByMailbox: async (campaignId: string, mailboxIds: string[]) => {
      if (mailboxIds.length === 0) return {};
      const ids = mailboxIds.map(encodeURIComponent).join(",");
      const rows = await get<{ mailbox_id: string; sent_at: string }>(
        `messages?campaign_id=eq.${encodeURIComponent(campaignId)}&mailbox_id=in.(${ids})&direction=eq.outbound&sent_at=not.is.null&select=mailbox_id,sent_at&order=sent_at.desc`,
      );
      return Object.fromEntries(rows.filter((row, index) => rows.findIndex((item) => item.mailbox_id === row.mailbox_id) === index).map((row) => [row.mailbox_id, row.sent_at]));
    },
    markCampaignSending: (campaignId: string) => patch(`campaigns?id=eq.${campaignId}`, { status: "sending", updated_at: new Date().toISOString() }),
    markLeadQueued: (id: string) => patch(`campaign_leads?id=eq.${id}`, { status: "queued", updated_at: new Date().toISOString() }),
    markLeadSent: (id: string) => patch(`campaign_leads?id=eq.${id}`, { status: "sent", updated_at: new Date().toISOString() }),
    insertMessage: (row: unknown) => post<Record<string, unknown>>("messages", row),
    insertMessageEvent: (row: unknown) =>
      post("message_events", row, "return=minimal").catch((error) => {
        if (!String(error.message).includes("409")) throw error;
      }),
    markMessageAccepted: (id: string, providerMessageId: string, sentAt: string) =>
      patch(`messages?id=eq.${id}`, { provider_message_id: providerMessageId, sent_at: sentAt }),
    consumeMailboxSend: async (mailboxId: string, workspaceId: string, timezone: string, now: Date) => {
      const usage_date = localDate(now, timezone);
      const rows = await get<{ used_count: number; reserved_count: number }>(
        `mailbox_daily_usage?workspace_id=eq.${workspaceId}&mailbox_id=eq.${mailboxId}&usage_date=eq.${usage_date}&select=*`,
      );
      const current = rows[0];
      await request("mailbox_daily_usage?on_conflict=workspace_id,mailbox_id,usage_date", {
        method: "POST",
        headers: { prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({
          workspace_id: workspaceId,
          mailbox_id: mailboxId,
          usage_date,
          used_count: Number(current?.used_count ?? 0) + 1,
          reserved_count: Number(current?.reserved_count ?? 0),
          updated_at: new Date().toISOString(),
        }),
      });
    },
    completeCampaignIfDone: async (campaignId: string) => {
      const pending = await get(`campaign_leads?campaign_id=eq.${campaignId}&status=eq.selected&select=id&limit=1`);
      if (pending.length === 0) await patch(`campaigns?id=eq.${campaignId}`, { status: "completed", updated_at: new Date().toISOString() });
    },
  };
}

async function sendSmtp(payload: SendPayload, config: SendConfig) {
  return nodemailer
    .createTransport({
      host: payload.host ?? config.smtpHost,
      port: Number(payload.port ?? config.smtpPort),
      secure: Number(payload.port ?? config.smtpPort) === 465,
      auth: { user: payload.user, pass: payload.pass },
    })
    .sendMail(payload);
}

function decryptSecret(encrypted: MailboxSecret, key: Buffer, mailboxId: string) {
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(encrypted.nonce, "base64"), { authTagLength: 16 });
  decipher.setAAD(Buffer.from(`mailbox:${mailboxId}`, "utf8"));
  decipher.setAuthTag(Buffer.from(encrypted.authTag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted.ciphertext, "base64")), decipher.final()]).toString("utf8");
}

function localDate(now: Date, timeZone = "UTC") {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}
