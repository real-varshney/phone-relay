import type { IncomingMessage } from "node:http";
import { isStreamingMediaCdnHost } from "./cdn-host-cache.ts";

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
]);

const DROP_FROM_BROWSER = new Set([
  "accept-encoding",
  "x-relay-page-origin",
  "x-relay-page-referer",
  "x-relay-manifest-referer",
]);

function shouldDropBrowserHeader(key: string): boolean {
  const lower = key.toLowerCase();
  if (DROP_FROM_BROWSER.has(lower)) return true;
  if (lower.startsWith("sec-fetch-")) return true;
  if (lower.startsWith("sec-ch-ua")) return true;
  return false;
}

const LOCAL_RELAY_HOSTS = new Set(["127.0.0.1", "localhost", "backend.lcl", "::1"]);

function headerValue(headers: Record<string, string>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const direct = headers[key];
    if (direct) return direct;
    const lower = headers[key.toLowerCase()];
    if (lower) return lower;
  }
  return undefined;
}

function isLocalRelayOrigin(origin: string): boolean {
  try {
    return LOCAL_RELAY_HOSTS.has(new URL(origin).hostname);
  } catch {
    return false;
  }
}

/** Strip relay-only headers and rewrite Origin/Referer for the phone fetch. */
export function rewriteHeadersForTarget(
  headers: Record<string, string>,
  req: IncomingMessage,
  proxyRefererToSiteUrl: (referer: string) => string | null,
  options?: { targetHost?: string; method?: string; cachedManifestUrl?: string },
): void {
  const xOrigin = headerValue(headers, "x-relay-page-origin", "X-Relay-Page-Origin");
  const xReferer = headerValue(headers, "x-relay-page-referer", "X-Relay-Page-Referer");
  const xManifestReferer = headerValue(headers, "x-relay-manifest-referer", "X-Relay-Manifest-Referer");
  delete headers["x-relay-page-origin"];
  delete headers["X-Relay-Page-Origin"];
  delete headers["x-relay-page-referer"];
  delete headers["X-Relay-Page-Referer"];
  delete headers["x-relay-manifest-referer"];
  delete headers["X-Relay-Manifest-Referer"];

  const rawReferer =
    xReferer ??
    headerValue(headers, "referer", "Referer") ??
    (typeof req.headers.referer === "string" ? req.headers.referer : undefined);

  let siteReferer: string | null = rawReferer ? proxyRefererToSiteUrl(rawReferer) : null;
  if (!siteReferer && xReferer && !proxyRefererToSiteUrl(xReferer)) {
    siteReferer = xReferer;
  }

  let siteOrigin: string | null = xOrigin ?? null;
  if (!siteOrigin && siteReferer) {
    try {
      siteOrigin = new URL(siteReferer).origin;
    } catch {
      /* ignore */
    }
  }

  const rawOrigin =
    headerValue(headers, "origin", "Origin") ??
    (typeof req.headers.origin === "string" ? req.headers.origin : undefined);
  if (!siteOrigin && rawOrigin && !isLocalRelayOrigin(rawOrigin)) {
    siteOrigin = rawOrigin;
  }

  if (siteOrigin) {
    headers.Origin = siteOrigin;
  }
  if (siteReferer) {
    headers.Referer = siteReferer;
  } else if (siteOrigin) {
    headers.Referer = `${siteOrigin}/`;
  }

  const method = (options?.method ?? req.method ?? "GET").toUpperCase();
  const targetHost = options?.targetHost ?? "";
  if (targetHost && isStreamingMediaCdnHost(targetHost) && (method === "GET" || method === "HEAD")) {
    delete headers.Origin;
    delete headers.origin;
    const manifestReferer = xManifestReferer ?? options?.cachedManifestUrl;
    if (manifestReferer) {
      headers.Referer = manifestReferer;
    }
  }
}

const DROP_TO_BROWSER = new Set([
  "content-encoding",
  "content-length",
  "transfer-encoding",
]);

export function incomingToRelay(
  headers: Record<string, string | string[] | undefined>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [rawKey, value] of Object.entries(headers)) {
    const key = rawKey.toLowerCase();
    if (HOP_BY_HOP.has(key) || shouldDropBrowserHeader(rawKey)) continue;
    if (value === undefined) continue;
    out[rawKey] = Array.isArray(value) ? value.join(", ") : value;
  }
  return out;
}

export function outgoingFromRelay(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  let setCookies: string[] = [];
  for (const [rawKey, value] of Object.entries(headers)) {
    const key = rawKey.toLowerCase();
    if (HOP_BY_HOP.has(key) || DROP_TO_BROWSER.has(key)) continue;
    if (key === "set-cookie") {
      setCookies.push(value);
      continue;
    }
    if (key === "x-relay-set-cookie") {
      out[rawKey] = value;
      continue;
    }
    out[rawKey] = value;
  }
  if (!out["x-relay-set-cookie"] && !out["X-Relay-Set-Cookie"] && setCookies.length > 0) {
    out["x-relay-set-cookie"] = JSON.stringify(setCookies);
  }
  return out;
}
