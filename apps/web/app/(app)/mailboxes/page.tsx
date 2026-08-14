import { MailboxesWorkspace } from "@/components/mailboxes/mailboxes-workspace";
import { PageHeader } from "@/components/ui/primitives";
import { getActiveWorkspace, getMailboxes } from "@/lib/backend-data";
import { getWarmupMailboxStats, getWarmupSeeds } from "@/lib/warmup-data";

export const metadata = { title: "Mailboxes · Warmailer" };

export default async function MailboxesPage() {
  const workspace = await getActiveWorkspace();
  const [mailboxes, warmupStats, warmupSeeds] = await Promise.all([
    getMailboxes(workspace.workspaceId),
    getWarmupMailboxStats(workspace.workspaceId),
    getWarmupSeeds(workspace.workspaceId),
  ]);

  return (
    <main className="page">
      <PageHeader
        title="Mailboxes"
        description="Connect Zoho mailboxes and set their hard limits. Everything a campaign is allowed to send is decided here."
      />

      <MailboxesWorkspace mailboxes={mailboxes} warmupStats={warmupStats} warmupSeeds={warmupSeeds} />
    </main>
  );
}
