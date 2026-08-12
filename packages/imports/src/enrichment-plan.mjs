export function planEnrichmentBatch({ workspaceId, selection, leads, inFlightLeadIds, filters = {} }) {
  const selected = selectLeads(selection, leads, filters);
  const excluded = new Set(selection.excludedLeadIds ?? []);
  const items = [];
  const skipped = [];

  for (const lead of selected) {
    if (excluded.has(lead.id)) {
      skipped.push({ leadId: lead.id, reason: "excluded" });
      continue;
    }
    if (lead.workspaceId !== workspaceId) {
      skipped.push({ leadId: lead.id, reason: "wrong_workspace" });
      continue;
    }
    if (lead.email || lead.emailStatus === "found") {
      skipped.push({ leadId: lead.id, reason: "existing_email" });
      continue;
    }
    if (inFlightLeadIds.has(lead.id) || ["queued", "processing"].includes(lead.emailStatus)) {
      skipped.push({ leadId: lead.id, reason: "in_flight" });
      continue;
    }
    if (!lead.linkedinUrlNormalized) {
      skipped.push({ leadId: lead.id, reason: "missing_linkedin" });
      continue;
    }

    items.push({
      leadId: lead.id,
      workspaceId,
      linkedinUrlNormalized: lead.linkedinUrlNormalized,
    });
  }

  return { items, skipped };
}

export function claimNextEnrichmentItem({ now, leaseMs, workerId, items }) {
  const candidates = items
    .filter((item) => item.status === "queued" || isExpiredLease(item, now))
    .sort((left, right) => left.createdAt - right.createdAt);

  const next = candidates[0] ?? null;
  if (!next) return { claimed: null, unclaimed: items };

  const claimed = {
    ...next,
    status: "leased",
    workerId,
    leasedUntil: new Date(now.getTime() + leaseMs),
  };

  return {
    claimed,
    unclaimed: items.filter((item) => item.id !== next.id),
  };
}

function selectLeads(selection, leads, filters) {
  if ("leadIds" in selection) {
    const selectedIds = new Set(selection.leadIds);
    return leads.filter((lead) => selectedIds.has(lead.id));
  }

  const predicate = filters[selection.filterToken];
  if (!predicate) {
    throw new Error(`Unknown lead filter token: ${selection.filterToken}`);
  }

  return leads.filter(predicate);
}

function isExpiredLease(item, now) {
  return item.status === "leased" && item.leasedUntil && item.leasedUntil <= now;
}

