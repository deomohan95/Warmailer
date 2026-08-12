export function installGracefulShutdown({
  process = globalThis.process,
  signals = ["SIGTERM", "SIGINT"],
  logger,
  shutdown,
} = {}) {
  if (!process || typeof process.once !== "function") {
    throw new Error("A process-like object with once() is required");
  }

  if (typeof shutdown !== "function") {
    throw new Error("shutdown callback is required");
  }

  let shuttingDown = false;

  async function handleSignal(signal) {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;

    try {
      logger?.info?.({ signal }, "worker shutdown started");
      await shutdown(signal);
      process.exitCode = 0;
      logger?.info?.({ signal }, "worker shutdown completed");
    } catch {
      process.exitCode = 1;
      logger?.error?.({ signal, error: "[REDACTED]" }, "worker shutdown failed");
    }
  }

  for (const signal of signals) {
    process.once(signal, handleSignal);
  }

  return { handleSignal };
}
