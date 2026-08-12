import test from "node:test";
import assert from "node:assert/strict";

import { loadConfig } from "../src/config.mjs";

const validEnvironment = {
  NODE_ENV: "test",
  WORKER_DATABASE_URL: "postgresql://worker:secret@localhost:5432/warmailer",
  WORKER_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
  TRACKING_HMAC_KEY: Buffer.alloc(32, 9).toString("base64"),
};

test("loads a valid worker configuration without performing external I/O", () => {
  const config = loadConfig(validEnvironment);

  assert.equal(config.nodeEnv, "test");
  assert.equal(config.databaseUrl, validEnvironment.WORKER_DATABASE_URL);
  assert.equal(config.encryptionKey.length, 32);
  assert.equal(config.trackingHmacKey.length, 32);
});

test("rejects a missing database URL", () => {
  const { WORKER_DATABASE_URL: _, ...environment } = validEnvironment;

  assert.throws(() => loadConfig(environment), /WORKER_DATABASE_URL is required/);
});

test("rejects encryption keys that are not exactly 32 bytes", () => {
  assert.throws(
    () => loadConfig({ ...validEnvironment, WORKER_ENCRYPTION_KEY: Buffer.alloc(31).toString("base64") }),
    /WORKER_ENCRYPTION_KEY must be base64-encoded 32 bytes/,
  );
});

test("rejects unsupported runtime environments", () => {
  assert.throws(
    () => loadConfig({ ...validEnvironment, NODE_ENV: "staging" }),
    /NODE_ENV must be one of development, test, production/,
  );
});
