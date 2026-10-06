import test from "node:test";
import assert from "node:assert/strict";

import {
  extractEmail,
  createCandidateVerifier,
  loadEnrichmentConfig,
  processQueuedEnrichment,
  runBulkThenPrimary,
  runFallbackBatch,
  runPrimaryAndFallback,
  runWithConcurrency,
  verifyEmailWithReoon,
} from "../src/enrichment-worker.mjs";

test("loads enrichment config from env aliases", () => {
  const config = loadEnrichmentConfig({
    NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-key",
    APIFY_TOKEN: "apify-token",
    APIFY_LINKEDIN_EMAIL_FINDER_ACTOR_ID: "primary",
    APIFY_PRIMARY_INPUT_KEY: "linkedin",
    APIFY_BULK_ACTOR_ID: "bulk",
    APIFY_BULK_INPUT_KEY: "linkedin_url_or_ids",
    APIFY_LINKEDIN_EMAIL_SCRAPER_ACTOR_ID: "fallback",
    APIFY_FALLBACK_INPUT_KEY: "linkedinUrls",
    ENRICHMENT_PRIMARY_CONCURRENCY: "7",
  });

  assert.equal(config.supabaseUrl, "https://project.supabase.co");
  assert.equal(config.bulkActorId, "bulk");
  assert.equal(config.bulkInputKey, "linkedin_url_or_ids");
  assert.equal(config.primaryActorId, "primary");
  assert.equal(config.fallbackInputKey, "linkedinUrls");
  assert.equal(config.primaryConcurrency, 7);
});

test("runs workers with a bounded concurrency", async () => {
  let active = 0;
  let maxActive = 0;

  const results = await runWithConcurrency([1, 2, 3, 4, 5], 2, async (item) => {
    active++;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active--;
    return item * 2;
  });

  assert.deepEqual(results, [2, 4, 6, 8, 10]);
  assert.equal(maxActive, 2);
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

test("runs bulk first and one-by-one only for bulk misses", async () => {
  const calls = [];
  const result = await runBulkThenPrimary({
    items: [
      { id: "item-a", linkedin_url_normalized: "https://www.linkedin.com/in/a" },
      { id: "item-b", linkedin_url_normalized: "https://www.linkedin.com/in/b" },
      { id: "item-c", linkedin_url_normalized: "https://www.linkedin.com/in/c" },
    ],
    config: {
      bulkActorId: "bulk",
      bulkInputKey: "linkedin_url_or_ids",
      primaryActorId: "primary",
      primaryInputKey: "linkedin",
      primaryConcurrency: 2,
      apifyToken: "token",
      apifyWaitSeconds: 60,
    },
    callActor: async ({ actorId, input }) => {
      calls.push({ actorId, input });
      if (actorId === "bulk") {
        return {
          run: { id: "run-bulk", status: "SUCCEEDED" },
          items: [{ "06_Linkedin_url": "https://www.linkedin.com/in/a", "04_Email": "a@example.com" }],
        };
      }
      return {
        run: { id: `run-${input.linkedin}`, status: "SUCCEEDED" },
        items: input.linkedin.endsWith("/c") ? [{ email: "c@example.com" }] : [],
      };
    },
  });

  assert.deepEqual(calls, [
    {
      actorId: "bulk",
      input: {
        linkedin_url_or_ids: [
          "https://www.linkedin.com/in/a",
          "https://www.linkedin.com/in/b",
          "https://www.linkedin.com/in/c",
        ],
      },
    },
    { actorId: "primary", input: { linkedin: "https://www.linkedin.com/in/b" } },
    { actorId: "primary", input: { linkedin: "https://www.linkedin.com/in/c" } },
  ]);
  assert.equal(result.emails.get("item-a"), "a@example.com");
  assert.equal(result.emails.get("item-b"), null);
  assert.equal(result.emails.get("item-c"), "c@example.com");
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

test("verifies the same lead email candidate only once per worker run", async () => {
  const calls = [];
  const verifyCandidate = createCandidateVerifier({
    config: { reoonApiKey: "reoon-key", reoonMode: "power" },
    fetchImpl: async (url) => {
      calls.push(String(url));
      return Response.json({ status: "safe", is_safe_to_send: true });
    },
  });

  assert.equal((await verifyCandidate({ leadId: "lead-1", email: "Jane@Example.com" })).verified, true);
  assert.equal((await verifyCandidate({ leadId: "lead-1", email: "jane@example.com" })).verified, true);
  assert.equal(calls.length, 1);
});

test("find worker verifies bulk emails before saving them", async () => {
  const requests = [];
  const fetchImpl = fakeEnrichmentFetch({
    requests,
    leads: [{ id: "lead-1", name: "Jane Doe", company: "Acme LLC", email: null }],
    bulkItems: [{ linkedin: "https://www.linkedin.com/in/jane", email: "jane.doe@acme.com" }],
    reoonByEmail: { "jane.doe@acme.com": { status: "safe", is_safe_to_send: true } },
  });

  const summary = await processQueuedEnrichment({
    config: testConfig(),
    fetchImpl,
  });

  assert.deepEqual(summary, { processed: 1, found: 1, notFound: 0, failed: 0 });
  assert.ok(requests.some((request) => request.url.includes("email=jane.doe%40acme.com")));
  assert.ok(requests.some((request) => request.url.includes("all_leads_mmp?id=eq.lead-1") && request.body?.email_status === "verified"));
  assert.ok(requests.some((request) => request.url.includes("company_email_patterns") && request.method === "POST"));
});

test("find worker sends bulk rejects to one-by-one fallback before marking not found", async () => {
  const requests = [];
  const fetchImpl = fakeEnrichmentFetch({
    requests,
    leads: [{ id: "lead-1", name: "Jane Doe", company: "Acme LLC", email: null }],
    bulkItems: [{ linkedin: "https://www.linkedin.com/in/jane", email: "jane.doe@acme.com" }],
    primaryItems: [{ email: "jdoe@acme.com" }],
    reoonByEmail: {
      "jane.doe@acme.com": { status: "invalid", is_safe_to_send: false },
      "jdoe@acme.com": { status: "safe", is_safe_to_send: true },
    },
  });

  const summary = await processQueuedEnrichment({
    config: testConfig(),
    fetchImpl,
  });

  assert.deepEqual(summary, { processed: 1, found: 1, notFound: 0, failed: 0 });
  assert.ok(requests.some((request) => request.url.includes("/acts/primary/runs")));
  assert.ok(requests.some((request) => request.url.includes("all_leads_mmp?id=eq.lead-1") && request.body?.email === "jdoe@acme.com"));
});

test("find worker uses saved company patterns before paid Apify", async () => {
  const requests = [];
  const fetchImpl = fakeEnrichmentFetch({
    requests,
    leads: [{ id: "lead-1", name: "Jane Doe", company: "Acme LLC", email: null }],
    patterns: [{ company_key: "acme", domain: "acme.com", pattern: "first.last", verified_count: 5 }],
    reoonByEmail: { "jane.doe@acme.com": { status: "safe", is_safe_to_send: true } },
  });

  const summary = await processQueuedEnrichment({
    config: testConfig(),
    fetchImpl,
  });

  assert.deepEqual(summary, { processed: 1, found: 1, notFound: 0, failed: 0 });
  assert.equal(requests.some((request) => request.url.includes("/acts/")), false);
  assert.ok(requests.some((request) => request.url.includes("all_leads_mmp?id=eq.lead-1") && request.body?.email === "jane.doe@acme.com"));
});

test("find worker still verifies bulk emails when pattern table is not migrated yet", async () => {
  const requests = [];
  const fetchImpl = fakeEnrichmentFetch({
    requests,
    tableMissing: true,
    leads: [{ id: "lead-1", name: "Jane Doe", company: "Acme LLC", email: null }],
    bulkItems: [{ linkedin: "https://www.linkedin.com/in/jane", email: "jane.doe@acme.com" }],
    reoonByEmail: { "jane.doe@acme.com": { status: "safe", is_safe_to_send: true } },
  });

  const summary = await processQueuedEnrichment({
    config: testConfig(),
    fetchImpl,
  });

  assert.deepEqual(summary, { processed: 1, found: 1, notFound: 0, failed: 0 });
  assert.ok(requests.some((request) => request.url.includes("all_leads_mmp?id=eq.lead-1") && request.body?.email_status === "verified"));
});

test("find worker reuses existing verified leads when pattern table is not migrated yet", async () => {
  const requests = [];
  const fetchImpl = fakeEnrichmentFetch({
    requests,
    tableMissing: true,
    leads: [{ id: "lead-1", name: "Jane Doe", company: "Acme LLC", email: null }],
    verifiedLeads: [{ name: "John Smith", email: "john.smith@acme.com" }],
    reoonByEmail: { "jane.doe@acme.com": { status: "safe", is_safe_to_send: true } },
  });

  const summary = await processQueuedEnrichment({
    config: testConfig(),
    fetchImpl,
  });

  assert.deepEqual(summary, { processed: 1, found: 1, notFound: 0, failed: 0 });
  assert.equal(requests.some((request) => request.url.includes("/acts/")), false);
  assert.ok(requests.some((request) => request.url.includes("all_leads_mmp?id=eq.lead-1") && request.body?.email === "jane.doe@acme.com"));
});

test("find worker learns a bulk pattern and guesses same-company misses", async () => {
  const requests = [];
  const fetchImpl = fakeEnrichmentFetch({
    requests,
    leads: [
      { id: "lead-1", name: "John Smith", company: "Acme LLC", email: null },
      { id: "lead-2", name: "Jane Doe", company: "Acme LLC", email: null },
    ],
    bulkItems: [{ linkedin: "https://www.linkedin.com/in/john", email: "john.smith@acme.com" }],
    reoonByEmail: {
      "john.smith@acme.com": { status: "safe", is_safe_to_send: true },
      "jane.doe@acme.com": { status: "safe", is_safe_to_send: true },
    },
  });

  const summary = await processQueuedEnrichment({
    config: testConfig(),
    fetchImpl,
  });

  assert.deepEqual(summary, { processed: 2, found: 2, notFound: 0, failed: 0 });
  assert.equal(requests.some((request) => request.url.includes("/acts/primary/runs")), false);
  assert.ok(requests.some((request) => request.url.includes("all_leads_mmp?id=eq.lead-2") && request.body?.email === "jane.doe@acme.com"));
});

test("find worker does not save bad pattern guesses", async () => {
  const requests = [];
  const fetchImpl = fakeEnrichmentFetch({
    requests,
    leads: [
      { id: "lead-1", name: "John Smith", company: "Acme LLC", email: null },
      { id: "lead-2", name: "Jane Doe", company: "Acme LLC", email: null },
    ],
    bulkItems: [{ linkedin: "https://www.linkedin.com/in/john", email: "john.smith@acme.com" }],
    reoonByEmail: {
      "john.smith@acme.com": { status: "safe", is_safe_to_send: true },
      "jane.doe@acme.com": { status: "invalid", is_safe_to_send: false },
    },
  });

  const summary = await processQueuedEnrichment({
    config: testConfig(),
    fetchImpl,
  });

  assert.deepEqual(summary, { processed: 2, found: 1, notFound: 1, failed: 0 });
  assert.equal(
    requests.some((request) => request.url.includes("all_leads_mmp?id=eq.lead-2") && request.body?.email === "jane.doe@acme.com"),
    false,
  );
  assert.ok(requests.some((request) => request.url.includes("all_leads_mmp?id=eq.lead-2") && request.body?.email_status === "not_found"));
});

function testConfig() {
  return {
    supabaseUrl: "https://project.supabase.co",
    supabaseKey: "service-key",
    apifyToken: "apify-token",
    bulkActorId: "bulk",
    bulkInputKey: "linkedin_url_or_ids",
    primaryActorId: "primary",
    primaryInputKey: "linkedin",
    fallbackActorId: "fallback",
    fallbackInputKey: "linkedinUrls",
    reoonApiKey: "reoon-key",
    reoonMode: "power",
    apifyWaitSeconds: 60,
    limit: 10,
    primaryConcurrency: 1,
  };
}

function fakeEnrichmentFetch({ requests, leads, bulkItems = [], primaryItems = [], patterns = [], verifiedLeads = [], tableMissing = false, reoonByEmail = {} }) {
  const queuedItems = leads.map((lead, index) => ({
    id: `item-${index + 1}`,
    workspace_id: "workspace-1",
    batch_id: "batch-1",
    lead_id: lead.id,
    linkedin_url_normalized: `https://www.linkedin.com/in/${lead.name.toLowerCase().split(" ")[0]}`,
    primary_attempts: 0,
    fallback_attempts: 0,
  }));

  return async (url, init = {}) => {
    const method = init.method ?? "GET";
    const body = init.body ? JSON.parse(init.body) : null;
    requests.push({ url: String(url), method, body });

    if (String(url).includes("emailverifier.reoon.com")) {
      const email = new URL(String(url)).searchParams.get("email");
      return Response.json(reoonByEmail[email] ?? { status: "invalid", is_safe_to_send: false });
    }

    if (String(url).includes("/acts/bulk/runs")) {
      return Response.json({ data: { id: "run-bulk", status: "SUCCEEDED", defaultDatasetId: "bulk-dataset" } });
    }

    if (String(url).includes("/acts/primary/runs")) {
      return Response.json({ data: { id: "run-primary", status: "SUCCEEDED", defaultDatasetId: "primary-dataset" } });
    }

    if (String(url).includes("/datasets/bulk-dataset/items")) return Response.json(bulkItems);
    if (String(url).includes("/datasets/primary-dataset/items")) return Response.json(primaryItems);

    if (String(url).includes("/rest/v1/enrichment_items?status=eq.queued")) return Response.json(queuedItems);
    if (String(url).includes("/rest/v1/all_leads_mmp?id=in.")) return Response.json(leads);
    if (String(url).includes("/rest/v1/all_leads_mmp?workspace_id=eq.") && String(url).includes("company=eq.")) {
      return Response.json(verifiedLeads);
    }
    if (String(url).includes("/rest/v1/company_email_patterns")) {
      if (tableMissing) {
        return Response.json({ code: "PGRST205", message: "Could not find the table 'public.company_email_patterns' in the schema cache" }, { status: 404 });
      }
      if (method === "GET") return Response.json(patterns);
    }
    if (String(url).includes("/rest/v1/enrichment_items?batch_id=eq.batch-1")) {
      return Response.json([{ status: "found", email_found: "saved@example.com" }]);
    }

    return new Response(null, { status: 204 });
  };
}
