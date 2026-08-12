const allowedNodeEnvs = new Set(["development", "test", "production"]);

function requireString(environment, key) {
  const value = environment[key];

  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${key} is required`);
  }

  return value;
}

function decodeBase64Key(environment, key) {
  const value = requireString(environment, key);
  const decoded = Buffer.from(value, "base64");

  if (decoded.length !== 32 || decoded.toString("base64") !== value) {
    throw new Error(`${key} must be base64-encoded 32 bytes`);
  }

  return decoded;
}

export function loadConfig(environment = process.env) {
  const nodeEnv = environment.NODE_ENV ?? "development";

  if (!allowedNodeEnvs.has(nodeEnv)) {
    throw new Error("NODE_ENV must be one of development, test, production");
  }

  return {
    nodeEnv,
    databaseUrl: requireString(environment, "WORKER_DATABASE_URL"),
    encryptionKey: decodeBase64Key(environment, "WORKER_ENCRYPTION_KEY"),
    trackingHmacKey: decodeBase64Key(environment, "TRACKING_HMAC_KEY"),
  };
}
