import { MailboxesWorkspace } from "@/components/mailboxes/mailboxes-workspace";
import { PageHeader } from "@/components/ui/primitives";
import { getActiveWorkspace, getMailboxes } from "@/lib/backend-data";
import { getWarmupMailboxStats } from "@/lib/warmup-data";

export const metadata = { title: "Mailboxes · Warmailer" };

export default async function MailboxesPage() {
  const workspace = await getActiveWorkspace();
  const [mailboxes, warmupStats] = await Promise.all([
    getMailboxes(workspace.workspaceId),
    getWarmupMailboxStats(workspace.workspaceId),
  ]);

  return (
    <main className="page">
      <PageHeader
        title="Mailboxes"
        description="Connect Zoho mailboxes and set their hard limits. Everything a campaign is allowed to send is decided here."
      />

      <MailboxesWorkspace mailboxes={mailboxes} warmupStats={warmupStats} />
    </main>
  );
}
