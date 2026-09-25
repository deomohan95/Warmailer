import { describe, expect, it, vi } from "vitest";

import { triggerImmediateEnrichment } from "../app/api/enrichment-batches/route";
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
