import { MailboxesWorkspace } from "@/components/mailboxes/mailboxes-workspace";
import { PageHeader } from "@/components/ui/primitives";
import { getActiveWorkspace, getMailboxes } from "@/lib/backend-data";

export const metadata = { title: "Mailboxes · Warmailer" };

export default async function MailboxesPage() {
  const workspace = await getActiveWorkspace();
  const mailboxes = await getMailboxes(workspace.workspaceId);

  return (
    <main className="page">
      <PageHeader
        title="Mailboxes"
        description="Connect Zoho mailboxes and set their hard limits. Everything a campaign is allowed to send is decided here."
      />

      <MailboxesWorkspace mailboxes={mailboxes} />
    </main>
  );
}
