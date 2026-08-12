import { InboxWorkspace } from "@/components/inbox/inbox-workspace";
import { PageHeader } from "@/components/ui/primitives";
import { getActiveWorkspace, getInboxThreads, getMailboxes } from "@/lib/backend-data";

export const metadata = { title: "Inbox · Warmailer" };

export default async function InboxPage() {
  const workspace = await getActiveWorkspace();
  const [threads, mailboxes] = await Promise.all([
    getInboxThreads(workspace.workspaceId),
    getMailboxes(workspace.workspaceId),
  ]);

  return (
    <main className="page">
      <PageHeader
        title="Inbox"
        description="Every reply from every connected mailbox, in one place, with the lead and campaign it came from."
      />

      <InboxWorkspace threads={threads} mailboxes={mailboxes} />
    </main>
  );
}
