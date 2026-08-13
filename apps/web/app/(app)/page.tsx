import Link from "next/link";

import { DashboardWorkspace } from "@/components/dashboard/dashboard-workspace";
import { IconPlus, IconUpload } from "@/components/icons";
import { PageHeader } from "@/components/ui/primitives";
import { getDashboardData } from "@/lib/backend-data";

export const metadata = { title: "Dashboard · Warmailer" };

export default async function DashboardPage() {
  const { overview, mailboxes, campaigns, activity, inboxThreads, messages } = await getDashboardData();

  return (
    <main className="page">
      <PageHeader
        title="Overview"
        actions={
          <>
            <Link href="/leads" className="btn btn-secondary">
              <IconUpload />
              Import leads
            </Link>
            <Link href="/campaigns/new" className="btn btn-primary">
              <IconPlus />
              Create campaign
            </Link>
          </>
        }
      />

      <DashboardWorkspace
        overview={overview}
        mailboxes={mailboxes}
        campaigns={campaigns}
        activity={activity}
        inboxThreads={inboxThreads}
        messages={messages}
      />
    </main>
  );
}
