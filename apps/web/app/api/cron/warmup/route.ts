import { NextResponse } from "next/server";

import { buildWarmupDeps, runWarmupCycle } from "../../../../../worker/src/warmup-worker.mjs";
import { envValue } from "../../../../lib/backend-data";
import { loadWarmupConfig } from "./config";

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

