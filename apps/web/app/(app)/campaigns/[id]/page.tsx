import Link from "next/link";

import { CampaignDetail } from "@/components/campaigns/campaign-detail";
import { IconCampaigns } from "@/components/icons";
import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { campaignActivity, campaigns, leads, mailboxes } from "@/lib/demo";

export const metadata = { title: "Campaign · Warmailer" };

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const campaign = campaigns.find((item) => item.campaignId === id);

  if (!campaign) {
    return (
      <main className="page">
        <PageHeader title="Campaign" />
        <Card>
          <div className="card-body card-body-flush">
            <EmptyState
              icon={<IconCampaigns />}
              title="Campaign not found"
              description="No campaign with this id exists in this workspace."
              action={
                <Link href="/campaigns" className="btn btn-secondary">
                  Back to Campaigns
                </Link>
              }
            />
          </div>
        </Card>
      </main>
    );
  }

  // Scoped once here and passed down — the detail component re-derives nothing.
  const campaignLeads = leads.filter((lead) => lead.activeCampaignId === campaign.campaignId);
  const campaignMailboxes = mailboxes.filter((mailbox) => campaign.mailboxIds.includes(mailbox.mailboxId));
  const activity = campaignActivity.filter((event) => event.campaignId === campaign.campaignId);

  return (
    <main className="page">
      <PageHeader
        title={campaign.name}
        description={`Created ${campaign.createdAt.slice(0, 10)} · workspace ${campaign.workspaceId}`}
        actions={
          <Link href="/campaigns" className="btn btn-secondary">
            Back to Campaigns
          </Link>
        }
      />

      <CampaignDetail
        campaign={campaign}
        leads={campaignLeads}
        mailboxes={campaignMailboxes}
        activity={activity}
      />
    </main>
  );
}
