import { describe, expect, it, vi } from "vitest";

import { enrichmentLeadLookupPaths, triggerImmediateEnrichment } from "../app/api/enrichment-batches/route";
import { verificationCandidates } from "../app/api/email-verification/route";

describe("enrichment batches", () => {
  it("schedules the enrichment worker immediately", async () => {
    const tasks: Array<() => Promise<unknown>> = [];
    const run = vi.fn().mockResolvedValue({ processed: 5 });

    triggerImmediateEnrichment(run, (task) => tasks.push(task));

    expect(tasks).toHaveLength(1);
    await tasks[0]!();
    expect(run).toHaveBeenCalledOnce();
  });

  it("chunks large find-email selections so Supabase URLs stay below Node header limits", () => {
    const leadIds = Array.from({ length: 500 }, (_, index) => `00000000-0000-4000-8000-${index.toString().padStart(12, "0")}`);
    const paths = enrichmentLeadLookupPaths("workspace_1", leadIds);

    expect(paths.length).toBeGreaterThan(1);
    expect(paths.flatMap((path) => path.match(/00000000-0000-4000-8000-\d{12}/g) ?? [])).toEqual(leadIds);
    expect(Math.max(...paths.map((path) => path.length))).toBeLessThan(8000);
  });
});

describe("email verification", () => {
  it("only verifies selected found leads with emails", () => {
    expect(
      verificationCandidates([
        { id: "found", email: "a@example.com", email_status: "found" },
        { id: "missing", email: null, email_status: "found" },
        { id: "verified", email: "b@example.com", email_status: "verified" },
        { id: "queued", email: "c@example.com", email_status: "queued" },
      ]).map((lead) => lead.id),
    ).toEqual(["found"]);
  });
});
