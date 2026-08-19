import { NextResponse } from "next/server";

import { buildWarmupDeps, runWarmupCycle } from "../../../../../worker/src/warmup-worker.mjs";
import { envValue } from "../../../../lib/backend-data";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const runtime = "nodejs";

export async function GET(request: Request) {
  const secret = envValue("CRON_SECRET");
  if (!secret) return NextResponse.json({ error: "Missing CRON_SECRET" }, { status: 500 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const deps = buildWarmupDeps(loadWarmupConfig());
  const summary = await runWarmupCycle(deps);
  return NextResponse.json(summary);
}

export function loadWarmupConfig(env: Record<string, string | undefined> = process.env) {
  return {
    supabaseUrl: envValue("NEXT_PUBLIC_SUPABASE_URL", env)?.replace(/\/$/, ""),
    supabaseKey: envValue("SUPABASE_SERVICE_ROLE_KEY", env) ?? envValue("SUPABASE_SECRET_KEY", env),
    encryptionKey: Buffer.from(envValue("WORKER_ENCRYPTION_KEY", env) ?? "", "base64"),
    composioApiKey: envValue("COMPOSIO_API_KEY", env) ?? envValue("Composio_api_key", env),
    smtpHost: envValue("ZOHO_SMTP_HOST", env) ?? "smtp.zoho.com",
    smtpPort: Number(envValue("ZOHO_SMTP_PORT", env) ?? 465),
  };
}
