import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const algorithm = "aes-256-gcm";
const currentVersion = 1;
const nonceBytes = 12;
const authTagBytes = 16;

function assertKey(key) {
  if (!Buffer.isBuffer(key) || key.length !== 32) {
    throw new Error("Mailbox encryption key must be 32 bytes");
  }
}

function aadForMailbox(mailboxId) {
  if (typeof mailboxId !== "string" || mailboxId.trim() === "") {
    throw new Error("mailboxId is required");
  }

  return Buffer.from(`mailbox:${mailboxId}`, "utf8");
}

export function encryptSecret(secret, key, mailboxId) {
  if (typeof secret !== "string" || secret.length === 0) {
    throw new Error("Mailbox secret is required");
  }

  assertKey(key);

  const nonce = randomBytes(nonceBytes);
  const cipher = createCipheriv(algorithm, key, nonce, { authTagLength: authTagBytes });
  cipher.setAAD(aadForMailbox(mailboxId));

  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);

  return {
    version: currentVersion,
    algorithm,
    nonce: nonce.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

export function decryptSecret(encrypted, key, mailboxId) {
  assertKey(key);

  try {
    if (encrypted?.version !== currentVersion || encrypted?.algorithm !== algorithm) {
      throw new Error("Unsupported mailbox secret format");
    }

    const decipher = createDecipheriv(algorithm, key, Buffer.from(encrypted.nonce, "base64"), {
      authTagLength: authTagBytes,
    });
    decipher.setAAD(aadForMailbox(mailboxId));
    decipher.setAuthTag(Buffer.from(encrypted.authTag, "base64"));

    return Buffer.concat([
      decipher.update(Buffer.from(encrypted.ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error("Unable to decrypt mailbox secret");
  }
}
