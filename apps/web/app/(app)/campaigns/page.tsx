import Link from "next/link";

import { IconCampaigns, IconPlus } from "@/components/icons";
import { Card, EmptyState, PageHeader, StatusPill } from "@/components/ui/primitives";
import { campaigns } from "@/lib/demo";
import { CAMPAIGN_STATUS, formatDateTime } from "@/lib/labels";

export const metadata = { title: "Campaigns · Warmailer" };

export default function CampaignsPage() {
  return (
    <main className="page">
      <PageHeader
        title="Campaigns"
        description="Each campaign sends only through the mailboxes selected for it, and never beyond their hard limits."
        actions={
          <Link href="/campaigns/new" className="btn btn-primary">
            <IconPlus />
            New campaign
          </Link>
        }
      />

      <Card>
        <div className="card-body card-body-flush">
          {campaigns.length === 0 ? (
            <EmptyState
              icon={<IconCampaigns />}
              title="No campaigns yet"
              description="Create a campaign after importing leads and connecting mailboxes."
              action={
                <Link href="/campaigns/new" className="btn btn-primary">
                  <IconPlus />
                  New campaign
                </Link>
              }
            />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">Campaign</th>
                    <th scope="col">Status</th>
                    <th scope="col" className="num">
                      Leads
                    </th>
                    <th scope="col" className="num">
                      Mailboxes
                    </th>
                    <th scope="col" className="num">
                      Daily capacity
                    </th>
                    <th scope="col">Last activity</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map((campaign) => (
                    <tr key={campaign.campaignId}>
                      <td>
                        <Link href={`/campaigns/${campaign.campaignId}`} className="cell-strong">
                          {campaign.name}
                        </Link>
                      </td>
                      <td>
                        <StatusPill {...CAMPAIGN_STATUS[campaign.status]} />
                      </td>
                      <td className="num">{campaign.selectedLeadCount.toLocaleString()}</td>
                      <td className="num">{campaign.selectedMailboxCount}</td>
                      <td className="num">{campaign.dailyCapacity.toLocaleString()}</td>
                      <td className="muted">
                        {campaign.lastActivityAt ? formatDateTime(campaign.lastActivityAt) : "No activity yet"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>
    </main>
  );
}
