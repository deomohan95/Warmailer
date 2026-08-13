import test from "node:test";
import assert from "node:assert/strict";

import { extractEmail, loadEnrichmentConfig, runPrimaryAndFallback } from "../src/enrichment-worker.mjs";

test("loads enrichment config from env aliases", () => {
  const config = loadEnrichmentConfig({
    NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-key",
    APIFY_TOKEN: "apify-token",
    APIFY_PRIMARY_ACTOR_ID: "primary",
    APIFY_PRIMARY_INPUT_KEY: "linkedin",
    APIFY_FALLBACK_ACTOR_ID: "fallback",
    APIFY_FALLBACK_INPUT_KEY: "linkedinUrls",
  });

  assert.equal(config.supabaseUrl, "https://project.supabase.co");
  assert.equal(config.primaryActorId, "primary");
  assert.equal(config.fallbackInputKey, "linkedinUrls");
});

test("extracts a valid email from unknown actor output", () => {
  assert.equal(extractEmail([{ profile: { emails: ["bad", "Jane@Example.COM"] } }]), "jane@example.com");
  assert.equal(extractEmail([{ value: "no email here" }]), null);
});

test("runs fallback only when primary returns no email", async () => {
  const calls = [];
  const result = await runPrimaryAndFallback({
    item: { linkedin_url_normalized: "https://www.linkedin.com/in/jane" },
    config: {
      primaryActorId: "primary",
      primaryInputKey: "linkedin",
      fallbackActorId: "fallback",
      fallbackInputKey: "linkedinUrls",
      apifyToken: "token",
      apifyWaitSeconds: 60,
    },
    callActor: async ({ actorId, input }) => {
      calls.push({ actorId, input });
      return actorId === "primary"
        ? { run: { id: "run-primary", status: "SUCCEEDED" }, items: [] }
        : { run: { id: "run-fallback", status: "SUCCEEDED" }, items: [{ email: "jane@example.com" }] };
    },
  });

  assert.equal(result.email, "jane@example.com");
  assert.deepEqual(calls, [
    { actorId: "primary", input: { linkedin: "https://www.linkedin.com/in/jane" } },
    { actorId: "fallback", input: { linkedinUrls: ["https://www.linkedin.com/in/jane"] } },
  ]);
});
