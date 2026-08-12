import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { envValue, getActiveWorkspace } from "@/lib/backend-data";

export const runtime = "nodejs";

type LeadRow = {
  id: string;
  email: string | null;
  email_status: string;
  linkedin_url_normalized: string | null;
};

export async function POST(request: Request) {
  try {
    const leadIds = validateLeadIds((await request.json())?.leadIds);
    const workspace = await getActiveWorkspace();
    const leads = await supabaseGet<LeadRow[]>(
      `all_leads_mmp?workspace_id=eq.${workspace.workspaceId}&id=in.(${leadIds.map(encodeURIComponent).join(",")})&select=id,email,email_status,linkedin_url_normalized`,
    );
    const eligible = leads.filter(
      (lead) =>
        !lead.email &&
        !["queued", "processing", "found"].includes(lead.email_status) &&
        Boolean(lead.linkedin_url_normalized),
    );

    if (eligible.length === 0) throw new Error("No selected leads are eligible for email finding");

    const batchId = randomUUID();
    const now = new Date().toISOString();

    await supabasePost("enrichment_batches", {
      id: batchId,
      workspace_id: workspace.workspaceId,
      status: "queued",
      selection: { leadIds },
      total_items: eligible.length,
      created_at: now,
    });

    await supabasePost(
      "enrichment_items",
      eligible.map((lead) => ({
        workspace_id: workspace.workspaceId,
        batch_id: batchId,
        lead_id: lead.id,
        status: "queued",
        linkedin_url_normalized: lead.linkedin_url_normalized,
        created_at: now,
        updated_at: now,
      })),
    );

    await supabasePatch(`all_leads_mmp?workspace_id=eq.${workspace.workspaceId}&id=in.(${eligible.map((lead) => encodeURIComponent(lead.id)).join(",")})`, {
      email_status: "queued",
      updated_at: now,
    });

    revalidatePath("/");
    revalidatePath("/leads");
    revalidatePath("/campaigns/new");

    return NextResponse.json({ batchId, queued: eligible.length, skipped: leadIds.length - eligible.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Enrichment batch failed";
    return NextResponse.json({ error: message }, { status: message.includes("Missing") ? 500 : 400 });
  }
}

function validateLeadIds(value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error("leadIds must be an array");
  const leadIds = [...new Set(value.map((item) => String(item).trim()).filter(Boolean))];
  if (leadIds.length === 0) throw new Error("Select at least one lead");
  if (leadIds.length > 500) throw new Error("Find emails can queue at most 500 leads at a time");
  return leadIds;
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
