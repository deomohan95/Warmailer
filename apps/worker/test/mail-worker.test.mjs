import assert from "node:assert/strict";
import test from "node:test";

import { buildOpenTrackingUrl, sendDueCampaigns } from "../src/campaign-mailer.mjs";
import { syncInboundReplies } from "../src/inbox-sync.mjs";
import { buildSmtpReply, selectedMailJobs } from "../src/mail-worker.mjs";

test("sends due campaign leads through selected mailbox and records source rows", async () => {
  const calls = [];
  const db = {
    getDueCampaigns: async () => [
      {
        id: "campaign-1",
        workspace_id: "workspace-1",
        name: "Test campaign",
        status: "scheduled",
        timezone: "Asia/Kolkata",
        start_date: "2026-08-13",
        sending_days: [1, 2, 3, 4, 5],
        sending_window_start: "09:00",
        sending_window_end: "17:00",
        max_sends_per_day: 10,
      },
    ],
    getFirstSequenceStep: async () => ({ subject: "Hi {{first_name}}", body: "Hello {{company}}" }),
    getSendableLeads: async () => [
      {
        campaign_lead_id: "campaign-lead-1",
        lead_id: "lead-1",
        name: "Corey Clark",
        company: "Natural Data Inc",
        job_title: "Vendor Manager",
        email: "corey@example.com",
      },
    ],
    getUsableMailboxes: async () => [
      {
        id: "mailbox-1",
        workspace_id: "workspace-1",
        email_address: "sender@example.com",
        display_name: "Sender",
        smtp_host: "smtp.zoho.com",
        smtp_port: 465,
        encrypted_app_password: { ciphertext: "secret" },
        available_today: 25,
      },
    ],
    markCampaignSending: async (campaignId) => calls.push(["campaign", campaignId, "sending"]),
    markLeadQueued: async (campaignLeadId) => calls.push(["lead", campaignLeadId, "queued"]),
    insertMessage: async (row) => {
      calls.push(["message", row]);
      return { id: "message-1", ...row };
    },
    insertMessageEvent: async (row) => calls.push(["event", row.event_type, row.message_id]),
    markMessageAccepted: async (messageId, providerMessageId) => calls.push(["accepted", messageId, providerMessageId]),
    markLeadSent: async (campaignLeadId) => calls.push(["lead", campaignLeadId, "sent"]),
    consumeMailboxSend: async (mailboxId) => calls.push(["usage", mailboxId]),
    completeCampaignIfDone: async (campaignId) => calls.push(["campaign", campaignId, "maybe-complete"]),
  };

  const result = await sendDueCampaigns({
    db,
    now: new Date("2026-08-13T07:00:00.000Z"),
    decryptSecret: () => "app-password",
    sendMail: async (payload) => {
      calls.push(["send", payload.to, payload.subject, payload.text]);
      return { messageId: "<zoho-1@example.com>" };
    },
  });

  assert.equal(result.sent, 1);
  assert.deepEqual(
    calls.find((call) => call[0] === "send"),
    ["send", "corey@example.com", "Hi Corey", "Hello Natural Data Inc"],
  );
  assert.equal(calls.some((call) => call[0] === "accepted"), true);
  assert.equal(calls.some((call) => call[0] === "usage"), true);
});

test("adds a signed open tracking pixel to outbound campaign html", async () => {
  const sent = [];
  const db = {
    getDueCampaigns: async () => [
      {
        id: "campaign-1",
        workspace_id: "workspace-1",
        status: "scheduled",
        timezone: "UTC",
        start_date: "2026-08-13",
        sending_days: [],
        sending_window_start: "00:00",
        sending_window_end: "23:59",
        max_sends_per_day: 1,
      },
    ],
    getFirstSequenceStep: async () => ({ subject: "Hi", body: "Line 1\nLine <2>" }),
    getSendableLeads: async () => [
      { campaign_lead_id: "campaign-lead-1", lead_id: "lead-1", name: "Corey", email: "corey@example.com" },
    ],
    getUsableMailboxes: async () => [
      {
        id: "mailbox-1",
        workspace_id: "workspace-1",
        email_address: "sender@example.com",
        display_name: "Sender",
        encrypted_app_password: {},
        available_today: 1,
      },
    ],
    markCampaignSending: async () => {},
    markLeadQueued: async () => {},
    insertMessage: async (row) => ({ id: "message-1", ...row }),
    insertMessageEvent: async () => {},
    markMessageAccepted: async () => {},
    markLeadSent: async () => {},
    consumeMailboxSend: async () => {},
    completeCampaignIfDone: async () => {},
  };

  await sendDueCampaigns({
    db,
    now: new Date("2026-08-13T07:00:00.000Z"),
    decryptSecret: () => "app-password",
    tracking: {
      baseUrl: "https://warmailer-app.vercel.app/",
      hmacKey: Buffer.alloc(32, 7),
    },
    sendMail: async (payload) => {
      sent.push(payload);
      return { messageId: "<zoho-1@example.com>" };
    },
  });

  const html = sent[0].html;
  assert.match(html, /^Line 1<br>Line &lt;2&gt;<img /);
  assert.match(html, /src="https:\/\/warmailer-app\.vercel\.app\/api\/track\/open\?w=workspace-1&amp;m=message-1&amp;s=/);
});

test("builds deterministic signed open tracking urls", () => {
  assert.equal(
    buildOpenTrackingUrl({
      baseUrl: "https://warmailer-app.vercel.app/",
      hmacKey: Buffer.alloc(32, 7),
      workspaceId: "workspace-1",
      messageId: "message-1",
    }),
    "https://warmailer-app.vercel.app/api/track/open?w=workspace-1&m=message-1&s=rs_gcrmZkaQfNIC3_CjTfoXlLjolrrt6UQRT0FH0gwo",
  );
});

test("syncs an inbound reply onto the original outbound thread", async () => {
  const calls = [];
  const db = {
    getConnectedMailboxes: async () => [{ id: "mailbox-1", email_address: "sender@example.com" }],
    findMessageByProviderId: async () => ({
      id: "outbound-1",
      workspace_id: "workspace-1",
      mailbox_id: "mailbox-1",
      lead_id: "lead-1",
      campaign_id: "campaign-1",
      subject: "Hi Corey",
      thread_id: "thread-1",
    }),
    messageExists: async () => false,
    upsertThreadForReply: async (row) => {
      calls.push(["thread", row.provider_thread_id, row.lead_id, row.campaign_id]);
      return { id: "thread-1", ...row };
    },
    attachMessageToThread: async (messageId, threadId) => calls.push(["attach", messageId, threadId]),
    insertMessage: async (row) => {
      calls.push(["message", row.direction, row.thread_id, row.provider_message_id]);
      return { id: "inbound-1", ...row };
    },
    insertMessageEvent: async (row) => calls.push(["event", row.event_type, row.message_id]),
    markCampaignLeadReplied: async (campaignId, leadId) => calls.push(["lead", campaignId, leadId, "replied"]),
  };

  const result = await syncInboundReplies({
    db,
    fetchMessages: async () => [
      {
        messageId: "<reply-1@example.com>",
        inReplyTo: "<zoho-1@example.com>",
        from: "corey@example.com",
        subject: "Re: Hi Corey",
        text: "Sounds good",
        receivedAt: "2026-08-13T07:05:00.000Z",
      },
    ],
  });

  assert.equal(result.synced, 1);
  assert.deepEqual(calls[0], ["thread", "<zoho-1@example.com>", "lead-1", "campaign-1"]);
  assert.deepEqual(calls[1], ["attach", "outbound-1", "thread-1"]);
  assert.deepEqual(calls.at(-1), ["lead", "campaign-1", "lead-1", "replied"]);
});

test("skips inbound mail that is not a reply to a tracked outbound message", async () => {
  const calls = [];
  const result = await syncInboundReplies({
    db: {
      getConnectedMailboxes: async () => [{ id: "mailbox-1", email_address: "sender@example.com" }],
      messageExists: async () => false,
      findMessageByProviderId: async () => null,
      upsertThreadForReply: async (row) => calls.push(["thread", row]),
      insertMessage: async (row) => calls.push(["message", row]),
      insertMessageEvent: async (row) => calls.push(["event", row]),
      markCampaignLeadReplied: async () => calls.push(["lead"]),
    },
    fetchMessages: async () => [
      {
        messageId: "<newsletter@example.com>",
        from: "news@example.com",
        subject: "Not a reply",
        text: "Noise",
        receivedAt: "2026-08-13T07:05:00.000Z",
      },
      {
        messageId: "<orphan-reply@example.com>",
        inReplyTo: "<unknown@example.com>",
        from: "lead@example.com",
        subject: "Re: unknown",
        text: "Noise",
        receivedAt: "2026-08-13T07:06:00.000Z",
      },
    ],
  });

  assert.equal(result.synced, 0);
  assert.equal(result.skipped, 2);
  assert.deepEqual(calls, []);
});

test("builds replies with same-thread headers", () => {
  assert.deepEqual(
    buildSmtpReply({
      from: "Sender <sender@example.com>",
      to: "lead@example.com",
      subject: "Original subject",
      body: "Reply body",
      parentMessageId: "<parent@example.com>",
    }),
    {
      from: "Sender <sender@example.com>",
      to: "lead@example.com",
      subject: "Re: Original subject",
      text: "Reply body",
      inReplyTo: "<parent@example.com>",
      references: "<parent@example.com>",
    },
  );
});

test("supports sync-only worker runs without campaign sending", () => {
  assert.deepEqual(selectedMailJobs(["--sync-only"]), { send: false, sync: true });
  assert.deepEqual(selectedMailJobs(["--send-only"]), { send: true, sync: false });
  assert.deepEqual(selectedMailJobs([]), { send: true, sync: true });
});
