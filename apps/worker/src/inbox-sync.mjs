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

function stripReplyPrefix(subject) {
  return String(subject).replace(/^(re|fw|fwd):\s*/i, "");
}
