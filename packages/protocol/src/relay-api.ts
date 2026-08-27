/** Dashboard API segment — only paths under /api/{tag}/ are local backend routes. */
export const RELAY_API_TAG = "pr7k9m2";

export const RELAY_API_PREFIX = `/api/${RELAY_API_TAG}`;

export function relayApiPath(subpath: string): string {
  const clean = subpath.replace(/^\//, "");
  return `${RELAY_API_PREFIX}/${clean}`;
}

export function isRelayDashboardApi(pathname: string): boolean {
  return pathname === RELAY_API_PREFIX || pathname.startsWith(`${RELAY_API_PREFIX}/`);
}

/** Subpath after /api/{tag}/, e.g. "status" or "extension/hello". */
export function relayApiSubpath(pathname: string): string | null {
  if (!isRelayDashboardApi(pathname)) return null;
  if (pathname === RELAY_API_PREFIX) return "";
  return pathname.slice(RELAY_API_PREFIX.length + 1);
}
