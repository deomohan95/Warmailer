import { IconUpload } from "@/components/icons";
import { LeadsWorkspace } from "@/components/leads/leads-workspace";
import { PageHeader } from "@/components/ui/primitives";
import { getActiveWorkspace, getImports, getLeads } from "@/lib/backend-data";

export const metadata = { title: "Leads · Warmailer" };

export default async function LeadsPage() {
  const workspace = await getActiveWorkspace();
  const [leads, leadImports] = await Promise.all([getLeads(workspace.workspaceId), getImports(workspace.workspaceId)]);

  return (
    <main className="page">
      <PageHeader
        title="Leads"
        description="Every lead in this workspace, with its import origin and email-enrichment state. Importing and finding emails both happen here."
        actions={
          <button type="button" className="btn btn-primary">
            <IconUpload />
            Import CSV
          </button>
        }
      />
      <LeadsWorkspace leads={leads} imports={leadImports} />
    </main>
  );
}
