import Link from "next/link";

import {
  IconAlert,
  IconArrowRight,
  IconCampaigns,
  IconCheck,
  IconInbox,
  IconLeads,
  IconMailbox,
  IconPlus,
  IconUpload,
} from "@/components/icons";
import { Card, CardHead, EmptyState, Meter, Notice, PageHeader } from "@/components/ui/primitives";
import { availableToday, campaignDailyCapacity, isSendable } from "@/lib/capacity";
import { getDashboardData } from "@/lib/backend-data";
import type { Mailbox } from "@/lib/types";

export const metadata = { title: "Dashboard · Warmailer" };

function launchWarnings({
  importedCount,
  emailFoundCount,
  mailboxes,
}: {
  importedCount: number;
  emailFoundCount: number;
  mailboxes: Mailbox[];
}): string[] {
  const warnings: string[] = [];
  const sendable = mailboxes.filter(isSendable);

  if (importedCount === 0) {
    warnings.push("Import leads before finding emails.");
  } else if (emailFoundCount === 0) {
    warnings.push("No lead has an email address yet. Run enrichment from the Leads page.");
  }

  if (mailboxes.length === 0) {
    warnings.push("Connect a mailbox before launching.");
  } else if (sendable.length === 0) {
    warnings.push("No connected mailbox can send right now. Check mailbox status.");
  } else if (campaignDailyCapacity(sendable) === 0) {
    warnings.push("Mailbox capacity is not enough for this campaign.");
  }

  return warnings;
}

export default async function DashboardPage() {
  const { overview, mailboxes, activity } = await getDashboardData();
  const importedCount = overview?.imported_count ?? 0;
  const emailFoundCount = overview?.email_found_count ?? 0;
  const activeCampaignCount = overview?.active_campaign_count ?? 0;
  const unreadThreadCount = overview?.unread_thread_count ?? 0;
  const sendable = mailboxes.filter(isSendable);
  const capacity = overview?.send_capacity_today ?? campaignDailyCapacity(mailboxes);
  const sendEvents = activity.filter((event) => event.eventType === "sent");
  const warnings = launchWarnings({ importedCount, emailFoundCount, mailboxes });

  return (
    <main className="page">
      <PageHeader
        title="Overview"
        description="The state of your outbound system: what is imported, what can send, and what is blocking a launch."
        actions={
          <>
            <Link href="/leads" className="btn btn-secondary">
              <IconUpload />
              Import leads
            </Link>
            <Link href="/mailboxes" className="btn btn-secondary">
              <IconMailbox size={15} />
              Connect mailbox
            </Link>
            <Link href="/campaigns/new" className="btn btn-primary">
              <IconPlus />
              Create campaign
            </Link>
          </>
        }
      />

      <div className="grid-4">
        <Card className="state-card">
          <div className="state-card-head">
            <IconLeads size={15} />
            Leads
          </div>
          <div className="state-card-body">
            {importedCount === 0 ? (
              "No leads imported"
            ) : (
              <>
                <span className="metric-value">{importedCount.toLocaleString()}</span>
                <span className="muted">{emailFoundCount.toLocaleString()} with an email address</span>
              </>
            )}
          </div>
          <div className="state-card-foot">
            <Link href="/leads" className="action-link">
              Go to Leads <IconArrowRight />
            </Link>
          </div>
        </Card>

        <Card className="state-card">
          <div className="state-card-head">
            <IconMailbox size={15} />
            Mailboxes
          </div>
          <div className="state-card-body">
            {mailboxes.length === 0 ? (
              "No mailboxes connected"
            ) : (
              <>
                <span className="metric-value">{sendable.length}</span>
                <span className="muted">of {mailboxes.length} able to send</span>
              </>
            )}
          </div>
          <div className="state-card-foot">
            <Link href="/mailboxes" className="action-link">
              Go to Mailboxes <IconArrowRight />
            </Link>
          </div>
        </Card>

        <Card className="state-card">
          <div className="state-card-head">
            <IconCampaigns size={15} />
            Campaigns
          </div>
          <div className="state-card-body">
            {activeCampaignCount === 0 ? (
              "No active campaigns"
            ) : (
              <>
                <span className="metric-value">{activeCampaignCount}</span>
                <span className="muted">active campaigns</span>
              </>
            )}
          </div>
          <div className="state-card-foot">
            <Link href="/campaigns" className="action-link">
              Go to Campaigns <IconArrowRight />
            </Link>
          </div>
        </Card>

        <Card className="state-card">
          <div className="state-card-head">
            <IconInbox size={15} />
            Inbox
          </div>
          <div className="state-card-body">
            {unreadThreadCount === 0 ? (
              "No replies synced"
            ) : (
              <>
                <span className="metric-value">{unreadThreadCount}</span>
                <span className="muted">unread threads</span>
              </>
            )}
          </div>
          <div className="state-card-foot">
            <Link href="/inbox" className="action-link">
              Go to Inbox <IconArrowRight />
            </Link>
          </div>
        </Card>
      </div>

      <div className="grid-2 section">
        <Card>
          <CardHead title="Send capacity today" display />
          <div className="card-body">
            {mailboxes.length === 0 ? (
              <EmptyState
                small
                icon={<IconMailbox />}
                title="Connect mailboxes to calculate send capacity"
                description="Capacity is the sum of each connected mailbox's daily hard limit, minus what it has already used or reserved."
                action={
                  <Link href="/mailboxes" className="btn btn-secondary">
                    Connect a mailbox
                  </Link>
                }
              />
            ) : (
              <div className="stack" style={{ gap: "var(--s-4)" }}>
                <div>
                  <span className="metric-value" style={{ fontFamily: "var(--font-display)", fontSize: 26 }}>
                    {capacity.toLocaleString()}
                  </span>
                  <span className="muted" style={{ marginLeft: 8 }}>
                    sends available today
                  </span>
                </div>
                {mailboxes.map((mailbox) => (
                  <Meter
                    key={mailbox.mailboxId}
                    label={mailbox.emailAddress}
                    value={mailbox.usedToday + mailbox.reservedToday}
                    max={mailbox.dailyHardLimit}
                    valueLabel={`${availableToday(mailbox)} of ${mailbox.dailyHardLimit} left`}
                    tone={isSendable(mailbox) ? "accent" : "warning"}
                  />
                ))}
              </div>
            )}
          </div>
          <div className="card-foot">Campaigns can never send beyond these hard limits.</div>
        </Card>

        <Card>
          <CardHead title="Blocking a launch" display />
          <div className="card-body">
            {warnings.length === 0 ? (
              <EmptyState
                small
                icon={<IconCheck />}
                title="Nothing is blocking a launch"
                description="Leads, mailboxes and capacity all check out."
              />
            ) : (
              <div className="blockers">
                {warnings.map((warning) => (
                  <Notice key={warning} tone="warning" icon={<IconAlert />}>
                    {warning}
                  </Notice>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>

      <div className="section">
        <Card>
          <CardHead title="Sending activity" display />
          <div className="card-body">
            {sendEvents.length === 0 ? (
              <EmptyState
                small
                icon={<IconCampaigns />}
                title="No send events recorded yet"
                description="Daily send counts appear here once a campaign starts sending. Open tracking is not configured yet, so no open rate is shown."
              />
            ) : (
              <p className="muted">{sendEvents.length.toLocaleString()} send events recorded.</p>
            )}
          </div>
        </Card>
      </div>
    </main>
  );
}
