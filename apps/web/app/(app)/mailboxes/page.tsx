import { MailboxesWorkspace } from "@/components/mailboxes/mailboxes-workspace";
import { PageHeader } from "@/components/ui/primitives";
import { mailboxes } from "@/lib/demo";

export const metadata = { title: "Mailboxes · Warmailer" };

export default function MailboxesPage() {
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
