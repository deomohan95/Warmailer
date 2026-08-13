import { envValue, requireSupabaseConfig } from "../../../../lib/backend-data";
import { isValidOpenSignature, openPixel } from "../../../../lib/open-tracking";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const workspaceId = url.searchParams.get("w") ?? "";
  const messageId = url.searchParams.get("m") ?? "";
  const signature = url.searchParams.get("s") ?? "";
  const hmacKey = Buffer.from(envValue("TRACKING_HMAC_KEY") ?? "", "base64");

  if (workspaceId && messageId && signature && hmacKey.length === 32) {
    const valid = isValidOpenSignature({ workspaceId, messageId, signature, hmacKey });
    if (valid) await recordOpen({ workspaceId, messageId, request }).catch(() => {});
  }

  return openPixel();
}

async function recordOpen({ workspaceId, messageId, request }: { workspaceId: string; messageId: string; request: Request }) {
  const { url, key } = requireSupabaseConfig();
  const response = await fetch(`${url}/rest/v1/message_events`, {
    method: "POST",
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      prefer: "return=minimal",
    },
    body: JSON.stringify({
      workspace_id: workspaceId,
      message_id: messageId,
      event_type: "open",
      source: "system",
      provider_event_id: `open:${messageId}`,
      occurred_at: new Date().toISOString(),
      metadata: {
        userAgent: request.headers.get("user-agent"),
        ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      },
    }),
  });

  if (!response.ok && response.status !== 409) throw new Error(`Open tracking failed: ${response.status}`);
}
