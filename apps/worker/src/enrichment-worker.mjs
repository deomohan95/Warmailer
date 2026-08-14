import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PRIMARY_ACTOR_ID = "UMdANQyqx3b2JVuxg";
const FALLBACK_ACTOR_ID = "q3wko0Sbx6ZAAB2xf";

export function loadEnrichmentConfig(env = process.env) {
  const local = env === process.env ? readLocalEnv() : {};
  const value = (name) => env[name] ?? local[name];
  const config = {
    supabaseUrl: value("NEXT_PUBLIC_SUPABASE_URL")?.replace(/\/$/, ""),
    supabaseKey: value("SUPABASE_SERVICE_ROLE_KEY") ?? value("SUPABASE_SECRET_KEY"),
    apifyToken: value("APIFY_TOKEN") ?? value("APIFY_API_TOKEN"),
    primaryActorId: value("APIFY_PRIMARY_ACTOR_ID") ?? PRIMARY_ACTOR_ID,
    primaryInputKey: value("APIFY_PRIMARY_INPUT_KEY") ?? "linkedin",
    fallbackActorId: value("APIFY_FALLBACK_ACTOR_ID") ?? FALLBACK_ACTOR_ID,
    fallbackInputKey: value("APIFY_FALLBACK_INPUT_KEY") ?? "linkedinUrls",
    apifyWaitSeconds: Number(value("APIFY_WAIT_SECONDS") ?? 120),
    limit: Number(value("ENRICHMENT_WORKER_LIMIT") ?? 10),
  };

  for (const key of ["supabaseUrl", "supabaseKey", "apifyToken", "primaryActorId", "fallbackActorId"]) {
    if (!config[key]) throw new Error(`Missing ${key}`);
  }

  return config;
}

export function extractEmail(value) {
  if (typeof value === "string") return EMAIL.test(value) ? value.match(EMAIL)[0].toLowerCase() : null;
  if (!value || typeof value !== "object") return null;
  for (const item of Array.isArray(value) ? value : Object.values(value)) {
    const found = extractEmail(item);
    if (found) return found;
  }
  return null;
}

export async function runPrimaryAndFallback({ item, config, callActor = callApifyActor }) {
  const linkedin = item.linkedin_url_normalized;
  const primary = await callActor({
    actorId: config.primaryActorId,
    input: { [config.primaryInputKey]: linkedin },
    config,
  });
  if (primary.run?.status && primary.run.status !== "SUCCEEDED") throw new Error(`Primary actor ${primary.run.status}`);

  const primaryEmail = extractEmail(primary.items);
  if (primaryEmail) return { email: primaryEmail, phase: "primary", primary, fallback: null };

  const fallback = await callActor({
    actorId: config.fallbackActorId,
    input: { [config.fallbackInputKey]: [linkedin] },
    config,
  });
  if (fallback.run?.status && fallback.run.status !== "SUCCEEDED") throw new Error(`Fallback actor ${fallback.run.status}`);

  return { email: extractEmail(fallback.items), phase: "fallback", primary, fallback };
}

export async function callApifyActor({ actorId, input, config, fetchImpl = fetch }) {
  const actor = encodeURIComponent(actorId.includes("/") ? actorId.replace("/", "~") : actorId);
  const runResponse = await fetchImpl(
    `https://api.apify.com/v2/acts/${actor}/runs?token=${encodeURIComponent(config.apifyToken)}&waitForFinish=${config.apifyWaitSeconds}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    },
  );
  if (!runResponse.ok) throw new Error(`Apify run failed: ${runResponse.status} ${await runResponse.text()}`);
  const run = (await runResponse.json()).data ?? {};
  const datasetId = run.defaultDatasetId;
  if (!datasetId) return { run, items: [] };

  const itemsResponse = await fetchImpl(
    `https://api.apify.com/v2/datasets/${encodeURIComponent(datasetId)}/items?clean=true&token=${encodeURIComponent(config.apifyToken)}`,
  );
  if (!itemsResponse.ok) throw new Error(`Apify dataset failed: ${itemsResponse.status} ${await itemsResponse.text()}`);
  return { run, items: await itemsResponse.json() };
}

export async function processQueuedEnrichment({ config = loadEnrichmentConfig(), fetchImpl = fetch } = {}) {
  const db = supabaseClient(config, fetchImpl);
  const items = await db.get(
    `enrichment_items?status=eq.queued&select=id,workspace_id,batch_id,lead_id,linkedin_url_normalized,primary_attempts,fallback_attempts&order=created_at.asc&limit=${config.limit}`,
  );
  const summary = { processed: 0, found: 0, notFound: 0, failed: 0 };
  const batchIds = new Set();

  for (const item of items) {
    batchIds.add(item.batch_id);
    await db.patch(`enrichment_batches?id=eq.${item.batch_id}`, { status: "running" });
    await db.patch(`enrichment_items?id=eq.${item.id}&status=eq.queued`, {
      status: "primary_running",
      primary_attempts: Number(item.primary_attempts ?? 0) + 1,
      updated_at: new Date().toISOString(),
    });
    await db.patch(`all_leads_mmp?id=eq.${item.lead_id}`, { email_status: "processing", updated_at: new Date().toISOString() });

    try {
      const result = await runPrimaryAndFallback({
        item,
        config,
        callActor: (args) => callApifyActor({ ...args, fetchImpl }),
      });
      await saveRun(db, item, "primary", config.primaryActorId, { [config.primaryInputKey]: item.linkedin_url_normalized }, result.primary);
      if (result.fallback) {
        await db.patch(`enrichment_items?id=eq.${item.id}`, {
          status: "fallback_running",
          fallback_attempts: Number(item.fallback_attempts ?? 0) + 1,
          updated_at: new Date().toISOString(),
        });
        await saveRun(db, item, "fallback", config.fallbackActorId, { [config.fallbackInputKey]: [item.linkedin_url_normalized] }, result.fallback);
      }

      const now = new Date().toISOString();
      if (result.email) {
        await db.patch(`all_leads_mmp?id=eq.${item.lead_id}`, {
          email: result.email,
          email_status: "found",
          last_enriched_at: now,
          updated_at: now,
        });
        await db.patch(`enrichment_items?id=eq.${item.id}`, { status: "found", email_found: result.email, updated_at: now });
        summary.found++;
      } else {
        await db.patch(`all_leads_mmp?id=eq.${item.lead_id}`, { email_status: "not_found", last_enriched_at: now, updated_at: now });
        await db.patch(`enrichment_items?id=eq.${item.id}`, { status: "not_found", updated_at: now });
        summary.notFound++;
      }
    } catch (error) {
      const now = new Date().toISOString();
      const message = error instanceof Error ? error.message : "Unknown enrichment error";
      await db.patch(`all_leads_mmp?id=eq.${item.lead_id}`, { email_status: "failed", last_enriched_at: now, updated_at: now });
      await db.patch(`enrichment_items?id=eq.${item.id}`, { status: "failed", last_error: message.slice(0, 500), updated_at: now });
      summary.failed++;
    }
    summary.processed++;
  }

  for (const batchId of batchIds) await finalizeBatch(db, batchId);
  return summary;
}

function supabaseClient(config, fetchImpl) {
  const headers = {
    apikey: config.supabaseKey,
    authorization: `Bearer ${config.supabaseKey}`,
    "content-type": "application/json",
  };
  const request = async (path, init = {}) => {
    const response = await fetchImpl(`${config.supabaseUrl}/rest/v1/${path}`, {
      ...init,
      headers: { ...headers, ...init.headers },
    });
    if (!response.ok) throw new Error(`Supabase ${init.method ?? "GET"} failed: ${response.status} ${await response.text()}`);
    return response;
  };
  return {
    get: async (path) => (await (await request(path)).json()),
    post: (path, body) => request(path, { method: "POST", body: JSON.stringify(body) }),
    patch: (path, body) => request(path, { method: "PATCH", headers: { prefer: "return=minimal" }, body: JSON.stringify(body) }),
  };
}

async function saveRun(db, item, phase, actorId, input, actorResult) {
  await db.post("apify_runs", {
    workspace_id: item.workspace_id,
    enrichment_item_id: item.id,
    actor_id: actorId,
    apify_run_id: actorResult.run?.id ?? `local-${randomUUID()}`,
    phase,
    input,
    status: actorResult.run?.status ?? "SUCCEEDED",
    result: actorResult.items,
    completed_at: new Date().toISOString(),
  });
}

async function finalizeBatch(db, batchId) {
  const rows = await db.get(`enrichment_items?batch_id=eq.${batchId}&select=status,email_found`);
  const found = rows.filter((row) => row.status === "found").length;
  const notFound = rows.filter((row) => row.status === "not_found").length;
  const failed = rows.filter((row) => row.status === "failed").length;
  const done = found + notFound + failed === rows.length;
  await db.patch(`enrichment_batches?id=eq.${batchId}`, {
    found_items: found,
    not_found_items: notFound,
    failed_items: failed,
    status: done ? (failed ? "completed_with_errors" : "completed") : "running",
    completed_at: done ? new Date().toISOString() : null,
  });
}

function readLocalEnv() {
  const start = dirname(fileURLToPath(import.meta.url));
  for (const file of [resolve(start, "../../../.env.local"), join(process.cwd(), ".env.local")]) {
    if (!existsSync(/*turbopackIgnore: true*/ file)) continue;
    return Object.fromEntries(
      readFileSync(/*turbopackIgnore: true*/ file, "utf8")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#") && line.includes("="))
        .map((line) => {
          const index = line.indexOf("=");
          const key = line.slice(0, index).trim();
          let value = line.slice(index + 1).trim();
          if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
          return [key, value];
        }),
    );
  }
  return {};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  processQueuedEnrichment()
    .then((summary) => console.log(JSON.stringify(summary)))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
