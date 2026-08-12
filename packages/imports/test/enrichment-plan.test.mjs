import assert from "node:assert/strict";
import { test } from "node:test";
import { claimNextEnrichmentItem, planEnrichmentBatch } from "../src/enrichment-plan.mjs";

test("plans enrichment only for eligible leads in the active workspace", () => {
  const plan = planEnrichmentBatch({
    workspaceId: "workspace-1",
    selection: { leadIds: ["lead-1", "lead-2", "lead-3", "lead-4"] },
    leads: [
      {
        id: "lead-1",
        workspaceId: "workspace-1",
        email: "",
        emailStatus: "not_enriched",
        linkedinUrlNormalized: "https://www.linkedin.com/in/a",
      },
      {
        id: "lead-2",
        workspaceId: "workspace-1",
        email: "known@example.test",
        emailStatus: "found",
        linkedinUrlNormalized: "https://www.linkedin.com/in/b",
      },
      {
        id: "lead-3",
        workspaceId: "workspace-1",
        email: "",
        emailStatus: "processing",
        linkedinUrlNormalized: "https://www.linkedin.com/in/c",
      },
      {
        id: "lead-4",
        workspaceId: "workspace-2",
        email: "",
        emailStatus: "not_enriched",
        linkedinUrlNormalized: "https://www.linkedin.com/in/d",
      },
    ],
    inFlightLeadIds: new Set(["lead-3"]),
  });

  assert.deepEqual(plan.items, [
    {
      leadId: "lead-1",
      workspaceId: "workspace-1",
      linkedinUrlNormalized: "https://www.linkedin.com/in/a",
    },
  ]);
  assert.deepEqual(plan.skipped, [
    { leadId: "lead-2", reason: "existing_email" },
    { leadId: "lead-3", reason: "in_flight" },
    { leadId: "lead-4", reason: "wrong_workspace" },
  ]);
});

test("all-filtered selection applies server-side predicate and exclusions", () => {
  const plan = planEnrichmentBatch({
    workspaceId: "workspace-1",
    selection: { filterToken: "eligible_page", excludedLeadIds: ["lead-2"] },
    leads: [
      {
        id: "lead-1",
        workspaceId: "workspace-1",
        email: "",
        emailStatus: "not_enriched",
        linkedinUrlNormalized: "https://www.linkedin.com/in/a",
        industry: "SaaS",
      },
      {
        id: "lead-2",
        workspaceId: "workspace-1",
        email: "",
        emailStatus: "not_enriched",
        linkedinUrlNormalized: "https://www.linkedin.com/in/b",
        industry: "SaaS",
      },
      {
        id: "lead-3",
        workspaceId: "workspace-1",
        email: "",
        emailStatus: "not_enriched",
        linkedinUrlNormalized: "",
        industry: "SaaS",
      },
    ],
    filters: {
      eligible_page: (lead) => lead.industry === "SaaS",
    },
    inFlightLeadIds: new Set(),
  });

  assert.deepEqual(plan.items, [
    {
      leadId: "lead-1",
      workspaceId: "workspace-1",
      linkedinUrlNormalized: "https://www.linkedin.com/in/a",
    },
  ]);
  assert.deepEqual(plan.skipped, [
    { leadId: "lead-2", reason: "excluded" },
    { leadId: "lead-3", reason: "missing_linkedin" },
  ]);
});

test("claiming enrichment work skips locked or non-queued items", () => {
  const now = new Date("2026-08-12T06:00:00Z");
  const lease = claimNextEnrichmentItem({
    now,
    leaseMs: 300000,
    workerId: "worker-1",
    items: [
      {
        id: "item-1",
        workspaceId: "workspace-1",
        status: "leased",
        leasedUntil: new Date("2026-08-12T06:01:00Z"),
        createdAt: new Date("2026-08-12T05:00:00Z"),
      },
      {
        id: "item-2",
        workspaceId: "workspace-1",
        status: "queued",
        leasedUntil: null,
        createdAt: new Date("2026-08-12T05:01:00Z"),
      },
    ],
  });

  assert.equal(lease.claimed.id, "item-2");
  assert.equal(lease.claimed.status, "leased");
  assert.equal(lease.claimed.workerId, "worker-1");
  assert.equal(lease.claimed.leasedUntil.toISOString(), "2026-08-12T06:05:00.000Z");
  assert.deepEqual(lease.unclaimed.map((item) => item.id), ["item-1"]);
});

