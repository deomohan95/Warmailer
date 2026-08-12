import test from "node:test";
import assert from "node:assert/strict";

import { classifyMailConnectionError, resolveZohoHosts, testZohoConnectivity } from "../src/zoho-connectivity.mjs";

test("resolves Zoho SMTP and IMAP hosts by region with explicit override support", () => {
  assert.deepEqual(resolveZohoHosts({ region: "us" }), {
    smtpHost: "smtp.zoho.com",
    imapHost: "imap.zoho.com",
    smtpPort: 465,
    imapPort: 993,
  });

  assert.deepEqual(resolveZohoHosts({ region: "eu" }), {
    smtpHost: "smtp.zoho.eu",
    imapHost: "imap.zoho.eu",
    smtpPort: 465,
    imapPort: 993,
  });

  assert.deepEqual(resolveZohoHosts({ smtpHost: "smtp.local.test", imapHost: "imap.local.test" }), {
    smtpHost: "smtp.local.test",
    imapHost: "imap.local.test",
    smtpPort: 465,
    imapPort: 993,
  });
});

test("checks SMTP and IMAP connectivity through injected probes without sending mail", async () => {
  const attempts = [];

  const result = await testZohoConnectivity({
    mailbox: {
      email: "sender@example.com",
      appPassword: "zoho-app-password",
      region: "in",
    },
    smtpProbe: async (settings) => {
      attempts.push({ protocol: "smtp", settings });
      return { ok: true };
    },
    imapProbe: async (settings) => {
      attempts.push({ protocol: "imap", settings });
      return { ok: true };
    },
  });

  assert.deepEqual(result, { ok: true, smtp: { ok: true }, imap: { ok: true } });
  assert.equal(attempts.length, 2);
  assert.equal(attempts[0].settings.host, "smtp.zoho.in");
  assert.equal(attempts[1].settings.host, "imap.zoho.in");
  assert.equal("send" in attempts[0].settings, false);
  assert.equal("message" in attempts[0].settings, false);
});

test("classifies common mail connection failures without leaking raw messages", () => {
  const cases = [
    [{ code: "EAUTH", message: "Invalid password zoho-app-password" }, "auth"],
    [{ code: "ENOTFOUND", message: "getaddrinfo ENOTFOUND smtp.zoho.com" }, "dns"],
    [{ code: "ETIMEDOUT", message: "timeout after password" }, "timeout"],
    [{ responseCode: 421, message: "try later token" }, "transient"],
    [{ responseCode: 454, message: "rate limited token" }, "rate_limit"],
    [{ responseCode: 550, message: "mailbox unavailable password" }, "permanent"],
  ];

  for (const [error, expectedKind] of cases) {
    const classified = classifyMailConnectionError(error);

    assert.equal(classified.kind, expectedKind);
    assert.equal(classified.retryable, ["dns", "timeout", "transient", "rate_limit"].includes(expectedKind));
    assert.equal(classified.message.includes("password"), false);
    assert.equal(classified.message.includes("token"), false);
    assert.equal(classified.message.includes("zoho-app-password"), false);
  }
});
