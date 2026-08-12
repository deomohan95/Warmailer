import { randomUUID } from "node:crypto";

import { encryptSecret } from "./mailbox-secrets.mjs";

const regions = new Set(["us", "eu", "in", "au"]);
const emailPattern = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export function validateMailboxCreateInput(input) {
  const emailAddress = String(input?.emailAddress ?? "").trim().toLowerCase();
  const displayName = String(input?.displayName ?? "").trim();
  const appPassword = String(input?.appPassword ?? "");
  const zohoRegion = input?.zohoRegion ?? "us";
  const dailyHardLimit = Number(input?.dailyHardLimit);
  const hourlyHardLimit = Number(input?.hourlyHardLimit);
  const sendingWindowStart = input?.sendingWindowStart ?? "09:00";
  const sendingWindowEnd = input?.sendingWindowEnd ?? "17:00";
  const timezone = String(input?.timezone ?? "UTC").trim();

  if (!emailPattern.test(emailAddress)) throw new Error("emailAddress is required");
  if (!appPassword) throw new Error("appPassword is required");
  if (!regions.has(zohoRegion)) throw new Error("zohoRegion is invalid");
  if (!Number.isInteger(dailyHardLimit) || dailyHardLimit < 1 || dailyHardLimit > 500) {
    throw new Error("dailyHardLimit must be between 1 and 500");
  }
  if (!Number.isInteger(hourlyHardLimit) || hourlyHardLimit < 1 || hourlyHardLimit > 100) {
    throw new Error("hourlyHardLimit must be between 1 and 100");
  }
  if (!timePattern.test(sendingWindowStart) || !timePattern.test(sendingWindowEnd)) {
    throw new Error("sending window times must be HH:MM");
  }
  if (sendingWindowStart >= sendingWindowEnd) throw new Error("sending window must close after it opens");
  if (!timezone) throw new Error("timezone is required");

  return {
    emailAddress,
    displayName,
    appPassword,
    zohoRegion,
    dailyHardLimit,
    hourlyHardLimit,
    sendingWindowStart,
    sendingWindowEnd,
    timezone,
  };
}

export function buildMailboxCreate({ input, workspaceId, userId, encryptionKey, mailboxId = randomUUID(), now = nowIso }) {
  if (!workspaceId) throw new Error("workspaceId is required");
  if (!userId) throw new Error("userId is required");

  const value = validateMailboxCreateInput(input);
  const createdAt = now();

  return {
    mailbox: {
      id: mailboxId,
      workspace_id: workspaceId,
      email_address: value.emailAddress,
      display_name: value.displayName,
      status: "connected",
      zoho_region: value.zohoRegion,
      encrypted_app_password: encryptSecret(value.appPassword, encryptionKey, mailboxId),
      app_password_configured: true,
      daily_hard_limit: value.dailyHardLimit,
      hourly_hard_limit: value.hourlyHardLimit,
      sending_window_start: value.sendingWindowStart,
      sending_window_end: value.sendingWindowEnd,
      timezone: value.timezone,
      created_at: createdAt,
      updated_at: createdAt,
    },
    event: {
      workspace_id: workspaceId,
      mailbox_id: mailboxId,
      event_type: "connected",
      source: "user_action",
      actor_user_id: userId,
      metadata: {
        zohoRegion: value.zohoRegion,
        dailyHardLimit: value.dailyHardLimit,
        hourlyHardLimit: value.hourlyHardLimit,
      },
      created_at: createdAt,
    },
  };
}

export function mailboxCapacity(row) {
  const usedToday = Number(row.used_today ?? row.used_count ?? 0);
  const reservedToday = Number(row.reserved_today ?? row.reserved_count ?? 0);
  const dailyHardLimit = Number(row.daily_hard_limit);

  return {
    dailyHardLimit,
    hourlyHardLimit: Number(row.hourly_hard_limit),
    usedToday,
    reservedToday,
    availableToday: Math.max(0, dailyHardLimit - usedToday - reservedToday),
  };
}

export function publicMailboxRecord(row) {
  const capacity = mailboxCapacity(row);

  return {
    workspaceId: row.workspace_id,
    source: "zoho_mail",
    entityId: row.id,
    mailboxId: row.id,
    emailAddress: row.email_address,
    displayName: row.display_name,
    status: row.status,
    ...capacity,
    sendingWindowStart: row.sending_window_start,
    sendingWindowEnd: row.sending_window_end,
    timezone: row.timezone,
    appPasswordConfigured: Boolean(row.app_password_configured),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function nowIso() {
  return new Date().toISOString();
}
