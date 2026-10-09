import { requireSupabaseConfig } from "./backend-data";
import type { Lead, LeadStatus } from "./types";

export const LEAD_PAGE_SIZE = 100;

export type LeadPageItem = Pick<
  Lead,
  "leadId" | "name" | "jobTitle" | "company" | "location" | "employees" | "industry" | "email" | "emailStatus" | "activeCampaignId"
>;

export type LeadFilters = {
  search?: string;
  status?: string;
  industry?: string;
  location?: string;
  importId?: string;
};

export type LeadPage = { leads: LeadPageItem[]; total: number; page: number };
export type LeadStats = { total: number; found: number; inFlight: number; notFound: number; eligible: number };

type Row = {
  id: string;
  name: string;
  job_title: string | null;
  company: string | null;
  location: string | null;
  employees: string | null;
  industry: string | null;
  email: string | null;
  email_status: string;
};

const columns = "id,name,job_title,company,location,employees,industry,email,email_status";

function baseQuery(workspaceId: string, importId?: string) {
  const query = new URLSearchParams({ workspace_id: `eq.${workspaceId}` });
  if (importId && importId !== "all") query.set("lead_import_rows.import_id", `eq.${importId}`);
  return query;
}

function selectColumns(importId?: string) {
  return importId && importId !== "all" ? `${columns},lead_import_rows!inner(import_id)` : columns;
}

function mapRow(row: Row): LeadPageItem {
  return {
    leadId: row.id,
    name: row.name,
    jobTitle: row.job_title ?? "",
    company: row.company ?? "",
    location: row.location ?? "",
    employees: row.employees ?? "",
    industry: row.industry ?? "",
    email: row.email ?? undefined,
    emailStatus: (row.email_status === "found" ? "email_found" : row.email_status) as LeadStatus,
  };
}

async function queryLeads(params: URLSearchParams) {
  const { url, key } = requireSupabaseConfig();
  const response = await fetch(`${url}/rest/v1/all_leads_mmp?${params}`, {
    headers: { apikey: key, authorization: `Bearer ${key}`, prefer: "count=exact" },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Lead query failed: ${response.status}`);
  return response;
}

function count(response: Response) {
  return Number(response.headers.get("content-range")?.split("/")[1] ?? 0);
}

export async function getLeadPage(workspaceId: string, filters: LeadFilters = {}, page = 1): Promise<LeadPage> {
  const currentPage = Math.max(1, Math.floor(page) || 1);
  const query = baseQuery(workspaceId, filters.importId);
  query.set("select", selectColumns(filters.importId));
  query.set("order", "created_at.desc");
  query.set("limit", String(LEAD_PAGE_SIZE));
  query.set("offset", String((currentPage - 1) * LEAD_PAGE_SIZE));
  if (filters.status && filters.status !== "all") {
    query.set("email_status", `eq.${filters.status === "email_found" ? "found" : filters.status}`);
  }
  const search = filters.search?.replace(/[(),*%]/g, " ").trim();
  if (search) query.set("or", `(name.ilike.*${search}*,company.ilike.*${search}*,job_title.ilike.*${search}*,email.ilike.*${search}*)`);
  if (filters.industry && filters.industry !== "all") query.set("industry", `ilike.*${filters.industry.replace(/[*%]/g, "")}*`);
  if (filters.location && filters.location !== "all") query.set("location", `ilike.*${filters.location.replace(/[*%]/g, "")}*`);

  const response = await queryLeads(query);
  return { leads: ((await response.json()) as Row[]).map(mapRow), total: count(response), page: currentPage };
}

async function countLeads(workspaceId: string, importId: string | undefined, filters: Record<string, string>) {
  const query = baseQuery(workspaceId, importId);
  query.set("select", importId && importId !== "all" ? "id,lead_import_rows!inner(import_id)" : "id");
  query.set("limit", "0");
  for (const [key, value] of Object.entries(filters)) query.set(key, value);
  return count(await queryLeads(query));
}

export async function getLeadStats(workspaceId: string, importId?: string): Promise<LeadStats> {
  const [total, found, inFlight, notFound, eligible] = await Promise.all([
    countLeads(workspaceId, importId, {}),
    countLeads(workspaceId, importId, { email_status: "in.(found,verified)" }),
    countLeads(workspaceId, importId, { email_status: "in.(queued,processing)" }),
    countLeads(workspaceId, importId, { email_status: "eq.not_found" }),
    countLeads(workspaceId, importId, { email: "is.null" }),
  ]);
  return { total, found, inFlight, notFound, eligible };
}

export async function getLeadChoicesByIds(workspaceId: string, ids: string[]) {
  if (ids.length === 0) return [];
  const chunks: LeadPageItem[] = [];
  for (let offset = 0; offset < ids.length; offset += 100) {
    const query = baseQuery(workspaceId);
    query.set("select", columns);
    query.set("id", `in.(${ids.slice(offset, offset + 100).join(",")})`);
    const response = await queryLeads(query);
    chunks.push(...((await response.json()) as Row[]).map(mapRow));
  }
  return chunks;
}
