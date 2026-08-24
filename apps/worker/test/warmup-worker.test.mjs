import assert from "node:assert/strict";
import test from "node:test";

import { createComposioGmail } from "../src/composio-gmail.mjs";
import { runWarmupCycle, warmupTargetForDay } from "../src/warmup-worker.mjs";

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

  await gmail.sendEmail({
    userId: "seed-user",
    connectedAccountId: "ca_seed",
    to: "sender@example.com",
    subject: "Quick note",
    body: "Checking in",
  });
  assert.match(String(calls[1][0]), /GMAIL_SEND_EMAIL$/);
  assert.equal(JSON.parse(calls[1][1].body).arguments.recipient_email, "sender@example.com");
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

test("schedules fresh seed-to-mailbox originals until the inbound warmup share is met", async () => {
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
          warmup_started_at: "2026-08-14T00:00:00.000Z",
          warmup_count_today: 0,
          warmup_inbound_count_today: 0,
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
  assert.equal(inserted[0].direction, "seed_to_mailbox");
});

test("uses mailbox inbound percentage instead of a hardcoded 20 percent split", async () => {
  const inserted = [];
  await runWarmupCycle({
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
          warmup_inbound_original_percent: 40,
          warmup_started_at: "2026-08-14T00:00:00.000Z",
          warmup_count_today: 1,
          warmup_inbound_count_today: 1,
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

  assert.equal(inserted[0].direction, "seed_to_mailbox");
});

test("schedules mailbox-to-seed after the inbound warmup share is met", async () => {
  const inserted = [];
  await runWarmupCycle({
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
          warmup_started_at: "2026-08-14T00:00:00.000Z",
          warmup_count_today: 1,
          warmup_inbound_count_today: 1,
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

  assert.equal(inserted[0].direction, "mailbox_to_seed");
});

test("does not schedule beyond today's queued warmup target", async () => {
  const inserted = [];
  const result = await runWarmupCycle({
    now: new Date("2026-08-14T10:00:00.000Z"),
    db: {
      getWarmupReadyMailboxes: async () => [
        {
          id: "mb1",
          workspace_id: "ws1",
          warmup_daily_limit: 25,
          warmup_daily_rampup: 5,
          warmup_randomize_daily_count: false,
          warmup_started_at: "2026-08-14T00:00:00.000Z",
          warmup_count_today: 5,
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

  assert.equal(result.scheduled, 0);
  assert.equal(inserted.length, 0);
});

test("uses one randomized warmup target for the mailbox day", () => {
  const random = Math.random;
  const mailbox = {
    id: "mb1",
    warmup_daily_limit: 25,
    warmup_daily_rampup: 5,
    warmup_randomize_daily_count: true,
    warmup_random_min_percent: 50,
    warmup_started_at: "2026-08-14T00:00:00.000Z",
  };
  try {
    Math.random = () => 0;
    const first = warmupTargetForDay(mailbox, new Date("2026-08-16T10:00:00.000Z"));
    Math.random = () => 0.99;
    const second = warmupTargetForDay(mailbox, new Date("2026-08-16T20:00:00.000Z"));

    assert.equal(first, second);
    assert.ok(first >= 8 && first <= 15);
  } finally {
    Math.random = random;
  }
});

test("randomized warmup target floor scales with the ramped daily target", () => {
  const mailbox = {
    id: "mb1",
    warmup_daily_limit: 40,
    warmup_daily_rampup: 40,
    warmup_randomize_daily_count: true,
    warmup_random_min_percent: 50,
    warmup_started_at: "2026-08-14T00:00:00.000Z",
  };

  const target = warmupTargetForDay(mailbox, new Date("2026-08-14T10:00:00.000Z"));

  assert.ok(target >= 20 && target <= 40);
});

test("balances scheduled warmup messages across seed accounts", async () => {
  const inserted = [];
  const mailboxes = ["mb1", "mb2", "mb3"].map((id) => ({
    id,
    workspace_id: "ws1",
    warmup_daily_limit: 25,
    warmup_daily_rampup: 5,
    warmup_randomize_daily_count: false,
    warmup_started_at: "2026-08-14T00:00:00.000Z",
    warmup_count_today: 0,
  }));

  await runWarmupCycle({
    now: new Date("2026-08-14T10:00:00.000Z"),
    db: {
      getWarmupReadyMailboxes: async () => mailboxes,
      getWarmupSeeds: async () => [
        { id: "seed1", workspace_id: "ws1", email_address: "a@gmail.com", warmup_count_24h: 0 },
        { id: "seed2", workspace_id: "ws1", email_address: "b@gmail.com", warmup_count_24h: 0 },
      ],
      insertWarmupMessage: async (row) => inserted.push(row),
      claimWarmupMessages: async () => [],
      getSentWarmupMessagesNeedingCheck: async () => [],
    },
    sendMail: async () => {},
    gmail: {},
  });

  assert.deepEqual(
    inserted.map((row) => row.seed_account_id),
    ["seed1", "seed2", "seed1"],
  );
});

test("schedules inside the mailbox timezone window", async () => {
  const random = Math.random;
  Math.random = () => 0;
  const inserted = [];
  try {
    await runWarmupCycle({
      now: new Date("2026-08-14T05:00:00.000Z"),
      db: {
        getWarmupReadyMailboxes: async () => [
          {
            id: "mb1",
            workspace_id: "ws1",
            warmup_daily_limit: 25,
            warmup_daily_rampup: 5,
            warmup_randomize_daily_count: false,
            warmup_started_at: "2026-08-14T00:00:00.000Z",
            warmup_count_today: 0,
            timezone: "Asia/Kolkata",
            sending_window_start: "09:00",
            sending_window_end: "17:00",
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
  } finally {
    Math.random = random;
  }

  assert.equal(inserted[0].scheduled_for, "2026-08-14T05:00:00.000Z");
});

test("schedules at the next window when the mailbox window already closed", async () => {
  const inserted = [];
  await runWarmupCycle({
    now: new Date("2026-08-14T12:30:00.000Z"),
    db: {
      getWarmupReadyMailboxes: async () => [
        {
          id: "mb1",
          workspace_id: "ws1",
          warmup_daily_limit: 25,
          warmup_daily_rampup: 5,
          warmup_randomize_daily_count: false,
          warmup_started_at: "2026-08-14T00:00:00.000Z",
          warmup_count_today: 0,
          timezone: "Asia/Kolkata",
          sending_window_start: "09:00",
          sending_window_end: "17:00",
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

  assert.equal(inserted[0].scheduled_for, "2026-08-15T03:30:00.000Z");
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

test("sends seed-to-mailbox originals through the seed gmail account", async () => {
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
          direction: "seed_to_mailbox",
          token: "WMUP-1",
          subject: "Quick note",
          body_text: "Checking in WMUP-1",
          sender: { email_address: "sender@example.com", display_name: "Sender" },
          seed: { email_address: "seed@gmail.com", composio_user_id: "seed-user", composio_connected_account_id: "ca_seed" },
        },
      ],
      markWarmupSent: async (id, messageId) => calls.push(["sent", id, messageId]),
      insertWarmupEvent: async (row) => calls.push(["event", row.event_type, row.source]),
      getSentWarmupMessagesNeedingCheck: async () => [],
    },
    gmail: {
      sendEmail: async (payload) => {
        calls.push(["gmail-send", payload.to, payload.subject]);
        return { data: { id: "gmail-sent-1" } };
      },
    },
    sendMail: async () => {
      throw new Error("wrong sender");
    },
  });

  assert.equal(result.sent, 1);
  assert.deepEqual(calls[0], ["gmail-send", "sender@example.com", "Quick note"]);
  assert.deepEqual(calls[1], ["sent", "warm1", "gmail-sent-1"]);
  assert.deepEqual(calls[2], ["event", "sent", "gmail_composio"]);
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

test("checks seed-to-mailbox placement in Zoho and rescues spam", async () => {
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
          direction: "seed_to_mailbox",
          token: "WMUP-1",
          sender: { email_address: "sender@example.com", warmup_inbound_reply_rate_percent: 0 },
          seed: { composio_user_id: "seed-user", composio_connected_account_id: "ca_seed" },
        },
      ],
      markWarmupPlacement: async (id, folder, messageId) => calls.push(["placement", folder, messageId]),
      markWarmupRescued: async (id) => calls.push(["rescued", id]),
      markWarmupImportant: async (id) => calls.push(["important", id]),
      markWarmupReplied: async (id) => calls.push(["replied", id]),
      insertWarmupEvent: async (row) => calls.push(["event", row.event_type, row.source]),
    },
    gmail: {},
    zoho: {
      findWarmupMessage: async (payload) => {
        calls.push(["zoho-find", payload.mailbox.email_address, payload.token]);
        return { id: "zoho-1", folder: "spam", folderPath: "Spam" };
      },
      moveFromSpamToInbox: async (payload) => calls.push(["zoho-move", payload.messageId]),
      markImportant: async (payload) => calls.push(["zoho-important", payload.messageId]),
    },
    sendMail: async () => {},
  });

  assert.equal(result.checked, 1);
  assert.equal(result.savedFromSpam, 1);
  assert.deepEqual(calls.map((call) => call.join(":")), [
    "zoho-find:sender@example.com:WMUP-1",
    "placement:spam:zoho-1",
    "event:landed_spam:zoho_mail",
    "zoho-move:zoho-1",
    "rescued:warm1",
    "event:saved_from_spam:zoho_mail",
    "zoho-important:zoho-1",
    "important:warm1",
    "event:marked_important:zoho_mail",
  ]);
});

test("replies from Zoho to seed-to-mailbox originals using the inbound reply rate", async () => {
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
          direction: "seed_to_mailbox",
          token: "WMUP-1",
          subject: "Quick note",
          sender: {
            id: "mb1",
            email_address: "sender@example.com",
            display_name: "Sender",
            encrypted_app_password: {},
            warmup_inbound_reply_rate_percent: 100,
          },
          seed: { email_address: "seed@gmail.com" },
        },
      ],
      markWarmupPlacement: async () => calls.push(["placement"]),
      markWarmupImportant: async () => calls.push(["important"]),
      markWarmupReplied: async (id) => calls.push(["replied", id]),
      insertWarmupEvent: async (row) => calls.push(["event", row.event_type, row.source]),
    },
    zoho: {
      findWarmupMessage: async () => ({
        id: "zoho-1",
        folder: "inbox",
        folderPath: "INBOX",
        messageId: "<seed-1@gmail.com>",
        subject: "Quick note",
      }),
      markImportant: async () => calls.push(["zoho-important"]),
    },
    decryptSecret: () => "app-password",
    sendMail: async (payload) => {
      calls.push(["mail", payload.from, payload.to, payload.subject, payload.inReplyTo]);
      return { messageId: "<zoho-reply-1@example.com>" };
    },
    shouldReplyToInbound: (sender) => Number(sender.warmup_inbound_reply_rate_percent) === 100,
  });

  assert.equal(result.replied, 1);
  assert.deepEqual(calls.filter((call) => call[0] === "mail")[0], [
    "mail",
    "Sender <sender@example.com>",
    "seed@gmail.com",
    "Re: Quick note",
    "<seed-1@gmail.com>",
  ]);
  assert.deepEqual(calls.filter((call) => call[0] === "replied")[0], ["replied", "warm1"]);
});

test("keeps spam rescue retryable when gmail move fails", async () => {
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
      markWarmupPlacement: async (id, folder) => calls.push(["placement", folder]),
      markWarmupRescued: async (id) => calls.push(["rescued", id]),
      markWarmupImportant: async (id) => calls.push(["important", id]),
      markWarmupReplied: async (id) => calls.push(["replied", id]),
      insertWarmupEvent: async (row) => calls.push(["event", row.event_type]),
    },
    gmail: {
      findWarmupMessage: async () => ({ id: "gmail-1", threadId: "thread-1", folder: "spam" }),
      moveFromSpamToInbox: async () => {
        calls.push(["gmail", "move"]);
        throw new Error("move failed");
      },
      markImportant: async () => calls.push(["gmail", "important"]),
      replyToThread: async () => calls.push(["gmail", "reply"]),
    },
    shouldReply: () => true,
    sendMail: async () => {},
  });

  assert.equal(result.failed, 1);
  assert.deepEqual(calls.map((call) => call.join(":")), [
    "placement:spam",
    "event:landed_spam",
    "gmail:move",
  ]);
});
