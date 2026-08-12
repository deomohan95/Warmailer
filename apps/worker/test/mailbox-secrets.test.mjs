import test from "node:test";
import assert from "node:assert/strict";

import { decryptSecret, encryptSecret } from "../src/mailbox-secrets.mjs";

test("round-trips a mailbox secret with AES-256-GCM", () => {
  const key = Buffer.alloc(32, 3);
  const encrypted = encryptSecret("zoho-app-password", key, "mailbox-123");

  assert.notEqual(encrypted.ciphertext, "zoho-app-password");
  assert.equal(encrypted.algorithm, "aes-256-gcm");
  assert.equal(decryptSecret(encrypted, key, "mailbox-123"), "zoho-app-password");
});

test("rejects decryption with the wrong key", () => {
  const encrypted = encryptSecret("zoho-app-password", Buffer.alloc(32, 3), "mailbox-123");

  assert.throws(
    () => decryptSecret(encrypted, Buffer.alloc(32, 4), "mailbox-123"),
    /Unable to decrypt mailbox secret/,
  );
});

test("binds encrypted secrets to their mailbox identifier", () => {
  const key = Buffer.alloc(32, 3);
  const encrypted = encryptSecret("zoho-app-password", key, "mailbox-123");

  assert.throws(() => decryptSecret(encrypted, key, "mailbox-456"), /Unable to decrypt mailbox secret/);
});
