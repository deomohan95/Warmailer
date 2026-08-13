import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "../app/api/track/open/route";
import { isValidOpenSignature, openPixel } from "../lib/open-tracking";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("open tracking", () => {
  it("validates the worker signature format", () => {
    expect(
      isValidOpenSignature({
        workspaceId: "workspace-1",
        messageId: "message-1",
        signature: "rs_gcrmZkaQfNIC3_CjTfoXlLjolrrt6UQRT0FH0gwo",
        hmacKey: Buffer.alloc(32, 7),
      }),
    ).toBe(true);

    expect(
      isValidOpenSignature({
        workspaceId: "workspace-1",
        messageId: "message-2",
        signature: "rs_gcrmZkaQfNIC3_CjTfoXlLjolrrt6UQRT0FH0gwo",
        hmacKey: Buffer.alloc(32, 7),
      }),
    ).toBe(false);
  });

  it("returns a tiny gif pixel", () => {
    expect(openPixel().headers.get("content-type")).toBe("image/gif");
    expect(openPixel().headers.get("cache-control")).toContain("no-store");
  });

  it("records a signed open and still returns the pixel", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
    vi.stubEnv("TRACKING_HMAC_KEY", Buffer.alloc(32, 7).toString("base64"));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 201 })));

    const response = await GET(
      new Request(
        "https://warmailer-app.vercel.app/api/track/open?w=workspace-1&m=message-1&s=rs_gcrmZkaQfNIC3_CjTfoXlLjolrrt6UQRT0FH0gwo",
        { headers: { "user-agent": "mail-client", "x-forwarded-for": "203.0.113.10, 10.0.0.1" } },
      ),
    );

    expect(response.headers.get("content-type")).toBe("image/gif");
    expect(fetch).toHaveBeenCalledWith(
      "https://project.supabase.co/rest/v1/message_events",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"event_type":"open"'),
      }),
    );
  });
});
