import type { IncomingMessage, ServerResponse } from "node:http";
import { decodeRelayTarget, RELAY_MAX_BODY_BYTES } from "@phone-relay/protocol";
import { inspectDestination } from "@phone-relay/validation";
import {
  isCssContentType,
  isHtmlContentType,
  isManifestContentType,
  isManifestPath,
  shouldRewriteManifest,
  isPlainTextBody,
  rewriteCssUrls,
  rewriteHtml,
  rewriteManifestUrls,
  rewriteRedirectLocation,
  restoreSiteUrlsFromProxy,
} from "./html-rewrite.ts";
import { incomingToRelay, outgoingFromRelay, rewriteHeadersForTarget } from "./headers.ts";
import { proxyRefererToSiteUrl, relaySiteSetCookies } from "./leaked-asset.ts";
import { isAdBlockedUrl } from "./ad-block.ts";
import { isStreamingMediaCdnHost, noteMediaCdnHost, noteManifestUrl, cachedManifestUrl } from "./cdn-host-cache.ts";
import { isLoopbackAddress } from "./lan.ts";
import type { EventLog } from "./log.ts";
import type { PhoneHub } from "./phone-hub.ts";

const MAX_BODY = RELAY_MAX_BODY_BYTES;

function headerMap(req: IncomingMessage): Record<string, string | string[] | undefined> {
  return req.headers;
}

async function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buf.length;
    if (size > limit) throw new Error("RESPONSE_TOO_LARGE");
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}

export type ProxyDeps = {
  hub: PhoneHub;
  log: EventLog;
  origin: string;
  allowPrivateLan: () => boolean;
  policyTestMode: boolean;
};

export function proxyCorsHeaders(req: IncomingMessage): Record<string, string> {
  const origin = req.headers.origin;
  const requested = req.headers["access-control-request-headers"];
  return {
    "access-control-allow-origin": typeof origin === "string" && origin ? origin : "*",
    "access-control-allow-methods": "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS",
    "access-control-allow-headers":
      typeof requested === "string" && requested
        ? requested
        : "content-type, authorization, x-requested-with, cookie, origin, referer, x-relay-page-origin, x-relay-page-referer",
    "access-control-expose-headers":
      "set-cookie, x-relay-via, x-relay-target, x-relay-set-cookie",
    "access-control-max-age": "86400",
  };
}

function respond(
  res: ServerResponse,
  status: number,
  headers: Record<string, string>,
  body: string | Buffer,
): void {
  res.writeHead(status, headers);
  res.end(body);
}

export async function handleProxy(
  req: IncomingMessage,
  res: ServerResponse,
  deps: ProxyDeps,
): Promise<void> {
  const cors = proxyCorsHeaders(req);

  if (req.method === "OPTIONS") {
    respond(res, 204, cors, "");
    return;
  }

  if (!isLoopbackAddress(req.socket.remoteAddress)) {
    respond(res, 403, { ...cors, "content-type": "application/json" }, JSON.stringify({ code: "BAD_REQUEST", message: "Proxy is loopback-only." }));
    return;
  }

  const host = req.headers.host ?? "127.0.0.1:3000";
  const full = `http://${host}${req.url ?? "/"}`;
  let target = decodeRelayTarget(full);
  if (!target) {
    respond(
      res,
      400,
      { ...cors, "content-type": "application/json" },
      JSON.stringify({
        code: "BAD_REQUEST",
        message: "Missing curl target. Use /proxy?curl=https://example.com",
      }),
    );
    return;
  }

  const policy = await inspectDestination(target, {
    allowPrivateLan: deps.allowPrivateLan() || deps.policyTestMode,
    allowLoopback: deps.policyTestMode,
  });
  if (!policy.ok) {
    await deps.log.append({ event: "block", host: new URL(target).hostname, code: policy.code });
    respond(
      res,
      403,
      { ...cors, "content-type": "application/json" },
      JSON.stringify({ code: policy.code, message: policy.message }),
    );
    return;
  }

  if (isAdBlockedUrl(policy.url.toString())) {
    await deps.log.append({ event: "adblock", host: policy.hostname, method: req.method });
    respond(res, 204, { ...cors, "x-relay-adblock": "1" }, "");
    return;
  }

  let body: Buffer;
  try {
    body = await readBody(req, MAX_BODY);
  } catch {
    respond(
      res,
      413,
      { ...cors, "content-type": "application/json" },
      JSON.stringify({
        code: "RESPONSE_TOO_LARGE",
        message: "Request exceeded the configured 50 MB limit.",
      }),
    );
    return;
  }

  if (body.length && body.toString("utf8").includes("/proxy/")) {
    body = Buffer.from(restoreSiteUrlsFromProxy(body.toString("utf8")), "utf8");
  }

  const clientKey = req.socket.remoteAddress ?? "local";
  const relayHeaders = incomingToRelay(headerMap(req));
  rewriteHeadersForTarget(relayHeaders, req, proxyRefererToSiteUrl, {
    targetHost: policy.hostname,
    method: req.method ?? "GET",
    cachedManifestUrl: cachedManifestUrl(clientKey) ?? undefined,
  });

  const hasRange = Boolean(relayHeaders.Range ?? relayHeaders.range);
  const timeoutHeader = Number(req.headers["x-relay-timeout"] ?? (hasRange ? 120000 : 30000));
  const timeoutMs = Number.isFinite(timeoutHeader) ? Math.min(Math.max(timeoutHeader, 5000), 180000) : 30000;

  const started = Date.now();
  const result = await deps.hub.relay({
    method: (req.method ?? "GET").toUpperCase(),
    url: policy.url.toString(),
    headers: relayHeaders,
    bodyBase64: body.length ? body.toString("base64") : null,
    timeoutMs,
  });

  const durationMs = Date.now() - started;
  const hostName = policy.hostname;
  if (result.error) {
    await deps.log.append({
      event: "error",
      host: hostName,
      method: req.method,
      code: result.error.code,
      durationMs,
      device: deps.hub.connected?.name,
    });
    const status =
      result.error.code === "PHONE_OFFLINE"
        ? 503
        : result.error.code === "REQUEST_TIMEOUT"
          ? 504
          : result.error.code === "DESTINATION_BLOCKED"
            ? 403
            : 502;
    respond(res, status, { ...cors, "content-type": "application/json" }, JSON.stringify(result.error));
    return;
  }

  const headers = outgoingFromRelay(result.headers ?? {});
  const status = result.status ?? 200;

  if (status >= 300 && status < 400) {
    const location = headers.location ?? headers.Location;
    if (typeof location === "string" && location) {
      headers.location = rewriteRedirectLocation(location, policy.url.toString(), deps.origin);
      delete headers.Location;
    }
  }

  let payload = result.bodyBase64 ? Buffer.from(result.bodyBase64, "base64") : Buffer.alloc(0);

  const contentType = headers["content-type"] ?? headers["Content-Type"];
  const ct = typeof contentType === "string" ? contentType : undefined;
  if (isPlainTextBody(payload)) {
    if (isHtmlContentType(ct)) {
      payload = Buffer.from(rewriteHtml(payload.toString("utf8"), policy.url.toString(), deps.origin), "utf8");
    } else if (isCssContentType(ct)) {
      payload = Buffer.from(rewriteCssUrls(payload.toString("utf8"), deps.origin), "utf8");
    } else if (shouldRewriteManifest(ct, policy.url.toString(), payload.toString("utf8"))) {
      const manifestText = rewriteManifestUrls(payload.toString("utf8"), deps.origin, policy.url.toString());
      payload = Buffer.from(manifestText, "utf8");
      if (result.status && result.status >= 200 && result.status < 400) {
        noteManifestUrl(clientKey, policy.url.toString());
      }
    } else if (ct?.includes("json") && payload.toString("utf8").includes("/proxy/")) {
      payload = Buffer.from(restoreSiteUrlsFromProxy(payload.toString("utf8")), "utf8");
    }
  }

  if (payload.length > MAX_BODY) {
    respond(
      res,
      413,
      { ...cors, "content-type": "application/json" },
      JSON.stringify({
        code: "RESPONSE_TOO_LARGE",
        message: "Response exceeded the configured 50 MB limit.",
      }),
    );
    return;
  }

  await deps.log.append({
    event: "open",
    host: hostName,
    method: req.method,
    status: result.status ?? 0,
    durationMs,
    device: deps.hub.connected?.name,
  });

  if (result.status && result.status >= 200 && result.status < 400) {
    noteMediaCdnHost(clientKey, policy.url.toString());
  }

  const outHeaders: Record<string, string | string[]> = {
    ...headers,
    ...cors,
    "x-relay-via": "phone",
    "x-relay-target": policy.url.toString(),
  };

  const relaySite = {
    scheme: policy.url.protocol.replace(":", ""),
    host: policy.hostname,
  };
  const relayCookies = relaySiteSetCookies(relaySite);
  const existingSetCookie = outHeaders["set-cookie"] ?? outHeaders["Set-Cookie"];
  if (existingSetCookie) {
    const prior = Array.isArray(existingSetCookie) ? existingSetCookie : [existingSetCookie];
    outHeaders["set-cookie"] = [...prior, ...relayCookies];
  } else {
    outHeaders["set-cookie"] = relayCookies;
  }
  delete outHeaders["Set-Cookie"];

  if (status >= 200 && status < 400 && isStreamingMediaCdnHost(hostName)) {
    const cdnCookie = `relay-cdn-host=${hostName}; Path=/; Max-Age=600; SameSite=Lax`;
    const current = outHeaders["set-cookie"];
    outHeaders["set-cookie"] = Array.isArray(current) ? [...current, cdnCookie] : [String(current), cdnCookie];
  }

  respond(res, status, outHeaders as Record<string, string>, payload);
}
