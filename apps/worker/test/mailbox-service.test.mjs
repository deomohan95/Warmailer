import test from "node:test";
import assert from "node:assert/strict";

import {
  buildMailboxCreate,
  mailboxCapacity,
  publicMailboxRecord,
  validateMailboxCreateInput,
} from "../src/mailbox-service.mjs";
import { decryptSecret } from "../src/mailbox-secrets.mjs";

const validInput = {
  emailAddress: "  Sender@Example.COM ",
  displayName: "Sales Sender",
  appPassword: "zoho-app-password",
  zohoRegion: "in",
  dailyHardLimit: 75,
  hourlyHardLimit: 12,
  sendingWindowStart: "09:00",
  sendingWindowEnd: "17:30",
  timezone: "Asia/Kolkata",
};

test("validates and normalizes mailbox input before any secret is stored", () => {
  assert.deepEqual(validateMailboxCreateInput(validInput), {
    emailAddress: "sender@example.com",
    displayName: "Sales Sender",
    appPassword: "zoho-app-password",
    zohoRegion: "in",
    dailyHardLimit: 75,
    hourlyHardLimit: 12,
    sendingWindowStart: "09:00",
    sendingWindowEnd: "17:30",
    timezone: "Asia/Kolkata",
  });

  assert.throws(
    () => validateMailboxCreateInput({ ...validInput, sendingWindowStart: "18:00", sendingWindowEnd: "09:00" }),
    /sending window must close after it opens/i,
  );
  assert.throws(() => validateMailboxCreateInput({ ...validInput, emailAddress: "sender@" }), /emailAddress/i);
  assert.throws(() => validateMailboxCreateInput({ ...validInput, sendingWindowStart: "99:00" }), /HH:MM/i);
  assert.throws(() => validateMailboxCreateInput({ ...validInput, dailyHardLimit: 0 }), /dailyHardLimit/i);
});

test("builds one insert row plus one lineage event and keeps the app password encrypted", () => {
  const key = Buffer.alloc(32, 11);
  const createdAt = "2026-08-12T10:00:00.000Z";
  const result = buildMailboxCreate({
    input: validInput,
    workspaceId: "workspace_1",
    userId: "user_1",
    encryptionKey: key,
    mailboxId: "mailbox_1",
    now: () => createdAt,
  });

  assert.equal(result.mailbox.workspace_id, "workspace_1");
  assert.equal(result.mailbox.id, "mailbox_1");
  assert.equal(result.mailbox.email_address, "sender@example.com");
  assert.equal(result.mailbox.status, "connected");
  assert.equal(result.mailbox.app_password_configured, true);
  assert.equal(result.mailbox.app_password, undefined);
  assert.equal(decryptSecret(result.mailbox.encrypted_app_password, key, "mailbox_1"), "zoho-app-password");
  assert.deepEqual(result.event, {
    workspace_id: "workspace_1",
    mailbox_id: "mailbox_1",
    event_type: "connected",
    source: "user_action",
    actor_user_id: "user_1",
    metadata: { zohoRegion: "in", dailyHardLimit: 75, hourlyHardLimit: 12 },
    created_at: createdAt,
  });
});

test("public mailbox records expose capacity and lineage but never the encrypted secret", () => {
  const row = {
    id: "mailbox_1",
    workspace_id: "workspace_1",
    email_address: "sender@example.com",
    display_name: "Sales Sender",
    status: "connected",
    daily_hard_limit: 75,
    hourly_hard_limit: 12,
    used_today: 10,
    reserved_today: 20,
    sending_window_start: "09:00",
    sending_window_end: "17:30",
    timezone: "Asia/Kolkata",
    app_password_configured: true,
    encrypted_app_password: { ciphertext: "secret" },
    created_at: "2026-08-12T10:00:00.000Z",
    updated_at: "2026-08-12T10:05:00.000Z",
  };

  assert.equal(mailboxCapacity(row).availableToday, 45);
  assert.deepEqual(publicMailboxRecord(row), {
    workspaceId: "workspace_1",
    source: "zoho_mail",
    entityId: "mailbox_1",
    mailboxId: "mailbox_1",
    emailAddress: "sender@example.com",
    displayName: "Sales Sender",
    status: "connected",
    dailyHardLimit: 75,
    hourlyHardLimit: 12,
    usedToday: 10,
    reservedToday: 20,
    availableToday: 45,
    sendingWindowStart: "09:00",
    sendingWindowEnd: "17:30",
    timezone: "Asia/Kolkata",
    appPasswordConfigured: true,
    createdAt: "2026-08-12T10:00:00.000Z",
    updatedAt: "2026-08-12T10:05:00.000Z",
  });
});
