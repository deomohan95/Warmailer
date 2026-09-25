import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { verifyEmailWithReoon } from "../../../../worker/src/enrichment-worker.mjs";
import { envValue, getActiveWorkspace } from "../../../lib/backend-data";

export const runtime = "nodejs";
export const maxDuration = 300;

type VerificationLeadRow = {
  id: string;
  email: string | null;
  email_status: string;
};

export async function POST(request: Request) {
  try {
    const leadIds = validateLeadIds((await request.json())?.leadIds);
    const workspace = await getActiveWorkspace();
    const leads = await supabaseGet<VerificationLeadRow[]>(
      `all_leads_mmp?workspace_id=eq.${workspace.workspaceId}&id=in.(${leadIds.map(encodeURIComponent).join(",")})&select=id,email,email_status`,
    );
    const eligible = verificationCandidates(leads);
    if (eligible.length === 0) throw new Error("No selected leads are eligible for verification");

    const config = {
      reoonApiKey: envValue("REOON_API_KEY"),
      reoonMode: envValue("REOON_MODE") ?? "power",
    };
    if (!config.reoonApiKey) throw new Error("Missing REOON_API_KEY");

    let verified = 0;
    let notVerified = 0;
    let failed = 0;
    let lastError: string | null = null;

    for (const lead of eligible) {
      try {
        const result = await verifyEmailWithReoon({ email: lead.email!, config });
        if (!result.verified) {
          notVerified++;
          continue;
        }
        await supabasePatch(`all_leads_mmp?workspace_id=eq.${workspace.workspaceId}&id=eq.${encodeURIComponent(lead.id)}`, {
          email_status: "verified",
          updated_at: new Date().toISOString(),
        });
        verified++;
      } catch (error) {
        lastError = error instanceof Error ? error.message : "Email verification failed";
        failed++;
      }
    }

    revalidatePath("/");
    revalidatePath("/leads");
    revalidatePath("/campaigns/new");

    return NextResponse.json({
      verified,
      notVerified,
      failed,
      skipped: leadIds.length - eligible.length,
      lastError,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Email verification failed";
    return NextResponse.json({ error: message }, { status: message.includes("Missing") ? 500 : 400 });
  }
}

export function verificationCandidates(leads: VerificationLeadRow[]) {
  return leads.filter((lead) => Boolean(lead.email) && lead.email_status === "found");
}

function validateLeadIds(value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error("leadIds must be an array");
  const leadIds = [...new Set(value.map((item) => String(item).trim()).filter(Boolean))];
  if (leadIds.length === 0) throw new Error("Select at least one lead");
  if (leadIds.length > 500) throw new Error("Verify emails can check at most 500 leads at a time");
  return leadIds;
}

async function supabaseGet<T>(path: string): Promise<T> {
  const response = await supabaseFetch(path, { method: "GET" });
  return (await response.json()) as T;
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
  const key = envValue("SUPABASE_SECRET_KEY") ?? envValue("SUPABASE_SERVICE_ROLE_KEY");
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
