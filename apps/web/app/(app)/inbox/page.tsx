import { InboxWorkspace } from "@/components/inbox/inbox-workspace";
import { PageHeader } from "@/components/ui/primitives";
import { getActiveWorkspace, getCampaigns, getInboxMessages, getInboxThreads, getMailboxes } from "@/lib/backend-data";

export const metadata = { title: "Inbox · Warmailer" };

export default async function InboxPage() {
  const workspace = await getActiveWorkspace();
  const [threads, messages, mailboxes, campaigns] = await Promise.all([
    getInboxThreads(workspace.workspaceId),
    getInboxMessages(workspace.workspaceId),
    getMailboxes(workspace.workspaceId),
    getCampaigns(workspace.workspaceId),
  ]);

  return (
    <main className="page page-fit">
      <PageHeader title="Inbox" />

      <InboxWorkspace threads={threads} messages={messages} mailboxes={mailboxes} campaigns={campaigns} />
    </main>
  );
}
