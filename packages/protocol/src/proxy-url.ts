import { isRelayDashboardApi } from "./relay-api.ts";

export const BACKEND_ORIGIN = "http://127.0.0.1:3000";
export const PROXY_PATH = "/proxy";
export const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "backend.lcl"]);

/** Dashboard, portal, proxy entry, and other local-only paths — never map to the proxied site. */
export function isRelayControlPath(pathname: string): boolean {
  const p = pathname.split("?")[0]?.split("#")[0] ?? pathname;
  return (
    p === "/" ||
    p === "/health" ||
    p.startsWith("/portal") ||
    p.startsWith("/phone") ||
    p.startsWith(PROXY_PATH) ||
    isRelayDashboardApi(p) ||
    p.endsWith("/relay-inject.js") ||
    p.endsWith("/ad-filters.js")
  );
}

export function isLocalBackendUrl(raw: string): boolean {
  try {
    const u = new URL(raw, BACKEND_ORIGIN);
    return LOCAL_HOSTS.has(u.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function encodeRelayUrl(target: string): string {
  if (isLocalBackendUrl(target) && new URL(target, BACKEND_ORIGIN).pathname.startsWith(PROXY_PATH)) {
    return target;
  }
  const abs = new URL(target).toString();
  return `${BACKEND_ORIGIN}${PROXY_PATH}?curl=${encodeURIComponent(abs)}`;
}

export function decodeRelayTarget(requestUrl: string): string | null {
  let u: URL;
  try {
    u = new URL(requestUrl, BACKEND_ORIGIN);
  } catch {
    return null;
  }
  if (!u.pathname.startsWith(PROXY_PATH)) return null;

  const curl = u.searchParams.get("curl");
  if (curl) {
    try {
      return new URL(curl).toString();
    } catch {
      return null;
    }
  }

  const rest = u.pathname.slice(PROXY_PATH.length).replace(/^\//, "");
  if (!rest) return null;
  const slash = rest.indexOf("/");
  if (slash === -1) return null;
  const scheme = rest.slice(0, slash);
  const hostAndPath = rest.slice(slash + 1);
  if (scheme !== "http" && scheme !== "https") return null;
  if (!hostAndPath) return null;
  try {
    const rebuilt = new URL(`${scheme}://${hostAndPath}`);
    rebuilt.search = u.search;
    return rebuilt.toString();
  } catch {
    return null;
  }
}

export function normalizeRelayTarget(target: string): string {
  try {
    const u = new URL(target);
    if (u.hostname === "www.hotstar.com" && (u.pathname === "/" || u.pathname === "")) {
      u.pathname = "/in";
      return u.toString();
    }
  } catch {
    /* ignore */
  }
  return target;
}

export function toPathProxyUrl(target: string, origin = BACKEND_ORIGIN): string {
  const normalized = normalizeRelayTarget(target);
  const u = new URL(normalized);
  const path = u.pathname === "/" ? "" : u.pathname;
  const q = u.search;
  return `${origin}${PROXY_PATH}/${u.protocol.replace(":", "")}/${u.host}${path}${q}`;
}

export type RelayRequestMessage = {
  type: "relay_request";
  requestId: string;
  method: string;
  url: string;
  headers: Record<string, string>;
  bodyBase64: string | null;
  timeoutMs: number;
};

export type RelayResponseMessage = {
  type: "relay_response";
  requestId: string;
  status: number | null;
  headers: Record<string, string>;
  bodyBase64: string | null;
  error: { code: string; message: string } | null;
  durationMs: number;
};

export type PhoneHelloMessage = {
  type: "hello";
  code?: string;
  token?: string;
  name?: string;
};

export type HelloOkMessage = {
  type: "hello_ok";
  deviceId: string;
  sessionToken: string;
  laptopLanIp: string;
};

export type PhoneControlMessage =
  | PhoneHelloMessage
  | { type: "heartbeat" }
  | RelayResponseMessage
  | { type: "error"; code: string; message: string };

export type LaptopControlMessage =
  | HelloOkMessage
  | { type: "revoke" }
  | { type: "heartbeat_ok" }
  | RelayRequestMessage
  | { type: "error"; code: string; message: string };
