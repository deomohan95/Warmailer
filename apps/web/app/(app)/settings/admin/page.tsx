import { notFound } from "next/navigation";

import { WarmupAdmin } from "@/components/settings/warmup-admin";
import { PageHeader } from "@/components/ui/primitives";
import { getActiveWorkspace } from "@/lib/backend-data";
import { requireWarmupAdmin } from "@/lib/admin";
import { getWarmupSeeds } from "@/lib/warmup-data";

export const metadata = { title: "Admin · Warmailer" };

export default async function AdminPage() {
  try {
    await requireWarmupAdmin();
  } catch {
    notFound();
  }

  const workspace = await getActiveWorkspace();
  const seeds = await getWarmupSeeds(workspace.workspaceId);

  return (
    <main className="page">
      <PageHeader title="Admin" description="Internal warmup infrastructure for this workspace." />
      <WarmupAdmin seeds={seeds} />
    </main>
  );
}
