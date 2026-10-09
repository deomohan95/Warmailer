import { after } from "next/server";

import { processQueuedEnrichment } from "../../../../worker/src/enrichment-worker.mjs";

type EnrichmentRunner = () => Promise<unknown>;
type EnrichmentScheduler = (task: () => Promise<unknown>) => void;

export function triggerImmediateEnrichment(run: EnrichmentRunner = processQueuedEnrichment, schedule: EnrichmentScheduler = after) {
  schedule(async () => {
    try {
      await run();
    } catch (error) {
      console.error("Immediate enrichment failed", error);
    }
  });
}

export function enrichmentLeadLookupPaths(workspaceId: string, leadIds: string[], chunkSize = 100) {
  return chunked(leadIds, chunkSize).map(
    (ids) =>
      `all_leads_mmp?workspace_id=eq.${workspaceId}&id=in.(${ids.map(encodeURIComponent).join(",")})&select=id,email,email_status,linkedin_url_normalized`,
  );
}

function chunked<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}
