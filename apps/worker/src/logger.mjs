import { redactSecrets } from "./redaction.mjs";

const levels = ["debug", "info", "warn", "error"];

export function createWorkerLogger({ write = console.log } = {}) {
  return Object.fromEntries(levels.map((level) => [level, logAtLevel(level, write)]));
}

function logAtLevel(level, write) {
  return (context, message) => {
    const entry = {
      level,
      message,
      ...redactSecrets(context ?? {}),
    };

    write(entry);
  };
}
