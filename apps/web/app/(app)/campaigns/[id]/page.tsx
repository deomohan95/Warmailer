import Link from "next/link";

import { CampaignDetail } from "@/components/campaigns/campaign-detail";
import { IconCampaigns } from "@/components/icons";
import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { getActiveWorkspace, getCampaignDetail } from "@/lib/backend-data";

export const metadata = { title: "Campaign · Warmailer" };

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const workspace = await getActiveWorkspace();
  const detail = await getCampaignDetail(workspace.workspaceId, id);

  if (!detail) {
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

  const { campaign, leads, mailboxes, activity } = detail;

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

      <CampaignDetail campaign={campaign} leads={leads} mailboxes={mailboxes} activity={activity} />
    </main>
  );
}
