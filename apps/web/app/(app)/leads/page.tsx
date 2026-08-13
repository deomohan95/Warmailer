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
        actions={
          <label htmlFor="lead-csv-file" className="btn btn-primary">
            <IconUpload />
            Import CSV
          </label>
        }
      />
      <LeadsWorkspace leads={leads} imports={leadImports} />
    </main>
  );
}
