import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import nodemailer from "nodemailer";

import { sendDueCampaigns } from "./campaign-mailer.mjs";
import { syncInboundReplies } from "./inbox-sync.mjs";
import { decryptSecret } from "./mailbox-secrets.mjs";

export function buildSmtpReply({ from, to, subject, body, parentMessageId }) {
  const replySubject = /^re:/i.test(subject) ? subject : `Re: ${subject}`;
  return { from, to, subject: replySubject, text: body, inReplyTo: parentMessageId, references: parentMessageId };
}

export function selectedMailJobs(args = []) {
  return {
    send: !args.includes("--sync-only"),
    sync: !args.includes("--send-only"),
  };
}

export function loadMailConfig(env = process.env) {
  const local = env === process.env ? readLocalEnv() : {};
  const value = (name) => env[name] ?? local[name];
  const config = {
    supabaseUrl: value("NEXT_PUBLIC_SUPABASE_URL")?.replace(/\/$/, ""),
    supabaseKey: value("SUPABASE_SERVICE_ROLE_KEY") ?? value("SUPABASE_SECRET_KEY"),
    encryptionKey: Buffer.from(value("WORKER_ENCRYPTION_KEY") ?? "", "base64"),
    smtpHost: value("ZOHO_SMTP_HOST") ?? "smtp.zoho.com",
    smtpPort: Number(value("ZOHO_SMTP_PORT") ?? 465),
    imapHost: value("ZOHO_IMAP_HOST") ?? "imap.zoho.com",
    imapPort: Number(value("ZOHO_IMAP_PORT") ?? 993),
    sendLimit: Number(value("MAIL_WORKER_SEND_LIMIT") ?? 25),
  };

  for (const key of ["supabaseUrl", "supabaseKey"]) if (!config[key]) throw new Error(`Missing ${key}`);
  if (config.encryptionKey.length !== 32) throw new Error("Missing WORKER_ENCRYPTION_KEY");
  return config;
}

export async function runMailWorker({ config = loadMailConfig(), fetchImpl = fetch, jobs = selectedMailJobs() } = {}) {
  const db = supabaseDb(config, fetchImpl);
  const decrypt = (secret, mailboxId) => decryptSecret(secret, config.encryptionKey, mailboxId);
  const send = jobs.send
    ? await sendDueCampaigns({
        db,
        limit: config.sendLimit,
        decryptSecret: decrypt,
        sendMail: (payload) => sendSmtp(payload, config),
      })
    : { campaigns: 0, sent: 0, skipped: 0, failed: 0 };
  const sync = jobs.sync
    ? await syncInboundReplies({
        db,
        fetchMessages: (mailbox) =>
          fetchImapMessages({
            ...mailbox,
            host: mailbox.imap_host ?? config.imapHost,
            port: mailbox.imap_port ?? config.imapPort,
            pass: decrypt(mailbox.encrypted_app_password, mailbox.id),
          }),
      })
    : { mailboxes: 0, synced: 0, skipped: 0 };
  return { send, sync };
}

export async function sendSmtp(payload, config = {}) {
  const transporter = nodemailer.createTransport({
    host: payload.host ?? config.smtpHost,
    port: Number(payload.port ?? config.smtpPort ?? 465),
    secure: Number(payload.port ?? config.smtpPort ?? 465) === 465,
    auth: { user: payload.user, pass: payload.pass },
  });
  return transporter.sendMail(payload);
}

export async function fetchImapMessages(mailbox) {
  const client = new ImapFlow({
    host: mailbox.host,
    port: Number(mailbox.port ?? 993),
    secure: true,
    logger: false,
    auth: { user: mailbox.email_address, pass: mailbox.pass },
  });
  await client.connect();
  let lock;
  try {
    lock = await client.getMailboxLock("INBOX");
    const messages = [];
    for await (const msg of client.fetch({ seen: false }, { envelope: true, source: true }, { uid: true })) {
      const parsed = await simpleParser(msg.source);
      messages.push({
        messageId: parsed.messageId,
        inReplyTo: parsed.inReplyTo,
        references: Array.isArray(parsed.references) ? parsed.references : parsed.references ? [parsed.references] : [],
        from: parsed.from?.value?.[0]?.address ?? msg.envelope?.from?.[0]?.address ?? "",
        subject: parsed.subject ?? "",
        text: parsed.text ?? "",
        receivedAt: (parsed.date ?? new Date()).toISOString(),
      });
    }
    return messages;
  } finally {
    lock?.release();
    await client.logout().catch(() => {});
  }
}

function supabaseDb(config, fetchImpl) {
  const headers = {
    apikey: config.supabaseKey,
    authorization: `Bearer ${config.supabaseKey}`,
    "content-type": "application/json",
  };
  const request = async (path, init = {}) => {
    const response = await fetchImpl(`${config.supabaseUrl}/rest/v1/${path}`, {
      ...init,
      headers: { ...headers, ...init.headers },
    });
    if (!response.ok) throw new Error(`Supabase ${init.method ?? "GET"} failed: ${response.status} ${await response.text()}`);
    return response;
  };
  const get = async (path) => (await (await request(path)).json());
  const post = async (path, body, prefer = "return=representation") => {
    const response = await request(path, { method: "POST", headers: { prefer }, body: JSON.stringify(body) });
    if (!prefer.includes("return=representation")) return null;
    return (await response.json())?.[0];
  };
  const patch = (path, body) =>
    request(path, { method: "PATCH", headers: { prefer: "return=minimal" }, body: JSON.stringify(body) });

  return {
    getDueCampaigns: () => get("campaigns?status=in.(scheduled,sending)&select=*&order=created_at.asc&limit=50"),
    getFirstSequenceStep: async (campaignId) =>
      (await get(`campaign_sequence_steps?campaign_id=eq.${campaignId}&step_order=eq.0&select=*&limit=1`))[0] ?? null,
    getSendableLeads: async (campaignId, limit) => {
      const rows = await get(`campaign_leads?campaign_id=eq.${campaignId}&status=in.(selected,queued)&select=id,lead_id&order=created_at.asc&limit=${limit}`);
      const ids = rows.map((row) => row.lead_id);
      if (ids.length === 0) return [];
      const leads = await get(`all_leads_mmp?id=in.(${ids.join(",")})&email_status=eq.found&select=id,name,company,job_title,email`);
      const byId = new Map(leads.map((lead) => [lead.id, lead]));
      return rows.flatMap((row) => {
        const lead = byId.get(row.lead_id);
        return lead?.email ? [{ ...lead, campaign_lead_id: row.id, lead_id: row.lead_id }] : [];
      });
    },
    getUsableMailboxes: async (campaignId) => {
      const links = await get(`campaign_mailboxes?campaign_id=eq.${campaignId}&select=mailbox_id`);
      const ids = links.map((link) => link.mailbox_id);
      if (ids.length === 0) return [];
      const [mailboxes, capacity] = await Promise.all([
        get(`mailboxes?id=in.(${ids.join(",")})&status=eq.connected&select=*`),
        get(`mailbox_capacity?mailbox_id=in.(${ids.join(",")})&select=*`),
      ]);
      const byId = new Map(capacity.map((row) => [row.mailbox_id, row]));
      return mailboxes.map((mailbox) => ({
        ...mailbox,
        smtp_host: mailbox.smtp_host ?? config.smtpHost,
        smtp_port: mailbox.smtp_port ?? config.smtpPort,
        available_today: byId.get(mailbox.id)?.available_today ?? 0,
      }));
    },
    markCampaignSending: (campaignId) => patch(`campaigns?id=eq.${campaignId}`, { status: "sending", updated_at: new Date().toISOString() }),
    markLeadQueued: (id) => patch(`campaign_leads?id=eq.${id}`, { status: "queued", updated_at: new Date().toISOString() }),
    markLeadSent: (id) => patch(`campaign_leads?id=eq.${id}`, { status: "sent", updated_at: new Date().toISOString() }),
    insertMessage: (row) => post("messages", row),
    insertMessageEvent: (row) => post("message_events", row, "return=minimal").catch((error) => {
      if (!String(error.message).includes("409")) throw error;
    }),
    markMessageAccepted: (id, providerMessageId, sentAt) => patch(`messages?id=eq.${id}`, { provider_message_id: providerMessageId, sent_at: sentAt }),
    consumeMailboxSend: async (mailboxId, workspaceId, timezone, now) => {
      const usage_date = localDate(now, timezone);
      const rows = await get(`mailbox_daily_usage?workspace_id=eq.${workspaceId}&mailbox_id=eq.${mailboxId}&usage_date=eq.${usage_date}&select=*`);
      const current = rows[0];
      // ponytail: single worker increment; move to SQL RPC before running multiple send workers.
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
    completeCampaignIfDone: async (campaignId) => {
      const pending = await get(`campaign_leads?campaign_id=eq.${campaignId}&status=in.(selected,queued)&select=id&limit=1`);
      if (pending.length === 0) await patch(`campaigns?id=eq.${campaignId}`, { status: "completed", updated_at: new Date().toISOString() });
    },
    getConnectedMailboxes: () => get("mailboxes?status=eq.connected&select=*"),
    messageExists: async (mailboxId, providerMessageId) =>
      (await get(`messages?mailbox_id=eq.${mailboxId}&provider_message_id=eq.${encodeURIComponent(providerMessageId)}&select=id&limit=1`)).length > 0,
    findMessageByProviderId: async (mailboxId, providerMessageId) =>
      (await get(`messages?mailbox_id=eq.${mailboxId}&provider_message_id=eq.${encodeURIComponent(providerMessageId)}&select=*&limit=1`))[0] ?? null,
    upsertThreadForReply: async (row) => {
      const existing = (
        await get(
          `inbox_threads?workspace_id=eq.${row.workspace_id}&mailbox_id=eq.${row.mailbox_id}&provider_thread_id=eq.${encodeURIComponent(row.provider_thread_id)}&select=*&limit=1`,
        )
      )[0];
      if (existing) {
        await patch(`inbox_threads?id=eq.${existing.id}`, { status: row.status, last_message_at: row.last_message_at, updated_at: new Date().toISOString() });
        return existing;
      }
      return post("inbox_threads", row);
    },
    attachMessageToThread: (messageId, threadId) => patch(`messages?id=eq.${messageId}`, { thread_id: threadId }),
    markCampaignLeadReplied: (campaignId, leadId) =>
      patch(`campaign_leads?campaign_id=eq.${campaignId}&lead_id=eq.${leadId}`, { status: "replied", updated_at: new Date().toISOString() }),
  };
}

function localDate(now, timeZone = "UTC") {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function readLocalEnv() {
  const start = dirname(fileURLToPath(import.meta.url));
  for (const file of [resolve(start, "../../../.env.local"), join(process.cwd(), ".env.local")]) {
    if (!existsSync(file)) continue;
    return Object.fromEntries(
      readFileSync(file, "utf8")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#") && line.includes("="))
        .map((line) => {
          const index = line.indexOf("=");
          const key = line.slice(0, index).trim();
          let value = line.slice(index + 1).trim();
          if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
          return [key, value];
        }),
    );
  }
  return {};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runMailWorker({ jobs: selectedMailJobs(process.argv.slice(2)) })
    .then((summary) => console.log(JSON.stringify(summary)))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
