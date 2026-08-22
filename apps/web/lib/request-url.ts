type RequestWithHeaders = {
  headers: Headers;
  url: string;
};

function firstHeaderValue(value: string | null): string | undefined {
  return value
    ?.split(",")
    .map((part) => part.trim())
    .find(Boolean);
}

function forwardedProtocol(request: RequestWithHeaders): "http" | "https" | undefined {
  const protocol = firstHeaderValue(request.headers.get("x-forwarded-proto"))?.replace(/:$/, "");
  return protocol === "http" || protocol === "https" ? protocol : undefined;
}

export function publicRequestUrl(path: string, request: RequestWithHeaders): URL {
  const fallback = new URL(request.url);
  const host =
    firstHeaderValue(request.headers.get("x-forwarded-host")) ??
    firstHeaderValue(request.headers.get("host")) ??
    fallback.host;
  const protocol = forwardedProtocol(request) ?? fallback.protocol.replace(/:$/, "");

  return new URL(path, `${protocol}://${host}`);
}

export function isPublicHttpsRequest(request: RequestWithHeaders): boolean {
  return (forwardedProtocol(request) ?? new URL(request.url).protocol.replace(/:$/, "")) === "https";
}
