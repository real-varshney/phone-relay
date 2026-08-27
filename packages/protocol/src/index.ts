export {
  BACKEND_ORIGIN,
  PROXY_PATH,
  LOCAL_HOSTS,
  isLocalBackendUrl,
  encodeRelayUrl,
  decodeRelayTarget,
  toPathProxyUrl,
} from "./proxy-url.ts";
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
