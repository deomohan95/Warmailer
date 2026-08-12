import { createCipheriv, randomBytes, randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { envValue, getActiveWorkspace } from "@/lib/backend-data";

export const runtime = "nodejs";

const emailPattern = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

type MailboxInput = {
  emailAddress?: string;
  displayName?: string;
  appPassword?: string;
  dailyHardLimit?: number;
  hourlyHardLimit?: number;
  sendingWindowStart?: string;
  sendingWindowEnd?: string;
  timezone?: string;
};

export async function POST(request: Request) {
  try {
    const input = validate(await request.json());
    const workspace = await getActiveWorkspace();
    const mailboxId = randomUUID();
    const now = new Date().toISOString();

    await supabasePost("mailboxes", {
      id: mailboxId,
      workspace_id: workspace.workspaceId,
      email_address: input.emailAddress,
      display_name: input.displayName,
      status: "connected",
      encrypted_app_password: encryptSecret(input.appPassword, encryptionKey(), mailboxId),
      app_password_configured: true,
      daily_hard_limit: input.dailyHardLimit,
      hourly_hard_limit: input.hourlyHardLimit,
      sending_window_start: input.sendingWindowStart,
      sending_window_end: input.sendingWindowEnd,
      timezone: input.timezone,
      created_at: now,
      updated_at: now,
    });

    await supabasePost("mailbox_events", {
      workspace_id: workspace.workspaceId,
      mailbox_id: mailboxId,
      event_type: "connected",
      source: "user_action",
      metadata: {
        dailyHardLimit: input.dailyHardLimit,
        hourlyHardLimit: input.hourlyHardLimit,
      },
      created_at: now,
    });

    revalidatePath("/");
    revalidatePath("/mailboxes");
    revalidatePath("/campaigns");
    revalidatePath("/campaigns/new");
    revalidatePath("/inbox");

    return NextResponse.json({ mailboxId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Mailbox save failed";
    const status = message.includes("already exists") ? 409 : message.includes("Missing") ? 500 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

function validate(input: MailboxInput) {
  const emailAddress = String(input.emailAddress ?? "").trim().toLowerCase();
  const displayName = String(input.displayName ?? "").trim();
  const appPassword = String(input.appPassword ?? "");
  const dailyHardLimit = Number(input.dailyHardLimit);
  const hourlyHardLimit = Number(input.hourlyHardLimit);
  const sendingWindowStart = String(input.sendingWindowStart ?? "09:00");
  const sendingWindowEnd = String(input.sendingWindowEnd ?? "17:00");
  const timezone = String(input.timezone ?? "UTC").trim();

  if (!emailPattern.test(emailAddress)) throw new Error("Email address is invalid");
  if (!appPassword) throw new Error("Zoho app password is required");
  if (!Number.isInteger(dailyHardLimit) || dailyHardLimit < 1 || dailyHardLimit > 500) {
    throw new Error("Daily hard limit must be between 1 and 500");
  }
  if (!Number.isInteger(hourlyHardLimit) || hourlyHardLimit < 1 || hourlyHardLimit > 100) {
    throw new Error("Hourly hard limit must be between 1 and 100");
  }
  if (!timePattern.test(sendingWindowStart) || !timePattern.test(sendingWindowEnd)) {
    throw new Error("Sending window times must be HH:MM");
  }
  if (sendingWindowStart >= sendingWindowEnd) throw new Error("Sending window must close after it opens");
  if (!timezone) throw new Error("Timezone is required");

  return {
    emailAddress,
    displayName,
    appPassword,
    dailyHardLimit,
    hourlyHardLimit,
    sendingWindowStart,
    sendingWindowEnd,
    timezone,
  };
}

async function supabasePost(table: string, body: unknown) {
  const url = envValue("NEXT_PUBLIC_SUPABASE_URL")?.replace(/\/$/, "");
  const key = envValue("SUPABASE_SERVICE_ROLE_KEY") ?? envValue("SUPABASE_SECRET_KEY");
  if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  if (!key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  let response: Response;

  try {
    response = await fetch(`${url}/rest/v1/${table}`, {
      method: "POST",
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Cannot reach Supabase from this machine. Check internet, firewall, VPN, or proxy for Node.js.");
  }

  if (!response.ok) {
    const text = await response.text();
    if (response.status === 409) throw new Error("Mailbox already exists for this workspace");
    throw new Error(text || `Supabase insert failed: ${response.status}`);
  }
}

function encryptionKey() {
  const key = Buffer.from(envValue("WORKER_ENCRYPTION_KEY") ?? "", "base64");
  if (key.length !== 32) throw new Error("Missing WORKER_ENCRYPTION_KEY");
  return key;
}

function encryptSecret(secret: string, key: Buffer, mailboxId: string) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce, { authTagLength: 16 });
  cipher.setAAD(Buffer.from(`mailbox:${mailboxId}`, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);

  return {
    version: 1,
    algorithm: "aes-256-gcm",
    nonce: nonce.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}
