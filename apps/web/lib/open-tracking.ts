import { createHmac, timingSafeEqual } from "node:crypto";

type SignatureInput = {
  workspaceId: string;
  messageId: string;
  signature: string;
  hmacKey: Buffer;
};

const pixel = Buffer.from("R0lGODlhAQABAPAAAP///wAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==", "base64");

export function isValidOpenSignature({ workspaceId, messageId, signature, hmacKey }: SignatureInput) {
  const expected = createHmac("sha256", hmacKey).update(`${workspaceId}:${messageId}`).digest("base64url");
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

export function openPixel() {
  return new Response(pixel, {
    headers: {
      "content-type": "image/gif",
      "cache-control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    },
  });
}
