const redacted = "[REDACTED]";

const secretKeyPattern =
  /(?:password|passphrase|secret|token|api[_-]?key|authorization|auth|credential|database[_-]?url|smtp[_-]?password|imap[_-]?password|body|payload)/i;

export function redactSecrets(value) {
  return redactValue(value);
}

function redactValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item));
  }

  if (value === null || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      secretKeyPattern.test(key) ? redacted : redactValue(item),
    ]),
  );
}
