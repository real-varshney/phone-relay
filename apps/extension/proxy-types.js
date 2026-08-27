/** Keep in sync with packages/protocol/src/proxy-resource-types.ts */
export const PROXY_RESOURCE_TYPE_IDS = [
  "main_frame",
  "sub_frame",
  "stylesheet",
  "script",
  "image",
  "font",
  "media",
  "object",
  "xmlhttprequest",
  "ping",
  "other",
];

export const DEFAULT_PROXY_RESOURCE_TYPES = [...PROXY_RESOURCE_TYPE_IDS];

export function normalizeProxyResourceTypes(input) {
  if (!Array.isArray(input)) return [...DEFAULT_PROXY_RESOURCE_TYPES];
  const allowed = new Set(PROXY_RESOURCE_TYPE_IDS);
  const picked = input.filter((v) => typeof v === "string" && allowed.has(v));
  return picked.length > 0 ? picked : [...DEFAULT_PROXY_RESOURCE_TYPES];
}

export function isStylesheetOnlyMode(types) {
  return types.length === 1 && types[0] === "stylesheet";
}

export function proxySiteCookiePath(absUrl) {
  const u = new URL(absUrl);
  return `/proxy/${u.protocol.replace(":", "")}/${u.host}`;
}
