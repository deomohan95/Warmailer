import test from "node:test";
import assert from "node:assert/strict";

import { redactSecrets } from "../src/redaction.mjs";

test("redacts secret fields recursively without mutating the input", () => {
  const input = {
    mailbox: { email: "sender@example.com", appPassword: "mail-secret" },
    authorization: "Bearer token-secret",
    nested: [{ databaseUrl: "postgresql://secret" }],
  };

  const output = redactSecrets(input);

  assert.deepEqual(output, {
    mailbox: { email: "sender@example.com", appPassword: "[REDACTED]" },
    authorization: "[REDACTED]",
    nested: [{ databaseUrl: "[REDACTED]" }],
  });
  assert.equal(input.mailbox.appPassword, "mail-secret");
});

test("redacts common secret spellings case-insensitively", () => {
  assert.deepEqual(
    redactSecrets({ password: "a", access_token: "b", apiKey: "c", SMTP_PASSWORD: "d" }),
    { password: "[REDACTED]", access_token: "[REDACTED]", apiKey: "[REDACTED]", SMTP_PASSWORD: "[REDACTED]" },
  );
});
