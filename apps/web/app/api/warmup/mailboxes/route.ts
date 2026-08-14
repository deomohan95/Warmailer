import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { WarmupMailboxUpdateInputSchema } from "../../../../../../packages/contracts/src/index";
import { envValue, getActiveWorkspace } from "@/lib/backend-data";

export const runtime = "nodejs";

export async function PATCH(request: Request) {
  try {
    const input = WarmupMailboxUpdateInputSchema.parse(await request.json());
    const workspace = await getActiveWorkspace();
    const now = new Date().toISOString();

    await supabasePatch(
      `mailboxes?id=eq.${encodeURIComponent(input.mailboxId)}&workspace_id=eq.${encodeURIComponent(workspace.workspaceId)}`,
      {
        warmup_enabled: input.warmupEnabled,
        warmup_daily_limit: input.warmupDailyLimit,
        warmup_daily_rampup: input.warmupDailyRampup,
        warmup_randomize_daily_count: input.warmupRandomizeDailyCount,
        warmup_reply_rate_percent: input.warmupReplyRatePercent,
        warmup_started_at: input.warmupEnabled ? now : null,
        status: input.warmupEnabled ? "warming" : "connected",
        updated_at: now,
      },
    );

    await supabasePost("mailbox_events", {
      workspace_id: workspace.workspaceId,
      mailbox_id: input.mailboxId,
      event_type: input.warmupEnabled ? "resumed" : "paused",
      source: "user_action",
      metadata: {
        warmupDailyLimit: input.warmupDailyLimit,
        warmupDailyRampup: input.warmupDailyRampup,
        warmupRandomizeDailyCount: input.warmupRandomizeDailyCount,
        warmupReplyRatePercent: input.warmupReplyRatePercent,
      },
      created_at: now,
    });

    revalidatePath("/mailboxes");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Warmup update failed" }, { status: 400 });
  }
}

async function supabasePost(table: string, body: unknown) {
  await supabaseFetch(table, {
    method: "POST",
    headers: { "content-type": "application/json", prefer: "return=minimal" },
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
