export const PRIMARY_ACTOR_ID = "UMdANQyqx3b2JVuxg";
export const FALLBACK_ACTOR_ID = "q3wko0Sbx6ZAAB2xf";

export function primaryActorInput(linkedinUrlNormalized) {
  return {
    actorId: PRIMARY_ACTOR_ID,
    input: { linkedin: linkedinUrlNormalized },
  };
}

export function fallbackActorInput(items) {
  return {
    actorId: FALLBACK_ACTOR_ID,
    input: { linkedinUrls: items.map((item) => item.linkedinUrlNormalized) },
  };
}

export function nextEnrichmentState(result) {
  if (result.status === "succeeded" && result.email) {
    return { emailStatus: "found", action: "store_email", retry: false };
  }

  if (result.phase === "primary" && result.status === "succeeded" && !result.email) {
    return { emailStatus: "not_found", action: "queue_fallback", retry: false };
  }

  if (["timeout", "rate_limited", "transport_error"].includes(result.status)) {
    return {
      emailStatus: "failed",
      action: result.phase === "fallback" ? "retry_fallback" : "retry_primary",
      retry: true,
    };
  }

  return { emailStatus: "failed", action: "mark_terminal", retry: false };
}

export function planFallbackBatch(items, workspaceId) {
  return {
    workspaceId,
    items: items
      .filter((item) => item.workspaceId === workspaceId)
      .filter((item) => item.primaryResult === "not_found")
      .map((item) => ({
        leadId: item.leadId,
        linkedinUrlNormalized: item.linkedinUrlNormalized,
      })),
  };
}

