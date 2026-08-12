import Link from "next/link";

import { CampaignWizard } from "@/components/campaigns/campaign-wizard";
import { PageHeader } from "@/components/ui/primitives";
import { getActiveWorkspace, getLeads, getMailboxes } from "@/lib/backend-data";

export const metadata = { title: "New campaign · Warmailer" };

export default async function NewCampaignPage() {
  const workspace = await getActiveWorkspace();
  const [leads, mailboxes] = await Promise.all([
    getLeads(workspace.workspaceId),
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

      <CampaignWizard leads={leads} mailboxes={mailboxes} />
    </main>
  );
}
