import { InboxWorkspace } from "@/components/inbox/inbox-workspace";
import { PageHeader } from "@/components/ui/primitives";
import { getActiveWorkspace, getCampaigns, getInboxMessages, getInboxThreads, getMailboxes } from "@/lib/backend-data";

export const metadata = { title: "Inbox · Warmailer" };

type InboxSearchParams = Promise<{ folder?: string | string[] }>;

export default async function InboxPage({ searchParams }: { searchParams?: InboxSearchParams }) {
  const params = searchParams ? await searchParams : {};
  const folder = Array.isArray(params.folder) ? params.folder[0] : params.folder;
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

      <InboxWorkspace
        threads={threads}
        messages={messages}
        mailboxes={mailboxes}
        campaigns={campaigns}
        initialFolder={folder}
      />
    </main>
  );
}
