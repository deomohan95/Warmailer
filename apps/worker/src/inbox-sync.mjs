export async function syncInboundReplies({ db, fetchMessages }) {
  const summary = { mailboxes: 0, synced: 0, skipped: 0 };
  const mailboxes = await db.getConnectedMailboxes();

  for (const mailbox of mailboxes) {
    summary.mailboxes++;
    const inboundMessages = await fetchMessages(mailbox);

    for (const inbound of inboundMessages) {
      if (!inbound.messageId || (await db.messageExists(mailbox.id, inbound.messageId))) {
        summary.skipped++;
        continue;
      }

      const bounce = detectBounce(inbound);
      if (bounce) {
        const parent = await db.findMessageByProviderId(mailbox.id, bounce.providerMessageId);
        if (!parent?.campaign_id || !parent?.lead_id) {
          summary.skipped++;
          continue;
        }
        const workspaceId = parent?.workspace_id ?? mailbox.workspace_id;
        await db.insertMessageEvent({
          workspace_id: workspaceId,
          message_id: parent.id,
          event_type: "bounce",
          source: "zoho_mail",
          provider_event_id: `imap:${inbound.messageId}`,
          occurred_at: inbound.receivedAt,
          metadata: bounce,
        });
        await db.markCampaignLeadBounced?.(parent.campaign_id, parent.lead_id);
        summary.synced++;
        continue;
      }

      const parentId = inbound.inReplyTo || inbound.references?.at?.(-1) || null;
      if (!parentId) {
        summary.skipped++;
        continue;
      }

      const parent = await db.findMessageByProviderId(mailbox.id, parentId);
      if (!parent?.campaign_id || !parent?.lead_id) {
        summary.skipped++;
        continue;
      }
      const workspaceId = parent?.workspace_id ?? mailbox.workspace_id;
      const thread = await db.upsertThreadForReply({
        workspace_id: workspaceId,
        mailbox_id: mailbox.id,
        lead_id: parent?.lead_id ?? null,
        campaign_id: parent?.campaign_id ?? null,
        provider_thread_id: parent?.provider_message_id ?? parentId ?? inbound.messageId,
        from_email: inbound.from,
        subject: stripReplyPrefix(inbound.subject || parent?.subject || ""),
        status: "unread",
        last_message_at: inbound.receivedAt,
      });
      await db.attachMessageToThread?.(parent.id, thread.id);
      const message = await db.insertMessage({
        workspace_id: workspaceId,
        thread_id: thread.id,
        campaign_id: parent?.campaign_id ?? null,
        lead_id: parent?.lead_id ?? null,
        mailbox_id: mailbox.id,
        direction: "inbound",
        provider_message_id: inbound.messageId,
        subject: inbound.subject ?? "",
        body_text: inbound.text ?? "",
        body_preview: String(inbound.text ?? "").slice(0, 240),
        received_at: inbound.receivedAt,
        created_at: inbound.receivedAt,
      });
      await db.insertMessageEvent({
        workspace_id: workspaceId,
        message_id: message.id,
        event_type: "reply",
        source: "zoho_mail",
        provider_event_id: `imap:${inbound.messageId}`,
        occurred_at: inbound.receivedAt,
        metadata: { inReplyTo: parentId },
      });
      if (parent?.campaign_id && parent?.lead_id) await db.markCampaignLeadReplied(parent.campaign_id, parent.lead_id);
      summary.synced++;
    }
  }

  return summary;
}

export function detectBounce(inbound) {
  const subject = String(inbound.subject ?? "");
  const text = String(inbound.text ?? "");
  const from = String(inbound.from ?? "");
  const blob = `${subject}\n${text}`;
  const looksLikeBounce = /mailer-daemon|postmaster/i.test(from) || /delivery status notification|delivery failure|undeliver/i.test(subject) || /Final-Recipient:|Diagnostic-Code:|Action:\s*failed/i.test(text);
  if (!looksLikeBounce) return null;

  const providerMessageId = firstMatch(blob, /Original-Message-ID:\s*(<[^>]+>)/i) ?? inbound.inReplyTo ?? inbound.references?.at?.(-1) ?? null;
  if (!providerMessageId) return null;

  const status = firstMatch(text, /Status:\s*([^\r\n]+)/i);
  const diagnostic = firstMatch(text, /Diagnostic-Code:\s*([^\r\n]+)/i);
  const reason = `${status ?? ""} ${diagnostic ?? ""}`;
  const bounceType = /^5\./.test(status ?? "") || /user unknown|no such user|invalid recipient|domain not found/i.test(reason) ? "hard" : "soft";

  return { providerMessageId, status, diagnostic, bounceType };
}

function firstMatch(value, regex) {
  return regex.exec(value)?.[1]?.trim() ?? null;
}

function stripReplyPrefix(subject) {
  return String(subject).replace(/^(re|fw|fwd):\s*/i, "");
}
