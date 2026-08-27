/** Keep in sync with packages/protocol/src/relay-api.ts */
export const RELAY_API_TAG = "pr7k9m2";
export const RELAY_API_PREFIX = `/api/${RELAY_API_TAG}`;

export function isRelayDashboardApi(pathname) {
  return pathname === RELAY_API_PREFIX || pathname.startsWith(`${RELAY_API_PREFIX}/`);
}

export function relayApiPath(subpath) {
  return `${RELAY_API_PREFIX}/${subpath.replace(/^\//, "")}`;
}
