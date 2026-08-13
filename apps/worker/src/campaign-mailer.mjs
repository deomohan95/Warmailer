import { createHmac } from "node:crypto";

export function renderTemplate(text, lead) {
  const name = String(lead.name ?? "").trim();
  const firstName = name.split(/\s+/)[0] || name;
  return String(text ?? "")
    .replaceAll("{{first_name}}", firstName)
    .replaceAll("{{name}}", name)
    .replaceAll("{{company}}", String(lead.company ?? ""))
    .replaceAll("{{job_title}}", String(lead.job_title ?? ""));
}

export function buildOpenTrackingUrl({ baseUrl, hmacKey, workspaceId, messageId }) {
  const url = new URL("/api/track/open", String(baseUrl).replace(/\/$/, ""));
  url.searchParams.set("w", workspaceId);
  url.searchParams.set("m", messageId);
  url.searchParams.set("s", signOpen({ hmacKey, workspaceId, messageId }));
  return url.toString();
}

export function isCampaignDue(campaign, now = new Date()) {
  if (!["scheduled", "sending"].includes(campaign.status)) return false;
  const parts = zonedParts(now, campaign.timezone || "UTC");
  const days = Array.isArray(campaign.sending_days) ? campaign.sending_days : [];
  return (
    (!campaign.start_date || campaign.start_date <= parts.date) &&
    (days.length === 0 || days.includes(parts.day)) &&
    parts.time >= campaign.sending_window_start.slice(0, 5) &&
    parts.time < campaign.sending_window_end.slice(0, 5)
  );
}

export async function sendDueCampaigns({ db, sendMail, decryptSecret, tracking, now = new Date(), limit = 25 }) {
  const summary = { campaigns: 0, sent: 0, skipped: 0, failed: 0 };
  const campaigns = (await db.getDueCampaigns()).filter((campaign) => isCampaignDue(campaign, now));

  for (const campaign of campaigns) {
    summary.campaigns++;
    const step = await db.getFirstSequenceStep(campaign.id);
    if (!step) continue;

    const [mailboxes, leads] = await Promise.all([
      db.getUsableMailboxes(campaign.id),
      db.getSendableLeads(campaign.id, limit),
    ]);
    const capacity = mailboxes.reduce((sum, mailbox) => sum + Number(mailbox.available_today ?? 0), 0);
    const max = Math.min(Number(campaign.max_sends_per_day ?? limit), capacity, leads.length, limit);
    if (max <= 0) continue;

    await db.markCampaignSending(campaign.id);

    for (const lead of leads.slice(0, max)) {
      const mailbox = mailboxes.find((item) => Number(item.available_today ?? 0) > 0);
      if (!mailbox) break;

      mailbox.available_today = Number(mailbox.available_today) - 1;
      const sent = await sendCampaignLead({ db, sendMail, decryptSecret, campaign, step, lead, mailbox, now, tracking });
      summary[sent ? "sent" : "failed"]++;
    }

    await db.completeCampaignIfDone(campaign.id);
  }

  return summary;
}

async function sendCampaignLead({ db, sendMail, decryptSecret, campaign, step, lead, mailbox, now, tracking }) {
  const nowIso = now.toISOString();
  await db.markLeadQueued(lead.campaign_lead_id);

  const subject = renderTemplate(step.subject, lead);
  const body = renderTemplate(step.body, lead);
  const message = await db.insertMessage({
    workspace_id: campaign.workspace_id,
    campaign_id: campaign.id,
    lead_id: lead.lead_id,
    mailbox_id: mailbox.id,
    direction: "outbound",
    subject,
    body_text: body,
    body_preview: body.slice(0, 240),
    created_at: nowIso,
  });
  await db.insertMessageEvent({
    workspace_id: campaign.workspace_id,
    message_id: message.id,
    event_type: "queued",
    source: "system",
    occurred_at: nowIso,
    metadata: { campaignLeadId: lead.campaign_lead_id },
  });

  try {
    const openUrl = tracking
      ? buildOpenTrackingUrl({
          ...tracking,
          workspaceId: campaign.workspace_id,
          messageId: message.id,
        })
      : null;
    const result = await sendMail({
      host: mailbox.smtp_host,
      port: mailbox.smtp_port,
      user: mailbox.email_address,
      pass: decryptSecret(mailbox.encrypted_app_password, mailbox.id),
      from: `${mailbox.display_name} <${mailbox.email_address}>`,
      to: lead.email,
      subject,
      text: body,
      ...(openUrl ? { html: renderHtml(body, openUrl) } : {}),
    });
    await db.markMessageAccepted(message.id, result.messageId, nowIso);
    await db.insertMessageEvent({
      workspace_id: campaign.workspace_id,
      message_id: message.id,
      event_type: "smtp_accepted",
      source: "zoho_mail",
      provider_event_id: result.messageId ? `smtp:${result.messageId}` : undefined,
      occurred_at: nowIso,
      metadata: {},
    });
    await db.markLeadSent(lead.campaign_lead_id);
    await db.consumeMailboxSend(mailbox.id, mailbox.workspace_id, mailbox.timezone, now);
    return true;
  } catch (error) {
    await db.insertMessageEvent({
      workspace_id: campaign.workspace_id,
      message_id: message.id,
      event_type: "failed",
      source: "zoho_mail",
      occurred_at: nowIso,
      metadata: { error: String(error?.message ?? error).slice(0, 500) },
    });
    return false;
  }
}

function signOpen({ hmacKey, workspaceId, messageId }) {
  return createHmac("sha256", hmacKey).update(`${workspaceId}:${messageId}`).digest("base64url");
}

function renderHtml(body, openUrl) {
  return `${escapeHtml(body).replace(/\r?\n/g, "<br>")}<img src="${escapeHtml(openUrl)}" width="1" height="1" alt="" style="display:none" />`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return map[char];
  });
}

function zonedParts(now, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  );
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}`, day };
}
