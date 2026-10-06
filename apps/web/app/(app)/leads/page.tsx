import { IconUpload } from "@/components/icons";
import { LeadsWorkspace } from "@/components/leads/leads-workspace";
import { PageHeader } from "@/components/ui/primitives";
import { getActiveWorkspace, getImports, getLeads } from "@/lib/backend-data";

export const metadata = { title: "Leads · Warmailer" };

type LeadsSearchParams = Promise<{ importId?: string | string[] }>;

export default async function LeadsPage({ searchParams }: { searchParams?: LeadsSearchParams }) {
  const params = searchParams ? await searchParams : {};
  const initialImportId = Array.isArray(params.importId) ? params.importId[0] : params.importId;
  const workspace = await getActiveWorkspace();
  const [leads, leadImports] = await Promise.all([getLeads(workspace.workspaceId), getImports(workspace.workspaceId)]);
  const selectedImportId = leadImports.some((item) => item.importId === initialImportId) ? initialImportId : undefined;

  return (
    <main className="page page-fit">
      <PageHeader
        title="Leads"
        actions={
          <label htmlFor="lead-csv-file" className="btn btn-primary">
            <IconUpload />
            Import CSV
          </label>
        }
      />
      <LeadsWorkspace key={selectedImportId ?? "all"} leads={leads} imports={leadImports} initialImportId={selectedImportId} />
    </main>
  );
}
