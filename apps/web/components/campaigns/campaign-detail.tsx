"use client";

import { useState } from "react";

import { IconAlert, IconCampaigns, IconInbox, IconMailbox } from "@/components/icons";
import { Card, CardHead, EmptyState, Meter, Notice, StatusPill } from "@/components/ui/primitives";
import { availableToday, campaignDailyCapacity, estimatedDaysToComplete, isSendable } from "@/lib/capacity";
import { CAMPAIGN_STATUS, formatDateTime, formatSendingDays, LEAD_STATUS, MAILBOX_STATUS } from "@/lib/labels";
import type { Campaign, CampaignActivity, Lead, Mailbox } from "@/lib/types";

const TABS = ["Overview", "Leads", "Sequence", "Mailboxes", "Activity"] as const;

type Tab = (typeof TABS)[number];

/** Written labels for every event type — activity is never colour or icon alone. */
const EVENT_LABELS: Record<CampaignActivity["eventType"], string> = {
  scheduled: "Scheduled",
  sent: "Sent",
  delivered: "Delivered",
  opened: "Opened",
  replied: "Replied",
  bounced: "Bounced",
  paused: "Paused",
  resumed: "Resumed",
  stopped: "Stopped",
};

export function CampaignDetail({
  campaign,
  leads,
  mailboxes,
  activity,
}: {
  campaign: Campaign;
  leads: Lead[];
  mailboxes: Mailbox[];
  activity: CampaignActivity[];
}) {
  const [tab, setTab] = useState<Tab>("Overview");

  // Capacity is recomputed from the mailboxes as they stand now, not from the
  // number stored on the campaign — hard limits move during the day.
  const capacity = campaignDailyCapacity(mailboxes);
  const remaining = campaign.selectedLeadCount;
  const days = estimatedDaysToComplete(remaining, Math.min(capacity, campaign.schedule.maxSendsPerDay || capacity));
  const sendEvents = activity.filter((event) => event.eventType === "sent");
  const openEvents = activity.filter((event) => event.eventType === "opened");
  const replyEvents = activity.filter((event) => event.eventType === "replied");
  const running = campaign.status === "sending" || campaign.status === "scheduled";

  const counts: Record<Tab, number | null> = {
    Overview: null,
    Leads: leads.length,
    Sequence: campaign.sequence.length,
    Mailboxes: mailboxes.length,
    Activity: activity.length,
  };

  return (
    <>
      <div className="tabs" role="tablist" aria-label="Campaign sections">
        {TABS.map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            className="tab"
            aria-selected={tab === name}
            onClick={() => setTab(name)}
          >
            {name}
            {counts[name] === null ? null : <span className="tab-count">{counts[name]}</span>}
          </button>
        ))}
      </div>

      {tab === "Overview" ? (
        <div className="stack section" style={{ gap: "var(--s-4)" }}>
          <div className="grid-2">
            <Card>
              <CardHead title="Campaign" display />
              <div className="card-body">
                <dl className="review-grid">
                  <dt>Status</dt>
                  <dd>
                    <StatusPill {...CAMPAIGN_STATUS[campaign.status]} />
                  </dd>
                  <dt>Selected leads</dt>
                  <dd>{campaign.selectedLeadCount.toLocaleString()}</dd>
                  <dt>Selected mailboxes</dt>
                  <dd>{campaign.selectedMailboxCount}</dd>
                  <dt>Capacity available today</dt>
                  <dd>{capacity.toLocaleString()}</dd>
                  <dt>Estimated days to complete</dt>
                  <dd>{days === null ? <span className="subtle">Not calculable yet</span> : days}</dd>
                  <dt>Schedule</dt>
                  <dd>
                    {formatSendingDays(campaign.schedule.sendingDays)}, {campaign.schedule.windowStart}–
                    {campaign.schedule.windowEnd} {campaign.schedule.timezone}
                  </dd>
                  <dt>Last activity</dt>
                  <dd>
                    {campaign.lastActivityAt ? (
                      formatDateTime(campaign.lastActivityAt)
                    ) : (
                      <span className="subtle">No activity yet</span>
                    )}
                  </dd>
                </dl>
              </div>
              <div className="card-foot">
                This campaign sends only through its selected mailboxes and cannot exceed their hard limits.
              </div>
            </Card>

            <Card>
              <CardHead title="Results" display />
              <div className="card-body stack" style={{ gap: "var(--s-3)" }}>
                <Notice icon={<IconAlert />}>
                  {sendEvents.length === 0
                    ? "No send events recorded yet."
                    : `${sendEvents.length} send event${sendEvents.length === 1 ? "" : "s"} recorded.`}
                </Notice>
                <Notice icon={<IconInbox size={15} />}>
                  {replyEvents.length === 0
                    ? "No replies synced yet."
                    : `${replyEvents.length} ${replyEvents.length === 1 ? "reply" : "replies"} synced.`}
                </Notice>
                <Notice icon={<IconAlert />}>
                  {openEvents.length === 0
                    ? "No opens recorded yet."
                    : `${openEvents.length} open event${openEvents.length === 1 ? "" : "s"} recorded.`}
                </Notice>
                <p className="subtle" style={{ fontSize: 12.5 }}>
                  Delivery, open, reply and bounce figures appear here once the mail worker records events. Nothing on
                  this page is estimated.
                </p>
              </div>
            </Card>
          </div>

          <Card>
            <CardHead title="Controls" display />
            <div className="card-body stack" style={{ gap: "var(--s-3)" }}>
              <div className="row" style={{ gap: "var(--s-2)", flexWrap: "wrap" }}>
                <button type="button" className="btn btn-secondary" disabled>
                  {running ? "Pause sending" : "Resume sending"}
                </button>
                <button type="button" className="btn btn-danger" disabled>
                  Stop campaign
                </button>
              </div>
              <p className="subtle" style={{ fontSize: 12.5 }}>
                Controls are disabled until the mail worker is wired — nothing here reaches a mailbox yet.
              </p>
            </div>
          </Card>
        </div>
      ) : null}

      {tab === "Leads" ? (
        <Card className="section">
          <div className="card-body card-body-flush">
            {leads.length === 0 ? (
              <EmptyState
                small
                title="No leads resolved for this campaign yet"
                description="Enrolled leads appear here once the campaign's lead set is stored."
              />
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th scope="col">Lead</th>
                      <th scope="col">Company</th>
                      <th scope="col">Email</th>
                      <th scope="col">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leads.map((lead) => (
                      <tr key={lead.leadId}>
                        <td>
                          <div className="cell-strong">{lead.name}</div>
                          <div className="cell-sub">{lead.jobTitle}</div>
                        </td>
                        <td>{lead.company}</td>
                        <td>{lead.email ?? <span className="subtle">—</span>}</td>
                        <td>
                          <StatusPill {...LEAD_STATUS[lead.emailStatus]} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div className="card-foot">
            Showing the {leads.length.toLocaleString()} enrolled leads this build can resolve, of{" "}
            {campaign.selectedLeadCount.toLocaleString()} selected.
          </div>
        </Card>
      ) : null}

      {tab === "Sequence" ? (
        <Card className="section">
          <div className="card-body">
            {campaign.sequence.length === 0 ? (
              <EmptyState small title="No sequence written yet" description="This campaign has no emails to send." />
            ) : (
              <div className="stack" style={{ gap: "var(--s-5)" }}>
                {campaign.sequence.map((step, index) => (
                  <div key={step.stepId} className="stack" style={{ gap: 6 }}>
                    <div className="row" style={{ gap: "var(--s-2)" }}>
                      <h3 style={{ fontSize: 13.5 }}>{index === 0 ? "First email" : `Follow-up ${index}`}</h3>
                      {index > 0 ? (
                        <span className="subtle" style={{ fontSize: 12.5 }}>
                          after {step.delayDays} day{step.delayDays === 1 ? "" : "s"}
                        </span>
                      ) : null}
                    </div>
                    <div className="cell-strong">{step.subject}</div>
                    <div className="message-body" style={{ whiteSpace: "pre-wrap" }}>
                      {step.body}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      ) : null}

      {tab === "Mailboxes" ? (
        <Card className="section">
          <div className="card-body">
            {mailboxes.length === 0 ? (
              <EmptyState
                small
                icon={<IconMailbox />}
                title="No mailbox connected yet"
                description="A campaign with no mailbox cannot send. Connect one from the Mailboxes page."
              />
            ) : (
              <div className="stack" style={{ gap: "var(--s-4)" }}>
                {mailboxes.map((mailbox) => (
                  <div key={mailbox.mailboxId} className="stack" style={{ gap: 6 }}>
                    <div className="row" style={{ gap: "var(--s-2)" }}>
                      <span className="cell-strong">{mailbox.emailAddress}</span>
                      <StatusPill {...MAILBOX_STATUS[mailbox.status]} />
                      <div className="spacer" />
                      <span className="subtle" style={{ fontSize: 12 }}>
                        {mailbox.sendingWindowStart}–{mailbox.sendingWindowEnd} {mailbox.timezone}
                      </span>
                    </div>
                    <Meter
                      label={`Daily hard limit ${mailbox.dailyHardLimit}`}
                      value={mailbox.usedToday + mailbox.reservedToday}
                      max={mailbox.dailyHardLimit}
                      valueLabel={`${availableToday(mailbox)} available today`}
                      tone={isSendable(mailbox) ? "accent" : "warning"}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="card-foot">
            Capacity available today across these mailboxes: <strong className="num">{capacity.toLocaleString()}</strong>
            .
          </div>
        </Card>
      ) : null}

      {tab === "Activity" ? (
        <Card className="section">
          <div className="card-body card-body-flush">
            {activity.length === 0 ? (
              <EmptyState
                small
                icon={<IconCampaigns />}
                title="No send events recorded yet"
                description="Every send, reply and bounce will appear here with the lead, mailbox and message it belongs to."
              />
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th scope="col">Event</th>
                      <th scope="col">Occurred</th>
                      <th scope="col">Lead</th>
                      <th scope="col">Mailbox</th>
                      <th scope="col">Message</th>
                      <th scope="col">Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activity.map((event) => (
                      <tr key={event.entityId}>
                        <td className="cell-strong">{EVENT_LABELS[event.eventType]}</td>
                        <td className="muted num">{formatDateTime(event.occurredAt)}</td>
                        <td className="muted">{event.leadId ?? "—"}</td>
                        <td className="muted">{event.mailboxId ?? "—"}</td>
                        <td className="muted">{event.messageId ?? "—"}</td>
                        <td>
                          <code className="tag">{event.source}</code>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div className="card-foot">
            Each row traces back through message → mailbox → lead → campaign, and forward to the reply thread in Inbox.
          </div>
        </Card>
      ) : null}
    </>
  );
}
