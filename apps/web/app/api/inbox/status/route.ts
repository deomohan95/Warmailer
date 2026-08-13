import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { envValue, getActiveWorkspace } from "@/lib/backend-data";
import type { ThreadStatus } from "@/lib/types";

export const runtime = "nodejs";

const allowed = new Set<ThreadStatus>(["unread", "read", "replied", "archived"]);

export async function PATCH(request: Request) {
  try {
    const { threadId, status } = validate(await request.json());
    const workspace = await getActiveWorkspace();
    const now = new Date().toISOString();

    await supabasePatch(
      `inbox_threads?id=eq.${encodeURIComponent(threadId)}&workspace_id=eq.${encodeURIComponent(workspace.workspaceId)}`,
      { status, updated_at: now },
    );

    revalidatePath("/inbox");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Status update failed" }, { status: 400 });
  }
}

function validate(input: { threadId?: string; status?: ThreadStatus }) {
  const threadId = String(input.threadId ?? "").trim();
  const status = input.status;
  if (!threadId) throw new Error("Thread id is required");
  if (!status || !allowed.has(status)) throw new Error("Status is invalid");
  return { threadId, status };
}

async function supabasePatch(path: string, body: unknown) {
  const url = envValue("NEXT_PUBLIC_SUPABASE_URL")?.replace(/\/$/, "");
  const key = envValue("SUPABASE_SERVICE_ROLE_KEY") ?? envValue("SUPABASE_SECRET_KEY");
  if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  if (!key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  const response = await fetch(`${url}/rest/v1/${path}`, {
    method: "PATCH",
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      prefer: "return=minimal",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error((await response.text()) || `Supabase update failed: ${response.status}`);
}
