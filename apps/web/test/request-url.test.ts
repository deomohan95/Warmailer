import { describe, expect, it } from "vitest";

import { publicRequestUrl } from "../lib/request-url";

describe("public request URLs", () => {
  it("builds redirects from forwarded public host headers", () => {
    const request = new Request("https://0.0.0.0:3000/api/auth/login", {
      headers: {
        host: "0.0.0.0:3000",
        "x-forwarded-host": "warmailer.srv1158975.hstgr.cloud",
        "x-forwarded-proto": "https",
      },
    });

    expect(publicRequestUrl("/login?error=1", request).toString()).toBe(
      "https://warmailer.srv1158975.hstgr.cloud/login?error=1",
    );
  });

  it("falls back to the request URL when forwarded headers are missing", () => {
    const request = new Request("http://127.0.0.1:3000/api/auth/login");

    expect(publicRequestUrl("/", request).toString()).toBe("http://127.0.0.1:3000/");
  });
});
