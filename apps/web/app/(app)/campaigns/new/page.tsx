import Link from "next/link";

import { CampaignWizard } from "@/components/campaigns/campaign-wizard";
import { PageHeader } from "@/components/ui/primitives";
import { getActiveWorkspace, getMailboxes } from "@/lib/backend-data";
import { getLeadChoicesByIds, getLeadPage } from "@/lib/lead-pages";

export const metadata = { title: "New campaign · Warmailer" };

type NewCampaignSearchParams = Promise<{ leadIds?: string | string[] }>;

export default async function NewCampaignPage({ searchParams }: { searchParams?: NewCampaignSearchParams }) {
  const params = searchParams ? await searchParams : {};
  const rawLeadIds = Array.isArray(params.leadIds) ? params.leadIds[0] : params.leadIds;
  const initialLeadIds = (rawLeadIds ?? "").split(",").filter(Boolean);
  const workspace = await getActiveWorkspace();
  const [page, selectedLeads, mailboxes] = await Promise.all([
    getLeadPage(workspace.workspaceId),
    getLeadChoicesByIds(workspace.workspaceId, initialLeadIds),
    getMailboxes(workspace.workspaceId),
  ]);

  return (
    <main className="page">
      <PageHeader
        title="New campaign"
        description="Leads and mailboxes are chosen here. The selected mailboxes' hard limits decide what this campaign is allowed to send."
        actions={
          <Link href="/campaigns" className="btn btn-secondary">
            Cancel
          </Link>
        }
      />

      <CampaignWizard initialPage={page} initialSelectedLeads={selectedLeads} mailboxes={mailboxes} />
    </main>
  );
}
