export type PhoneStatus =
  | "DISCONNECTED"
  | "CONNECTING"
  | "CONNECTED"
  | "ERROR";

export type ErrorCode =
  | "PHONE_OFFLINE"
  | "AUTHENTICATION_FAILED"
  | "DESTINATION_BLOCKED"
  | "DESTINATION_UNREACHABLE"
  | "REQUEST_TIMEOUT"
  | "RESPONSE_TOO_LARGE"
  | "EXTENSION_PROXY_OFF"
  | "BAD_REQUEST";

export type DeviceInfo = {
  deviceId: string;
  name: string;
  phoneIp: string | null;
  lastSeen: number | null;
  status: PhoneStatus;
};

export const SENSITIVE_HEADERS = [
  "authorization",
  "cookie",
  "set-cookie",
  "proxy-authorization",
  "x-api-key",
  "x-auth-token",
] as const;
