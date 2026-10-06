import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bulkActorInput,
  nextEnrichmentState,
  planPrimaryRecoveryBatch,
  primaryActorInput,
  fallbackActorInput,
} from "../src/enrichment-state.mjs";

test("bulk actor input sends selected LinkedIn URLs in one paid run", () => {
  assert.deepEqual(bulkActorInput([
    { linkedinUrlNormalized: "https://www.linkedin.com/in/a" },
    { linkedinUrlNormalized: "https://www.linkedin.com/in/b" },
  ]), {
    actorId: "snipercoder/bulk-linkedin-email-finder",
    input: {
      linkedin_url_or_ids: ["https://www.linkedin.com/in/a", "https://www.linkedin.com/in/b"],
    },
  });
});

test("primary actor input is one canonical LinkedIn URL per paid run", () => {
  assert.deepEqual(primaryActorInput("https://www.linkedin.com/in/jane-doe"), {
    actorId: "UMdANQyqx3b2JVuxg",
    input: { linkedin: "https://www.linkedin.com/in/jane-doe" },
  });
});

test("distinguishes found, genuine not_found, retryable operational errors, and terminal malformed output", () => {
  assert.deepEqual(nextEnrichmentState({ phase: "primary", status: "succeeded", email: "jane@acme.test" }), {
    emailStatus: "found",
    action: "store_email",
    retry: false,
  });
  assert.deepEqual(nextEnrichmentState({ phase: "fallback", status: "succeeded", email: null }), {
    emailStatus: "not_found",
    action: "queue_primary",
    retry: false,
  });
  assert.deepEqual(nextEnrichmentState({ phase: "primary", status: "timeout" }), {
    emailStatus: "failed",
    action: "retry_primary",
    retry: true,
  });
  assert.deepEqual(nextEnrichmentState({ phase: "fallback", status: "malformed" }), {
    emailStatus: "failed",
    action: "mark_terminal",
    retry: false,
  });
});

test("primary recovery only runs on genuine bulk misses and keeps fallback input available", () => {
  const batch = planPrimaryRecoveryBatch([
    { workspaceId: "w1", leadId: "l1", linkedinUrlNormalized: "https://www.linkedin.com/in/a", bulkResult: "not_found" },
    { workspaceId: "w1", leadId: "l2", linkedinUrlNormalized: "https://www.linkedin.com/in/b", bulkResult: "timeout" },
    { workspaceId: "w2", leadId: "l3", linkedinUrlNormalized: "https://www.linkedin.com/in/c", bulkResult: "not_found" },
  ], "w1");

  assert.deepEqual(batch.items, [
    { leadId: "l1", linkedinUrlNormalized: "https://www.linkedin.com/in/a" },
  ]);
  assert.deepEqual(fallbackActorInput(batch.items), {
    actorId: "q3wko0Sbx6ZAAB2xf",
    input: {
      linkedinUrls: ["https://www.linkedin.com/in/a"],
      includeWorkEmails: true,
      includePersonalEmails: true,
      onlyWithEmails: true,
    },
  });
});
