import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import nodemailer from "nodemailer";

import { createComposioGmail } from "./composio-gmail.mjs";
import { decryptSecret } from "./mailbox-secrets.mjs";

const TEMPLATES = [
  { subject: "Quick note", body: "Just confirming this landed correctly. {{token}}" },
  { subject: "Following up", body: "Thanks for checking this when you get a minute. {{token}}" },
  { subject: "Small update", body: "This is the short update I mentioned earlier. {{token}}" },
  { subject: "Question for later", body: "Putting this here so we can find it again. {{token}}" },
];

const REPLIES = ["Got it, thanks.", "Received this one.", "Looks good on my side.", "Thanks, this came through."];

export function selectedWarmupJobs(args = []) {
  return {
    schedule: !args.includes("--send-only") && !args.includes("--check-only") && !args.includes("--check-composio-only"),
    send: !args.includes("--schedule-only") && !args.includes("--check-only") && !args.includes("--check-composio-only"),
    check: !args.includes("--schedule-only") && !args.includes("--send-only"),
  };
}

export function warmupTargetForDay(mailbox, now = new Date()) {
  const startedAt = mailbox.warmup_started_at ? new Date(mailbox.warmup_started_at) : now;
  const day = warmupDayNumber(startedAt, now, mailbox.timezone);
  const max = Number(mailbox.warmup_daily_limit ?? 25);
  const ramp = Number(mailbox.warmup_daily_rampup ?? 5);
  const target = Math.min(max, day * ramp);
  if (!mailbox.warmup_randomize_daily_count) return target;
  const floor = Math.max(1, target - ramp + 1);
  return floor + (stableWarmupHash(mailbox, now) % (target - floor + 1));
}

export async function runWarmupCycle({
  db,
  sendMail,
  gmail,
  decryptSecret: decrypt = () => String(""),
  now = new Date(),
  limit = 25,
  jobs = { schedule: true, send: true, check: true },
  shouldReply = (sender) => Math.random() * 100 < Number(sender?.warmup_reply_rate_percent ?? 20),
  shouldMarkInboxImportant = () => Math.random() < 0.25,
} = {}) {
  const summary = { scheduled: 0, sent: 0, checked: 0, savedFromSpam: 0, replied: 0, failed: 0 };

  if (jobs.schedule) {
    const seeds = await db.getWarmupSeeds(now);
    const seedLoads = new Map(seeds.map((seed) => [seed.id, Number(seed.warmup_count_24h ?? seed.received_24h ?? 0)]));
    for (const mailbox of await db.getWarmupReadyMailboxes(now)) {
      const target = warmupTargetForDay(mailbox, now);
      if (Number(mailbox.warmup_count_today ?? mailbox.sent_today ?? 0) >= target) continue;
      const seed = seeds
        .filter((row) => row.workspace_id === mailbox.workspace_id)
        .sort((a, b) => (seedLoads.get(a.id) ?? 0) - (seedLoads.get(b.id) ?? 0) || String(a.email_address).localeCompare(String(b.email_address)))[0];
      if (!seed) continue;
      const token = `WMUP-${randomUUID()}`;
      const template = TEMPLATES[summary.scheduled % TEMPLATES.length];
      await db.insertWarmupMessage({
        workspace_id: mailbox.workspace_id,
        mailbox_id: mailbox.id,
        seed_account_id: seed.id,
        token,
        subject: template.subject,
        body_text: template.body.replace("{{token}}", token),
        scheduled_for: scheduledFor(mailbox, now).toISOString(),
      });
      seedLoads.set(seed.id, (seedLoads.get(seed.id) ?? 0) + 1);
      summary.scheduled++;
    }
  }

  if (jobs.send) {
    for (const warmup of await db.claimWarmupMessages(limit)) {
      try {
        const sender = warmup.sender;
        const result = await sendMail({
          host: sender.smtp_host,
          port: sender.smtp_port,
          user: sender.email_address,
          pass: decrypt(sender.encrypted_app_password, sender.id),
          from: `${sender.display_name} <${sender.email_address}>`,
          to: warmup.seed.email_address,
          subject: warmup.subject,
          text: warmup.body_text,
        });
        await db.markWarmupSent(warmup.id, result.messageId);
        await db.insertWarmupEvent(eventRow(warmup, "sent", "zoho_mail", result.messageId ? `smtp:${result.messageId}` : undefined));
        summary.sent++;
      } catch (error) {
        await db.markWarmupFailed?.(warmup.id, error);
        summary.failed++;
      }
    }
  }

  if (jobs.check) {
    for (const warmup of await db.getSentWarmupMessagesNeedingCheck(now)) {
      try {
        const seed = warmup.seed;
        const found = await gmail.findWarmupMessage({
          userId: seed.composio_user_id,
          connectedAccountId: seed.composio_connected_account_id,
          token: warmup.token,
        });
        if (!found) continue;
        await db.markWarmupPlacement(warmup.id, found.folder, found.id, found.threadId);
        await db.insertWarmupEvent(eventRow(warmup, found.folder === "spam" ? "landed_spam" : "landed_inbox", "gmail_composio", `gmail:${found.id}`));
        summary.checked++;

        const args = { userId: seed.composio_user_id, connectedAccountId: seed.composio_connected_account_id, messageId: found.id };
        if (found.folder === "spam") {
          await gmail.moveFromSpamToInbox(args);
          await db.markWarmupRescued(warmup.id);
          await db.insertWarmupEvent(eventRow(warmup, "saved_from_spam", "gmail_composio", `gmail-rescue:${found.id}`));
          summary.savedFromSpam++;
        }
        if (found.folder === "spam" || shouldMarkInboxImportant(warmup.sender)) {
          await gmail.markImportant(args);
          await db.markWarmupImportant(warmup.id);
          await db.insertWarmupEvent(eventRow(warmup, "marked_important", "gmail_composio", `gmail-important:${found.id}`));
        }
        if (!warmup.replied_at && shouldReply(warmup.sender)) {
          await gmail.replyToThread({ ...args, threadId: found.threadId, body: REPLIES[summary.replied % REPLIES.length] });
          await db.markWarmupReplied(warmup.id);
          await db.insertWarmupEvent(eventRow(warmup, "reply_sent", "gmail_composio", `gmail-reply:${found.threadId}`));
          summary.replied++;
        }
      } catch {
        summary.failed++;
      }
    }
  }

  return summary;
}

export function loadWarmupConfig(env = process.env) {
  const local = env === process.env ? readLocalEnv() : {};
  const value = (name) => env[name] ?? local[name];
  const config = {
    supabaseUrl: value("NEXT_PUBLIC_SUPABASE_URL")?.replace(/\/$/, ""),
    supabaseKey: value("SUPABASE_SERVICE_ROLE_KEY") ?? value("SUPABASE_SECRET_KEY"),
    encryptionKey: Buffer.from(value("WORKER_ENCRYPTION_KEY") ?? "", "base64"),
    composioApiKey: value("COMPOSIO_API_KEY") ?? value("Composio_api_key"),
    smtpHost: value("ZOHO_SMTP_HOST") ?? "smtp.zoho.com",
    smtpPort: Number(value("ZOHO_SMTP_PORT") ?? 465),
  };

  if (!config.supabaseUrl) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  if (!config.supabaseKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  if (config.encryptionKey.length !== 32) throw new Error("Missing WORKER_ENCRYPTION_KEY");
  if (!config.composioApiKey) throw new Error("Missing COMPOSIO_API_KEY");
  return config;
}

export function buildWarmupDeps(config = loadWarmupConfig(), fetchImpl = fetch) {
  validateWarmupConfig(config);
  return {
    db: supabaseDb(config, fetchImpl),
    gmail: createComposioGmail({ apiKey: config.composioApiKey, fetchImpl }),
    decryptSecret: (secret, mailboxId) => decryptSecret(secret, config.encryptionKey, mailboxId),
    sendMail: (payload) => sendSmtp(payload, config),
  };
}

export async function sendSmtp(payload, config = {}) {
  const port = Number(payload.port ?? config.smtpPort ?? 465);
  return nodemailer
    .createTransport({
      host: payload.host ?? config.smtpHost,
      port,
      secure: port === 465,
      auth: { user: payload.user, pass: payload.pass },
    })
    .sendMail(payload);
}

function validateWarmupConfig(config) {
  if (!config.supabaseUrl) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  if (!config.supabaseKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  if (config.encryptionKey.length !== 32) throw new Error("Missing WORKER_ENCRYPTION_KEY");
  if (!config.composioApiKey) throw new Error("Missing COMPOSIO_API_KEY");
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
  const get = async (path) => (await (await request(path)).json()) ?? [];
  const post = async (path, body, prefer = "return=representation") => {
    const response = await request(path, { method: "POST", headers: { prefer }, body: JSON.stringify(body) });
    if (!prefer.includes("return=representation")) return null;
    return (await response.json())?.[0];
  };
  const patch = (path, body) => request(path, { method: "PATCH", headers: { prefer: "return=minimal" }, body: JSON.stringify(body) });

  return {
    getWarmupReadyMailboxes: async (now = new Date()) => {
      const rows = await get("mailboxes?warmup_enabled=eq.true&status=in.(connected,warming)&select=*&limit=100");
      return Promise.all(rows.map(async (row) => ({ ...row, warmup_count_today: await countWarmupToday(get, row, now) })));
    },
    getWarmupSeeds: async (now = new Date()) => {
      const rows = await get("warmup_seed_accounts?status=eq.connected&select=*");
      return Promise.all(rows.map(async (row) => ({ ...row, warmup_count_24h: await countWarmupSeed24h(get, row, now) })));
    },
    insertWarmupMessage: (row) => post("warmup_messages", row),
    claimWarmupMessages: async (limit) => {
      const response = await request("rpc/claim_warmup_messages", {
        method: "POST",
        headers: { prefer: "return=representation" },
        body: JSON.stringify({ p_limit: limit }),
      });
      return enrichWarmupRows(get, (await response.json()) ?? []);
    },
    getSentWarmupMessagesNeedingCheck: (now = new Date()) =>
      enrichWarmupRows(
        get,
        [],
        "warmup_messages?status=eq.sent&sent_at=not.is.null&or=(landed_folder.is.null,and(landed_folder.eq.spam,rescued_at.is.null))&sent_at=lt." +
          encodeURIComponent(new Date(now.getTime() - 90000).toISOString()) +
          "&select=*&order=sent_at.asc&limit=50",
      ),
    markWarmupSent: (id, messageId) => patch(`warmup_messages?id=eq.${id}`, { status: "sent", sent_at: new Date().toISOString(), sender_provider_message_id: messageId, updated_at: new Date().toISOString() }),
    markWarmupPlacement: (id, folder, gmailMessageId, threadId) => patch(`warmup_messages?id=eq.${id}`, { status: folder === "spam" ? "sent" : "landed_inbox", landed_folder: folder, seed_provider_message_id: gmailMessageId, seed_thread_id: threadId, updated_at: new Date().toISOString() }),
    markWarmupRescued: (id) => patch(`warmup_messages?id=eq.${id}`, { status: "saved_from_spam", rescued_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
    markWarmupImportant: (id) => patch(`warmup_messages?id=eq.${id}`, { marked_important_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
    markWarmupReplied: (id) => patch(`warmup_messages?id=eq.${id}`, { status: "replied", replied_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
    markWarmupFailed: (id, error) => patch(`warmup_messages?id=eq.${id}`, { status: "failed", error: String(error?.message ?? error).slice(0, 500), updated_at: new Date().toISOString() }),
    insertWarmupEvent: (row) => post("warmup_events", row, "return=minimal").catch((error) => {
      if (!String(error.message).includes("409")) throw error;
    }),
  };
}

async function enrichWarmupRows(get, rows, path) {
  const base = path ? await get(path) : rows;
  if (base.length === 0) return [];
  const mailboxIds = [...new Set(base.map((row) => row.mailbox_id))];
  const seedIds = [...new Set(base.map((row) => row.seed_account_id))];
  const [mailboxes, seeds] = await Promise.all([
    get(`mailboxes?id=in.(${mailboxIds.join(",")})&select=*`),
    get(`warmup_seed_accounts?id=in.(${seedIds.join(",")})&select=*`),
  ]);
  const byMailbox = new Map(mailboxes.map((row) => [row.id, row]));
  const bySeed = new Map(seeds.map((row) => [row.id, row]));
  return base.map((row) => ({ ...row, sender: byMailbox.get(row.mailbox_id), seed: bySeed.get(row.seed_account_id) })).filter((row) => row.sender && row.seed);
}

async function countWarmupToday(get, mailbox, now) {
  const { start, end } = localDayBounds(now, mailbox.timezone);
  const rows = await get(
    `warmup_messages?mailbox_id=eq.${encodeURIComponent(mailbox.id)}&scheduled_for=gte.${encodeURIComponent(start.toISOString())}&scheduled_for=lt.${encodeURIComponent(end.toISOString())}&status=in.(scheduled,claimed,sent,landed_inbox,saved_from_spam,replied)&select=id`,
  );
  return rows.length;
}

async function countWarmupSeed24h(get, seed, now) {
  const since = new Date(now.getTime() - 86400000);
  const rows = await get(
    `warmup_messages?seed_account_id=eq.${encodeURIComponent(seed.id)}&scheduled_for=gte.${encodeURIComponent(since.toISOString())}&status=in.(scheduled,claimed,sent,landed_inbox,saved_from_spam,replied)&select=id`,
  );
  return rows.length;
}

function scheduledFor(mailbox, now) {
  const [startHour = 9, startMinute = 0] = String(mailbox.sending_window_start ?? "09:00").split(":").map(Number);
  const [endHour = 17, endMinute = 0] = String(mailbox.sending_window_end ?? "17:00").split(":").map(Number);
  const parts = zonedParts(now, mailbox.timezone);
  const start = zonedTimeToUtc({ ...parts, hour: startHour, minute: startMinute }, mailbox.timezone);
  const end = zonedTimeToUtc({ ...parts, hour: endHour, minute: endMinute }, mailbox.timezone);
  if (end <= start) return now;
  if (now > end) return zonedTimeToUtc({ ...parts, day: parts.day + 1, hour: startHour, minute: startMinute }, mailbox.timezone);
  const min = Math.max(now.getTime(), start.getTime());
  return new Date(min + Math.floor(Math.random() * (end.getTime() - min)));
}

function eventRow(warmup, event_type, source, provider_event_id) {
  return {
    workspace_id: warmup.workspace_id,
    warmup_message_id: warmup.id,
    mailbox_id: warmup.mailbox_id,
    seed_account_id: warmup.seed_account_id,
    event_type,
    source,
    provider_event_id,
    metadata: {},
  };
}

function localDayBounds(now, timeZone = "UTC") {
  const parts = zonedParts(now, timeZone);
  return {
    start: zonedTimeToUtc({ ...parts, hour: 0, minute: 0 }, timeZone),
    end: zonedTimeToUtc({ ...parts, day: parts.day + 1, hour: 0, minute: 0 }, timeZone),
  };
}

function warmupDayNumber(startedAt, now, timeZone = "UTC") {
  const start = zonedParts(startedAt, timeZone);
  const today = zonedParts(now, timeZone);
  return Math.max(
    1,
    Math.floor(
      (Date.UTC(today.year, today.month - 1, today.day) - Date.UTC(start.year, start.month - 1, start.day)) / 86400000,
    ) + 1,
  );
}

function stableWarmupHash(mailbox, now) {
  const parts = zonedParts(now, mailbox.timezone);
  const month = String(parts.month).padStart(2, "0");
  const day = String(parts.day).padStart(2, "0");
  const key = `${mailbox.id ?? mailbox.email_address ?? ""}:${parts.year}-${month}-${day}`;
  return createHash("md5").update(key).digest().readUInt32BE(0);
}

function zonedParts(date, timeZone = "UTC") {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

function zonedTimeToUtc(parts, timeZone = "UTC") {
  const target = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0, 0);
  let utc = target;
  for (let i = 0; i < 2; i++) {
    const actual = zonedParts(new Date(utc), timeZone);
    utc += target - Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, 0, 0);
  }
  return new Date(utc);
}

function readLocalEnv() {
  const start = dirname(fileURLToPath(import.meta.url));
  for (const file of [resolve(start, "../../../.env.local"), join(process.cwd(), ".env.local")]) {
    if (!existsSync(/* turbopackIgnore: true */ file)) continue;
    return Object.fromEntries(
      readFileSync(/* turbopackIgnore: true */ file, "utf8")
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
  if (process.argv.includes("--check-composio-only")) {
    const config = loadWarmupConfig();
    createComposioGmail({ apiKey: config.composioApiKey });
    console.log(JSON.stringify({ messages: 0 }));
  } else {
    runWarmupCycle({ ...buildWarmupDeps(), jobs: selectedWarmupJobs(process.argv.slice(2)) })
      .then((summary) => console.log(JSON.stringify(summary)))
      .catch((error) => {
        console.error(error instanceof Error ? error.message : error);
        process.exitCode = 1;
      });
  }
}
