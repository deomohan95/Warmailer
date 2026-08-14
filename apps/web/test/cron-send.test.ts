import { afterEach, describe, expect, it, vi } from "vitest";

import { GET, loadSendConfig } from "../app/api/cron/send/route";
import { triggerImmediateSend } from "../app/api/campaigns/route";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("cron send route", () => {
  it("requires a bearer cron secret", async () => {
    vi.stubEnv("CRON_SECRET", "cron-secret");

    const response = await GET(new Request("https://warmailer-app.vercel.app/api/cron/send"));

    expect(response.status).toBe(401);
  });

  it("requires tracking env before sending", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
    vi.stubEnv("WORKER_ENCRYPTION_KEY", Buffer.alloc(32, 1).toString("base64"));
    vi.stubEnv("TRACKING_HMAC_KEY", Buffer.alloc(32, 2).toString("base64"));

    expect(() =>
      loadSendConfig({
        NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "service-key",
        WORKER_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
        TRACKING_HMAC_KEY: Buffer.alloc(32, 2).toString("base64"),
      }),
    ).toThrow("Missing TRACKING_BASE_URL");
  });

  it("lets campaign launch trigger one immediate send", async () => {
    vi.stubEnv("CRON_SECRET", "cron-secret");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ sent: 1 }), { status: 200 })));

    await expect(triggerImmediateSend("https://warmailer-app.vercel.app")).resolves.toBeUndefined();

    expect(fetch).toHaveBeenCalledWith("https://warmailer-app.vercel.app/api/cron/send", {
      headers: { authorization: "Bearer cron-secret" },
    });
  });
});

describe("cron warmup route", () => {
  it("requires bearer cron secret for warmup", async () => {
    vi.stubEnv("CRON_SECRET", "cron-secret");
    const mod = await import("../app/api/cron/warmup/route");

    const response = await mod.GET(new Request("https://warmailer-app.vercel.app/api/cron/warmup"));

    expect(response.status).toBe(401);
  });

  it("loads warmup composio config without exposing it to the browser", async () => {
    vi.stubEnv("COMPOSIO_API_KEY", "composio-secret");
    const mod = await import("../app/api/cron/warmup/route");

    expect(mod.loadWarmupConfig().composioApiKey).toBe("composio-secret");
  });
});
