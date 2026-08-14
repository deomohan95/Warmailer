import assert from "node:assert/strict";
import test from "node:test";

import { createComposioGmail } from "../src/composio-gmail.mjs";
import { runWarmupCycle } from "../src/warmup-worker.mjs";

test("uses normalized composio api key and executes gmail search by token", async () => {
  const calls = [];
  const gmail = createComposioGmail({
    apiKey: "secret",
    toolkitVersion: "20260721_00",
    fetchImpl: async (url, init) => {
      calls.push([url, init]);
      return Response.json({ data: { messages: [{ id: "gmail-1", threadId: "thread-1", labelIds: ["SPAM"] }] } });
    },
  });

  const message = await gmail.findWarmupMessage({
    userId: "seed-user",
    connectedAccountId: "ca_seed",
    token: "wm-abc",
  });

  assert.equal(message.id, "gmail-1");
  assert.equal(message.folder, "spam");
  assert.equal(calls[0][1].headers["x-api-key"], "secret");
});

test("schedules one warmup message for each enabled mailbox under its daily limit", async () => {
  const inserted = [];
  const result = await runWarmupCycle({
    now: new Date("2026-08-14T10:00:00.000Z"),
    db: {
      getWarmupReadyMailboxes: async () => [
        {
          id: "mb1",
          workspace_id: "ws1",
          email_address: "sender@example.com",
          warmup_daily_limit: 25,
          warmup_daily_rampup: 5,
          warmup_randomize_daily_count: false,
          warmup_reply_rate_percent: 20,
          warmup_started_at: "2026-08-14T00:00:00.000Z",
          sent_today: 0,
        },
      ],
      getWarmupSeeds: async () => [{ id: "seed1", workspace_id: "ws1", email_address: "seed@gmail.com" }],
      insertWarmupMessage: async (row) => inserted.push(row),
      claimWarmupMessages: async () => [],
      getSentWarmupMessagesNeedingCheck: async () => [],
    },
    sendMail: async () => {},
    gmail: {},
  });

  assert.equal(result.scheduled, 1);
  assert.equal(inserted[0].mailbox_id, "mb1");
  assert.equal(inserted[0].seed_account_id, "seed1");
  assert.match(inserted[0].body_text, /WMUP-/);
});

test("sends claimed warmup message through the sender mailbox", async () => {
  const calls = [];
  const result = await runWarmupCycle({
    db: {
      getWarmupReadyMailboxes: async () => [],
      getWarmupSeeds: async () => [],
      claimWarmupMessages: async () => [
        {
          id: "warm1",
          workspace_id: "ws1",
          mailbox_id: "mb1",
          seed_account_id: "seed1",
          token: "WMUP-1",
          subject: "Quick note",
          body_text: "Checking in WMUP-1",
          sender: { email_address: "sender@example.com", display_name: "Sender", encrypted_app_password: {} },
          seed: { email_address: "seed@gmail.com" },
        },
      ],
      markWarmupSent: async (id, messageId) => calls.push(["sent", id, messageId]),
      insertWarmupEvent: async (row) => calls.push(["event", row.event_type]),
      getSentWarmupMessagesNeedingCheck: async () => [],
    },
    decryptSecret: () => "app-password",
    sendMail: async (payload) => {
      calls.push(["mail", payload.from, payload.to, payload.subject]);
      return { messageId: "<zoho-warmup-1@example.com>" };
    },
    gmail: {},
  });

  assert.equal(result.sent, 1);
  assert.deepEqual(calls[0], ["mail", "Sender <sender@example.com>", "seed@gmail.com", "Quick note"]);
  assert.deepEqual(calls[1], ["sent", "warm1", "<zoho-warmup-1@example.com>"]);
});

test("records spam placement, rescues it, marks important, and sometimes replies", async () => {
  const calls = [];
  const result = await runWarmupCycle({
    db: {
      getWarmupReadyMailboxes: async () => [],
      getWarmupSeeds: async () => [],
      claimWarmupMessages: async () => [],
      getSentWarmupMessagesNeedingCheck: async () => [
        {
          id: "warm1",
          workspace_id: "ws1",
          mailbox_id: "mb1",
          seed_account_id: "seed1",
          token: "WMUP-1",
          sender: { warmup_reply_rate_percent: 100 },
          seed: { composio_user_id: "seed-user", composio_connected_account_id: "ca_seed" },
        },
      ],
      markWarmupPlacement: async (id, folder, gmailMessageId, threadId) => calls.push(["placement", folder, gmailMessageId, threadId]),
      markWarmupRescued: async (id) => calls.push(["rescued", id]),
      markWarmupImportant: async (id) => calls.push(["important", id]),
      markWarmupReplied: async (id) => calls.push(["replied", id]),
      insertWarmupEvent: async (row) => calls.push(["event", row.event_type]),
    },
    gmail: {
      findWarmupMessage: async () => ({ id: "gmail-1", threadId: "thread-1", folder: "spam" }),
      moveFromSpamToInbox: async () => calls.push(["gmail", "move"]),
      markImportant: async () => calls.push(["gmail", "important"]),
      replyToThread: async () => calls.push(["gmail", "reply"]),
    },
    shouldReply: (sender) => Number(sender.warmup_reply_rate_percent) === 100,
    sendMail: async () => {},
  });

  assert.equal(result.savedFromSpam, 1);
  assert.deepEqual(calls.filter((call) => call[0] === "gmail").map((call) => call[1]), ["move", "important", "reply"]);
});
