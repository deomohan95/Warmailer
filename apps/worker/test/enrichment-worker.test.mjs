import test from "node:test";
import assert from "node:assert/strict";

import { extractEmail, loadEnrichmentConfig, runFallbackBatch, runPrimaryAndFallback, verifyEmailWithReoon } from "../src/enrichment-worker.mjs";

test("loads enrichment config from env aliases", () => {
  const config = loadEnrichmentConfig({
    NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-key",
    APIFY_TOKEN: "apify-token",
    APIFY_LINKEDIN_EMAIL_FINDER_ACTOR_ID: "primary",
    APIFY_PRIMARY_INPUT_KEY: "linkedin",
    APIFY_LINKEDIN_EMAIL_SCRAPER_ACTOR_ID: "fallback",
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
    {
      actorId: "fallback",
      input: {
        linkedinUrls: ["https://www.linkedin.com/in/jane"],
        includeWorkEmails: true,
        includePersonalEmails: true,
        onlyWithEmails: true,
      },
    },
  ]);
});

test("runs fallback backup in one bulk call and maps emails by LinkedIn URL", async () => {
  const calls = [];
  const result = await runFallbackBatch({
    items: [
      { id: "item-a", linkedin_url_normalized: "https://www.linkedin.com/in/a" },
      { id: "item-b", linkedin_url_normalized: "https://www.linkedin.com/in/b" },
    ],
    config: {
      fallbackActorId: "fallback",
      fallbackInputKey: "linkedinUrls",
      apifyToken: "token",
      apifyWaitSeconds: 60,
    },
    callActor: async ({ actorId, input }) => {
      calls.push({ actorId, input });
      return {
        run: { id: "run-fallback", status: "SUCCEEDED" },
        items: [
          { linkedin: "https://www.linkedin.com/in/b/", email: "b@example.com" },
          { linkedin: "https://www.linkedin.com/in/a", email: "a@example.com" },
        ],
      };
    },
  });

  assert.deepEqual(calls, [
    {
      actorId: "fallback",
      input: {
        linkedinUrls: ["https://www.linkedin.com/in/a", "https://www.linkedin.com/in/b"],
        includeWorkEmails: true,
        includePersonalEmails: true,
        onlyWithEmails: true,
      },
    },
  ]);
  assert.equal(result.emails.get("item-a"), "a@example.com");
  assert.equal(result.emails.get("item-b"), "b@example.com");
});

test("verifies emails with Reoon safe/valid responses", async () => {
  const calls = [];
  const result = await verifyEmailWithReoon({
    email: "jane@example.com",
    config: { reoonApiKey: "reoon-key", reoonMode: "power" },
    fetchImpl: async (url) => {
      calls.push(String(url));
      return Response.json({ status: "safe", is_safe_to_send: true });
    },
  });

  assert.equal(result.verified, true);
  assert.match(calls[0], /email=jane%40example\.com/);
  assert.match(calls[0], /key=reoon-key/);
  assert.match(calls[0], /mode=power/);
});
