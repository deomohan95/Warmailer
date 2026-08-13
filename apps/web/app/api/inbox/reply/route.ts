import { createDecipheriv } from "node:crypto";

import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import nodemailer from "nodemailer";

import { envValue, getActiveWorkspace } from "@/lib/backend-data";

export const runtime = "nodejs";

type ReplyInput = { threadId?: string; body?: string };

type ThreadRow = {
  id: string;
  workspace_id: string;
  mailbox_id: string;
  lead_id: string | null;
  campaign_id: string | null;
  provider_thread_id: string | null;
  from_email: string;
  subject: string;
};

type MailboxRow = {
  id: string;
  email_address: string;
  display_name: string;
  smtp_host: string | null;
  smtp_port: number | null;
  encrypted_app_password: {
    version: number;
    algorithm: string;
    nonce: string;
    ciphertext: string;
    authTag: string;
  };
};

type MessageRow = {
  id: string;
  provider_message_id: string | null;
  subject: string;
};

export async function POST(request: Request) {
  try {
    const input = validate(await request.json());
    const workspace = await getActiveWorkspace();
    const [thread] = await supabaseGet<ThreadRow[]>(
      `inbox_threads?id=eq.${encodeURIComponent(input.threadId)}&workspace_id=eq.${encodeURIComponent(workspace.workspaceId)}&select=*&limit=1`,
    );
    if (!thread) throw new Error("Thread not found");

    const [[mailbox], [parent]] = await Promise.all([
      supabaseGet<MailboxRow[]>(`mailboxes?id=eq.${thread.mailbox_id}&workspace_id=eq.${workspace.workspaceId}&select=*&limit=1`),
      supabaseGet<MessageRow[]>(
        `messages?thread_id=eq.${thread.id}&workspace_id=eq.${workspace.workspaceId}&select=id,provider_message_id,subject&order=created_at.desc&limit=1`,
      ),
    ]);
    if (!mailbox) throw new Error("Mailbox not found");

    const now = new Date().toISOString();
    const subject = /^re:/i.test(thread.subject) ? thread.subject : `Re: ${thread.subject}`;
    const [message] = await supabasePost<MessageRow[]>("messages", {
      workspace_id: workspace.workspaceId,
      thread_id: thread.id,
      campaign_id: thread.campaign_id,
      lead_id: thread.lead_id,
      mailbox_id: mailbox.id,
      direction: "outbound",
      subject,
      body_text: input.body,
      body_preview: input.body.slice(0, 240),
      created_at: now,
    });
    if (!message) throw new Error("Message record was not created");
    await supabasePost("message_events", {
      workspace_id: workspace.workspaceId,
      message_id: message.id,
      event_type: "queued",
      source: "user_action",
      occurred_at: now,
      metadata: { threadId: thread.id },
    });

    const parentMessageId = parent?.provider_message_id ?? thread.provider_thread_id ?? undefined;
    const result = await nodemailer
      .createTransport({
        host: mailbox.smtp_host ?? envValue("ZOHO_SMTP_HOST") ?? "smtp.zoho.com",
        port: Number(mailbox.smtp_port ?? envValue("ZOHO_SMTP_PORT") ?? 465),
        secure: Number(mailbox.smtp_port ?? envValue("ZOHO_SMTP_PORT") ?? 465) === 465,
        auth: {
          user: mailbox.email_address,
          pass: decryptSecret(mailbox.encrypted_app_password, mailbox.id),
        },
      })
      .sendMail({
        from: `${mailbox.display_name} <${mailbox.email_address}>`,
        to: thread.from_email,
        subject,
        text: input.body,
        inReplyTo: parentMessageId,
        references: parentMessageId,
      });

    await supabasePatch(`messages?id=eq.${message.id}&workspace_id=eq.${workspace.workspaceId}`, {
      provider_message_id: result.messageId,
      sent_at: now,
    });
    await supabasePost("message_events", {
      workspace_id: workspace.workspaceId,
      message_id: message.id,
      event_type: "smtp_accepted",
      source: "zoho_mail",
      provider_event_id: result.messageId ? `smtp:${result.messageId}` : null,
      occurred_at: now,
      metadata: { replyTo: parentMessageId },
    });
    await supabasePatch(`inbox_threads?id=eq.${thread.id}&workspace_id=eq.${workspace.workspaceId}`, {
      status: "replied",
      last_message_at: now,
      updated_at: now,
    });

    revalidatePath("/inbox");
    if (thread.campaign_id) revalidatePath(`/campaigns/${thread.campaign_id}`);
    return NextResponse.json({ messageId: message.id, providerMessageId: result.messageId ?? null });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Reply failed" }, { status: 400 });
  }
}

function validate(input: ReplyInput) {
  const threadId = String(input.threadId ?? "").trim();
  const body = String(input.body ?? "").trim();
  if (!threadId) throw new Error("Thread id is required");
  if (!body) throw new Error("Reply body is required");
  return { threadId, body };
}

async function supabaseGet<T>(path: string): Promise<T> {
  const response = await supabaseFetch(path, { method: "GET" });
  return (await response.json()) as T;
}

async function supabasePost<T = unknown>(table: string, body: unknown): Promise<T> {
  const response = await supabaseFetch(table, {
    method: "POST",
    headers: { "content-type": "application/json", prefer: "return=representation" },
    body: JSON.stringify(body),
  });
  return (await response.json()) as T;
}

async function supabasePatch(path: string, body: unknown) {
  await supabaseFetch(path, {
    method: "PATCH",
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

function decryptSecret(encrypted: MailboxRow["encrypted_app_password"], mailboxId: string) {
  const key = Buffer.from(envValue("WORKER_ENCRYPTION_KEY") ?? "", "base64");
  if (key.length !== 32) throw new Error("Missing WORKER_ENCRYPTION_KEY");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(encrypted.nonce, "base64"), {
    authTagLength: 16,
  });
  decipher.setAAD(Buffer.from(`mailbox:${mailboxId}`, "utf8"));
  decipher.setAuthTag(Buffer.from(encrypted.authTag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
