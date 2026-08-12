import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { envValue, getActiveWorkspace } from "@/lib/backend-data";
import { parseLeadCsv, type ParsedLeadCsvRow, type RejectedLeadCsvRow } from "@/lib/lead-import";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const file = (await request.formData()).get("file");
    if (!(file instanceof File)) throw new Error("CSV file is required");

    const parsed = parseLeadCsv(await file.text());
    const workspace = await getActiveWorkspace();
    const now = new Date().toISOString();
    const importId = randomUUID();
    let inserted = 0;
    let updated = 0;
    const rows: ImportRowInsert[] = [];

    await supabasePost("lead_imports", {
      id: importId,
      workspace_id: workspace.workspaceId,
      source_file: file.name || "apollo.csv",
      status: parsed.rejected.length ? "completed_with_errors" : "completed",
      total_rows: parsed.accepted.length + parsed.rejected.length,
      accepted_rows: parsed.accepted.length,
      rejected_rows: parsed.rejected.length,
      inserted_rows: 0,
      updated_rows: 0,
      created_at: now,
      completed_at: now,
    });

    for (const lead of parsed.accepted) {
      const existing = await findLead(workspace.workspaceId, lead);
      const leadId = existing?.id ?? randomUUID();
      const action = existing ? "updated" : "inserted";

      if (existing) {
        updated += 1;
        await supabasePatch(`all_leads_mmp?id=eq.${leadId}&workspace_id=eq.${workspace.workspaceId}`, {
          source_file: lead.source_file ?? file.name,
          name: lead.name,
          job_title: lead.job_title,
          company: lead.company,
          link: lead.link,
          linkedin_url_normalized: lead.linkedin_url_normalized,
          name_company_normalized: lead.name_company_normalized,
          location: lead.location,
          employees: lead.employees,
          industry: lead.industry,
          updated_at: now,
        });
      } else {
        inserted += 1;
        await supabasePost("all_leads_mmp", {
          id: leadId,
          workspace_id: workspace.workspaceId,
          source_file: lead.source_file ?? file.name,
          name: lead.name,
          job_title: lead.job_title,
          company: lead.company,
          link: lead.link,
          linkedin_url_normalized: lead.linkedin_url_normalized,
          name_company_normalized: lead.name_company_normalized,
          location: lead.location,
          employees: lead.employees,
          industry: lead.industry,
          email_status: "not_enriched",
          created_at: now,
          updated_at: now,
        });
      }

      rows.push(importRow(workspace.workspaceId, importId, lead, leadId, action));
    }

    rows.push(...parsed.rejected.map((row) => rejectedRow(workspace.workspaceId, importId, row)));
    if (rows.length) await supabasePost("lead_import_rows", rows);

    await supabasePatch(`lead_imports?id=eq.${importId}&workspace_id=eq.${workspace.workspaceId}`, {
      inserted_rows: inserted,
      updated_rows: updated,
    });

    revalidatePath("/");
    revalidatePath("/leads");
    revalidatePath("/campaigns/new");

    return NextResponse.json({ importId, inserted, updated, rejected: parsed.rejected.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Lead import failed";
    return NextResponse.json({ error: message }, { status: message.includes("Missing") ? 500 : 400 });
  }
}

type ExistingLeadRow = { id: string };
type ImportRowInsert = {
  workspace_id: string;
  import_id: string;
  row_number: number;
  lead_id?: string;
  raw_data: Record<string, string>;
  normalized_data: Record<string, unknown>;
  action: "inserted" | "updated" | "rejected";
  rejection_reason?: string;
};

async function findLead(workspaceId: string, lead: ParsedLeadCsvRow) {
  if (lead.linkedin_url_normalized) {
    const rows = await supabaseGet<ExistingLeadRow[]>(
      `all_leads_mmp?workspace_id=eq.${workspaceId}&linkedin_url_normalized=eq.${encodeURIComponent(
        lead.linkedin_url_normalized,
      )}&select=id&limit=1`,
    );
    return rows[0] ?? null;
  }

  if (!lead.name_company_normalized) return null;

  const rows = await supabaseGet<ExistingLeadRow[]>(
    `all_leads_mmp?workspace_id=eq.${workspaceId}&linkedin_url_normalized=is.null&name_company_normalized=eq.${encodeURIComponent(
      lead.name_company_normalized,
    )}&select=id&limit=1`,
  );
  return rows[0] ?? null;
}

function importRow(
  workspaceId: string,
  importId: string,
  lead: ParsedLeadCsvRow,
  leadId: string,
  action: "inserted" | "updated",
): ImportRowInsert {
  return {
    workspace_id: workspaceId,
    import_id: importId,
    row_number: lead.rowNumber,
    lead_id: leadId,
    raw_data: lead.raw,
    normalized_data: lead,
    action,
  };
}

function rejectedRow(workspaceId: string, importId: string, row: RejectedLeadCsvRow): ImportRowInsert {
  return {
    workspace_id: workspaceId,
    import_id: importId,
    row_number: row.rowNumber,
    raw_data: row.raw,
    normalized_data: {},
    action: "rejected",
    rejection_reason: row.reason,
  };
}

async function supabaseGet<T>(path: string): Promise<T> {
  const response = await supabaseFetch(path, { method: "GET" });
  return (await response.json()) as T;
}

async function supabasePost(table: string, body: unknown) {
  await supabaseFetch(table, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function supabasePatch(path: string, body: unknown) {
  await supabaseFetch(path, {
    method: "PATCH",
    headers: { "content-type": "application/json", prefer: "return=minimal" },
    body: JSON.stringify(body),
  });
}

async function supabaseFetch(path: string, init: RequestInit) {
  const url = envValue("NEXT_PUBLIC_SUPABASE_URL")?.replace(/\/$/, "");
  const key = envValue("SUPABASE_SERVICE_ROLE_KEY") ?? envValue("SUPABASE_SECRET_KEY");
  if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  if (!key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  let response: Response;
  try {
    response = await fetch(`${url}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
        ...init.headers,
      },
    });
  } catch {
    throw new Error("Cannot reach Supabase from this machine. Check internet, firewall, VPN, or proxy for Node.js.");
  }

  if (!response.ok) throw new Error((await response.text()) || `Supabase request failed: ${response.status}`);
  return response;
}
