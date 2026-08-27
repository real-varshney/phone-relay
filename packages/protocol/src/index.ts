export {
  BACKEND_ORIGIN,
  PROXY_PATH,
  LOCAL_HOSTS,
  isLocalBackendUrl,
  isRelayControlPath,
  encodeRelayUrl,
  decodeRelayTarget,
  normalizeRelayTarget,
  toPathProxyUrl,
} from "./proxy-url.ts";
export {
  extractHotstarCmsFromRelativePath,
  extractHotstarCmsPath,
  hotstarCmsCdnUrl,
  remapHotstarCmsAssetUrl,
  rewriteHotstarCmsUrlsInText,
} from "./hotstar-cms.ts";
export {
  PROXY_RESOURCE_TYPE_IDS,
  PROXY_RESOURCE_TYPE_OPTIONS,
  DEFAULT_PROXY_RESOURCE_TYPES,
  normalizeProxyResourceTypes,
  isFullProxyMode,
  isStylesheetOnlyMode,
  parseProxyTypesCookie,
  proxySiteCookiePath,
} from "./proxy-resource-types.ts";
export type { ProxyResourceTypeId, ProxyResourceTypeOption } from "./proxy-resource-types.ts";
export {
  RELAY_API_TAG,
  RELAY_API_PREFIX,
  relayApiPath,
  isRelayDashboardApi,
  relayApiSubpath,
} from "./relay-api.ts";
export { RELAY_MAX_BODY_BYTES } from "./relay-limits.ts";
export type {
  RelayRequestMessage,
  RelayResponseMessage,
  PhoneHelloMessage,
  HelloOkMessage,
  PhoneControlMessage,
  LaptopControlMessage,
} from "./proxy-url.ts";
