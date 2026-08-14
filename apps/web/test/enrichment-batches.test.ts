import { describe, expect, it, vi } from "vitest";

import { triggerImmediateEnrichment } from "../app/api/enrichment-batches/route";

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
