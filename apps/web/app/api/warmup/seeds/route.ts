import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { WarmupSeedCreateInputSchema } from "../../../../../../packages/contracts/src/index";
import { requireWarmupAdmin } from "@/lib/admin";
import { envValue, getActiveWorkspace } from "@/lib/backend-data";

export const runtime = "nodejs";

type WarmupSeedRow = {
  id: string;
  workspace_id: string;
  provider: "gmail";
  email_address: string;
  status: "connected" | "disabled" | "error";
  last_checked_at: string | null;
  created_at: string;
  updated_at: string;
};

export async function GET() {
  try {
    await requireWarmupAdmin();
    const workspace = await getActiveWorkspace();
    const rows = await supabaseGet<WarmupSeedRow[]>(
      `warmup_seed_accounts?workspace_id=eq.${encodeURIComponent(workspace.workspaceId)}&select=id,workspace_id,provider,email_address,status,last_checked_at,created_at,updated_at&order=created_at.desc`,
    );

    return NextResponse.json({
      seeds: rows.map((row) => ({
        seedAccountId: row.id,
        workspaceId: row.workspace_id,
        provider: row.provider,
        emailAddress: row.email_address,
        status: row.status,
        lastCheckedAt: row.last_checked_at ?? undefined,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Warmup seeds load failed";
    return NextResponse.json({ error: message }, { status: message === "Forbidden" ? 403 : 400 });
  }
}

export async function POST(request: Request) {
  try {
    await requireWarmupAdmin();
    const input = WarmupSeedCreateInputSchema.parse(await request.json());
    const workspace = await getActiveWorkspace();
    const seedAccountId = randomUUID();
    const now = new Date().toISOString();

    await supabasePost("warmup_seed_accounts", {
      id: seedAccountId,
      workspace_id: workspace.workspaceId,
      provider: "gmail",
      email_address: input.emailAddress,
      composio_user_id: input.composioUserId,
      composio_connected_account_id: input.composioConnectedAccountId,
      status: "connected",
      created_at: now,
      updated_at: now,
    });

    revalidatePath("/settings/admin");
    return NextResponse.json({ seedAccountId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Warmup seed save failed";
    return NextResponse.json({ error: message }, { status: message === "Forbidden" ? 403 : message.includes("duplicate") ? 409 : 400 });
  }
}

async function supabaseGet<T>(path: string): Promise<T> {
  const response = await supabaseFetch(path, { method: "GET" });
  return (await response.json()) as T;
}

async function supabasePost(table: string, body: unknown) {
  await supabaseFetch(table, {
    method: "POST",
    headers: { "content-type": "application/json", prefer: "return=minimal" },
    body: JSON.stringify(body),
  });
}

async function supabaseFetch(path: string, init: RequestInit) {
  const url = envValue("NEXT_PUBLIC_SUPABASE_URL")?.replace(/\/$/, "");
  const key = envValue("SUPABASE_SERVICE_ROLE_KEY") ?? envValue("SUPABASE_SECRET_KEY");
  if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  if (!key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) throw new Error((await response.text()) || `Supabase request failed: ${response.status}`);
  return response;
}
