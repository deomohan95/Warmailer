"use client";

import Link from "next/link";
import { useState } from "react";

import {
  IconAlert,
  IconArrowRight,
  IconCampaigns,
  IconCheck,
  IconInbox,
  IconLeads,
  IconMailbox,
} from "@/components/icons";
import { ActivityChart } from "@/components/dashboard/activity-chart";
import { InboxStatus } from "@/components/dashboard/inbox-status";
import { ReplyFunnel } from "@/components/dashboard/reply-funnel";
import { Card, CardHead, EmptyState, Meter, Notice, StatusPill } from "@/components/ui/primitives";
import { availableToday, campaignDailyCapacity, isSendable } from "@/lib/capacity";
import { CAMPAIGN_STATUS, formatDateTime } from "@/lib/labels";
import { dailySeries, formatRate, rate } from "@/lib/metrics";
import type { Campaign, CampaignActivity, InboxMessage, InboxThread, Mailbox } from "@/lib/types";

type Overview = {
  imported_count: number;
  email_found_count: number;
  enrichment_eligible_count: number;
  connected_mailbox_count: number;
  send_capacity_today: number;
  active_campaign_count: number;
  unread_thread_count: number;
};

function eventCount(activity: CampaignActivity[], type: CampaignActivity["eventType"]) {
  return activity.filter((event) => event.eventType === type).length;
}

function launchWarnings(importedCount: number, emailFoundCount: number, mailboxes: Mailbox[]): string[] {
  const warnings: string[] = [];
  const sendable = mailboxes.filter(isSendable);

  if (importedCount === 0) warnings.push("Import leads before finding emails.");
  else if (emailFoundCount === 0) warnings.push("Run enrichment before launching a campaign.");

  if (mailboxes.length === 0) warnings.push("Connect a mailbox before launching.");
  else if (sendable.length === 0) warnings.push("No connected mailbox can send right now.");
  else if (campaignDailyCapacity(sendable) === 0) warnings.push("Mailbox capacity is exhausted today.");

  return warnings;
}

export function DashboardWorkspace({
  overview,
  mailboxes,
  campaigns,
  activity,
  inboxThreads,
  messages,
}: {
  overview?: Overview;
  mailboxes: Mailbox[];
  campaigns: Campaign[];
  activity: CampaignActivity[];
  inboxThreads: InboxThread[];
  messages: InboxMessage[];
}) {
  const [campaignId, setCampaignId] = useState("all");
  const selectedCampaign = campaigns.find((campaign) => campaign.campaignId === campaignId);
  const inScope = (item: { campaignId?: string }) => campaignId === "all" || item.campaignId === campaignId;

  const filteredCampaigns = campaignId === "all" ? campaigns : selectedCampaign ? [selectedCampaign] : [];
  const filteredActivity = activity.filter(inScope);
  const filteredThreads = inboxThreads.filter(inScope);
  const filteredMessages = messages.filter(inScope);
  const sent = eventCount(filteredActivity, "sent");
  const opened = eventCount(filteredActivity, "opened");
  const replied = eventCount(filteredActivity, "replied") || filteredMessages.filter((message) => message.direction === "inbound").length;
  const bounced = eventCount(filteredActivity, "bounced");
  const importedCount = overview?.imported_count ?? 0;
  const emailFoundCount = overview?.email_found_count ?? 0;
  const capacity = overview?.send_capacity_today ?? campaignDailyCapacity(mailboxes);
  const sendable = mailboxes.filter(isSendable);
  const warnings = launchWarnings(importedCount, emailFoundCount, mailboxes);
  // Rates are all "of sent" — one denominator, so the figures can be compared.
  const openRate = rate(opened, sent);
  const replyRate = rate(replied, sent);
  const bounceRate = rate(bounced, sent);
  const series = dailySeries(filteredActivity);

  return (
    <div className="workspace-full">
      <div className="workspace-filters">
        <select
          className="select"
          aria-label="Campaign filter"
          value={campaignId}
          onChange={(event) => setCampaignId(event.target.value)}
        >
          <option value="all">All campaigns</option>
          {campaigns.map((campaign) => (
            <option key={campaign.campaignId} value={campaign.campaignId}>
              {campaign.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid-4">
        <Card className="state-card">
          <div className="state-card-head">
            <IconCampaigns size={15} />
            Emails sent
          </div>
          <div className="state-card-body">
            <span className="metric-value">{sent.toLocaleString()}</span>
            <span className="muted">{campaignId === "all" ? "all campaigns" : selectedCampaign?.name}</span>
          </div>
          <div className="state-card-foot">
            <Link href="/campaigns" className="action-link">
              Campaigns <IconArrowRight />
            </Link>
          </div>
        </Card>

        <Card className="state-card">
          <div className="state-card-head">
            <IconCheck size={15} />
            Opened
          </div>
          <div className="state-card-body">
            <span className="metric-value">{opened.toLocaleString()}</span>
            <span className="muted">{campaignId === "all" ? "tracked opens" : selectedCampaign?.name}</span>
          </div>
          <div className="state-card-foot">
            <span className="rate-value">{formatRate(openRate)}</span>{" "}
            {/* Pixel tracking undercounts blocked images and overcounts prefetch — an estimate, and labelled as one. */}
            <span className="rate-label">estimated open rate of {sent.toLocaleString()} sent</span>
          </div>
        </Card>

        <Card className="state-card">
          <div className="state-card-head">
            <IconInbox size={15} />
            Replied
          </div>
          <div className="state-card-body">
            <span className="metric-value">{replied.toLocaleString()}</span>
            <span className="muted">{filteredThreads.length.toLocaleString()} reply thread{filteredThreads.length === 1 ? "" : "s"}</span>
          </div>
          <div className="state-card-foot">
            <span className="rate-value">{formatRate(replyRate)}</span>{" "}
            <span className="rate-label">reply rate of {sent.toLocaleString()} sent</span>
          </div>
        </Card>

        <Card className="state-card">
          <div className="state-card-head">
            <IconAlert size={15} />
            Bounced
          </div>
          <div className="state-card-body">
            <span className="metric-value">{bounced.toLocaleString()}</span>
            <span className="muted">from mail worker events</span>
          </div>
          <div className="state-card-foot">
            <span className="rate-value">{formatRate(bounceRate)}</span>{" "}
            <span className="rate-label">bounce rate of {sent.toLocaleString()} sent</span>
          </div>
        </Card>
      </div>

      <div className="grid-4 section">
        <Card className="state-card">
          <div className="state-card-head">
            <IconLeads size={15} />
            Leads ready
          </div>
          <div className="state-card-body">
            <span className="metric-value">{emailFoundCount.toLocaleString()}</span>
            <span className="muted">{importedCount.toLocaleString()} imported</span>
          </div>
          <div className="state-card-foot">
            <Link href="/leads" className="action-link">
              Leads <IconArrowRight />
            </Link>
          </div>
        </Card>

        <Card className="state-card">
          <div className="state-card-head">
            <IconMailbox size={15} />
            Send capacity today
          </div>
          <div className="state-card-body">
            <span className="metric-value">{capacity.toLocaleString()}</span>
            <span className="muted">{sendable.length} sendable mailbox{sendable.length === 1 ? "" : "es"}</span>
          </div>
          <div className="state-card-foot">
            <Link href="/mailboxes" className="action-link">
              Mailboxes <IconArrowRight />
            </Link>
          </div>
        </Card>

        <Card className="state-card">
          <div className="state-card-head">
            <IconCampaigns size={15} />
            Campaigns
          </div>
          <div className="state-card-body">
            <span className="metric-value">{filteredCampaigns.length.toLocaleString()}</span>
            <span className="muted">{filteredCampaigns.filter((campaign) => campaign.status === "scheduled" || campaign.status === "sending").length} active</span>
          </div>
          <div className="state-card-foot">
            <Link href="/campaigns/new" className="action-link">
              Create campaign <IconArrowRight />
            </Link>
          </div>
        </Card>

        <Card className="state-card">
          <div className="state-card-head">
            <IconInbox size={15} />
            Unread inbox
          </div>
          <div className="state-card-body">
            <span className="metric-value">
              {filteredThreads.filter((thread) => thread.status === "unread").length.toLocaleString()}
            </span>
            <span className="muted">{filteredThreads.length.toLocaleString()} total thread{filteredThreads.length === 1 ? "" : "s"}</span>
          </div>
          <div className="state-card-foot">
            <Link href="/inbox" className="action-link">
              Inbox <IconArrowRight />
            </Link>
          </div>
        </Card>
      </div>

      <div className="section">
        <Card>
          <CardHead
            title="Sent, opened and replied — last 14 days"
            display
            actions={
              <span className="subtle" style={{ fontSize: 12 }}>
                {campaignId === "all" ? "All campaigns" : selectedCampaign?.name}
              </span>
            }
          />
          <div className="card-body">
            <ActivityChart points={series} />
          </div>
        </Card>
      </div>

      <div className="grid-2 section">
        <Card>
          <CardHead title="Reply funnel" display />
          <div className="card-body">
            <ReplyFunnel
              counts={{ sent, opened, replied, bounced }}
              inboxHref={campaignId === "all" ? "/inbox" : `/inbox?campaign=${campaignId}`}
            />
          </div>
        </Card>

        <Card>
          <CardHead title="Campaign output" display />
          <div className="card-body">
            {filteredCampaigns.length === 0 ? (
              <EmptyState small title="No campaigns match this filter" />
            ) : (
              <div className="stack" style={{ gap: "var(--s-5)" }}>
                {filteredCampaigns.slice(0, 6).map((campaign) => {
                  const campaignActivity = activity.filter((event) => event.campaignId === campaign.campaignId);
                  const campaignSent = eventCount(campaignActivity, "sent");
                  const campaignOpened = eventCount(campaignActivity, "opened");
                  const campaignReplied = eventCount(campaignActivity, "replied");
                  const campaignOpenRate = rate(campaignOpened, campaignSent);
                  const campaignReplyRate = rate(campaignReplied, campaignSent);

                  return (
                    <div key={campaign.campaignId} className="stack" style={{ gap: "var(--s-2)" }}>
                      <div className="row" style={{ gap: "var(--s-2)" }}>
                        <Link href={`/campaigns/${campaign.campaignId}`} className="cell-strong action-link">
                          {campaign.name}
                        </Link>
                        <StatusPill {...CAMPAIGN_STATUS[campaign.status]} />
                        <span className="spacer" />
                        <span className="subtle num">
                          {campaign.lastActivityAt ? formatDateTime(campaign.lastActivityAt) : "No activity"}
                        </span>
                      </div>

                      <div className="rate-row">
                        <div className="rate">
                          <span className="rate-value">{campaignSent.toLocaleString()}</span>
                          <span className="rate-label">sent</span>
                        </div>
                        <div className="rate">
                          <span className="rate-value">{formatRate(campaignOpenRate)}</span>
                          <span className="rate-label">
                            opened · {campaignOpened.toLocaleString()}
                          </span>
                        </div>
                        <div className="rate">
                          <span className="rate-value">{formatRate(campaignReplyRate)}</span>
                          <span className="rate-label">
                            replied · {campaignReplied.toLocaleString()}
                          </span>
                        </div>
                      </div>

                      {/* Share bars only once something was sent — an empty track would read as 0%. */}
                      {campaignSent > 0 ? (
                        <div className="stack chart" style={{ gap: 3 }}>
                          <div className="share-track">
                            <div
                              className="share-fill share-fill-opened"
                              style={{ right: `${100 - (campaignOpenRate ?? 0) * 100}%` }}
                            />
                          </div>
                          <div className="share-track">
                            <div
                              className="share-fill share-fill-replied"
                              style={{ right: `${100 - (campaignReplyRate ?? 0) * 100}%` }}
                            />
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Card>
      </div>

      <div className="grid-2 section">
        <Card>
          <CardHead title="Mailbox capacity" display />
          <div className="card-body stack" style={{ gap: "var(--s-4)" }}>
            {mailboxes.length === 0 ? (
              <EmptyState small icon={<IconMailbox />} title="No mailbox connected" />
            ) : (
              mailboxes.map((mailbox) => (
                <Meter
                  key={mailbox.mailboxId}
                  label={mailbox.emailAddress}
                  value={mailbox.usedToday + mailbox.reservedToday}
                  max={mailbox.dailyHardLimit}
                  valueLabel={`${availableToday(mailbox)} of ${mailbox.dailyHardLimit} left`}
                  tone={isSendable(mailbox) ? "accent" : "warning"}
                />
              ))
            )}
          </div>
        </Card>

        <Card>
          <CardHead title="Needs your reply" display />
          <div className="card-body">
            <InboxStatus threads={filteredThreads} />
          </div>
        </Card>
      </div>

      {warnings.length === 0 ? null : (
        <div className="section blockers">
          {warnings.map((warning) => (
            <Notice key={warning} tone="warning" icon={<IconAlert />}>
              {warning}
            </Notice>
          ))}
        </div>
      )}
    </div>
  );
}
