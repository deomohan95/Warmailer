import test from "node:test";
import assert from "node:assert/strict";

import { installGracefulShutdown } from "../src/shutdown.mjs";

test("runs shutdown cleanup once when repeated signals arrive", async () => {
  const processLike = createProcessDouble();
  const entries = [];
  let cleanupCalls = 0;

  installGracefulShutdown({
    process: processLike,
    signals: ["SIGTERM"],
    logger: { info: (context, message) => entries.push({ level: "info", context, message }) },
    shutdown: async () => {
      cleanupCalls += 1;
    },
  });

  await processLike.emitSignal("SIGTERM");
  await processLike.emitSignal("SIGTERM");

  assert.equal(cleanupCalls, 1);
  assert.equal(processLike.exitCode, 0);
  assert.deepEqual(entries, [
    { level: "info", context: { signal: "SIGTERM" }, message: "worker shutdown started" },
    { level: "info", context: { signal: "SIGTERM" }, message: "worker shutdown completed" },
  ]);
});

test("marks shutdown as failed when cleanup rejects without leaking secrets", async () => {
  const processLike = createProcessDouble();
  const entries = [];

  installGracefulShutdown({
    process: processLike,
    signals: ["SIGTERM"],
    logger: { error: (context, message) => entries.push({ level: "error", context, message }) },
    shutdown: async () => {
      throw new Error("smtp password leaked");
    },
  });

  await processLike.emitSignal("SIGTERM");

  assert.equal(processLike.exitCode, 1);
  assert.deepEqual(entries, [
    {
      level: "error",
      context: { signal: "SIGTERM", error: "[REDACTED]" },
      message: "worker shutdown failed",
    },
  ]);
});

function createProcessDouble() {
  const handlers = new Map();

  return {
    exitCode: undefined,
    once(signal, handler) {
      handlers.set(signal, handler);
    },
    async emitSignal(signal) {
      const handler = handlers.get(signal);

      if (handler) {
        await handler(signal);
      }
    },
  };
}
