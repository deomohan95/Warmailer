import test from "node:test";
import assert from "node:assert/strict";

import { createWorkerLogger } from "../src/logger.mjs";

test("writes structured log entries with sensitive payloads redacted", () => {
  const entries = [];
  const logger = createWorkerLogger({
    write(entry) {
      entries.push(entry);
    },
  });

  logger.info(
    {
      workspaceId: "workspace-123",
      body: { appPassword: "mail-secret" },
      headers: { authorization: "Bearer token-secret" },
    },
    "mailbox connection checked",
  );

  assert.deepEqual(entries, [
    {
      level: "info",
      message: "mailbox connection checked",
      workspaceId: "workspace-123",
      body: "[REDACTED]",
      headers: { authorization: "[REDACTED]" },
    },
  ]);
});
