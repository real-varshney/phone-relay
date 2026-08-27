/** Chrome declarativeNetRequest resource types the extension can route through the phone. */
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
] as const;

export type ProxyResourceTypeId = (typeof PROXY_RESOURCE_TYPE_IDS)[number];

export type ProxyResourceTypeOption = {
  id: ProxyResourceTypeId;
  label: string;
  hint: string;
};

export const PROXY_RESOURCE_TYPE_OPTIONS: ProxyResourceTypeOption[] = [
  { id: "main_frame", label: "Main page", hint: "In-page navigations and redirects" },
  { id: "sub_frame", label: "Frames / iframes", hint: "Embedded frames" },
  { id: "stylesheet", label: "CSS", hint: "Stylesheets" },
  { id: "script", label: "JavaScript", hint: "Script files" },
  { id: "image", label: "Images", hint: "img, picture, icons" },
  { id: "font", label: "Fonts", hint: "Web fonts" },
  { id: "media", label: "Video / audio", hint: "Media files and streams" },
  { id: "object", label: "Object / embed", hint: "Legacy embeds" },
  { id: "xmlhttprequest", label: "Fetch / XHR", hint: "API calls and fetch()" },
  { id: "ping", label: "Pings / beacons", hint: "Analytics beacons" },
  { id: "other", label: "Other", hint: "Everything else" },
];

export const DEFAULT_PROXY_RESOURCE_TYPES: ProxyResourceTypeId[] = [...PROXY_RESOURCE_TYPE_IDS];

export function normalizeProxyResourceTypes(input: unknown): ProxyResourceTypeId[] {
  if (!Array.isArray(input)) return [...DEFAULT_PROXY_RESOURCE_TYPES];
  const allowed = new Set<string>(PROXY_RESOURCE_TYPE_IDS);
  const picked = input.filter((v): v is ProxyResourceTypeId => typeof v === "string" && allowed.has(v));
  return picked.length > 0 ? picked : [...DEFAULT_PROXY_RESOURCE_TYPES];
}

export function isFullProxyMode(types: ProxyResourceTypeId[]): boolean {
  const set = new Set(types);
  return PROXY_RESOURCE_TYPE_IDS.every((id) => set.has(id));
}

export function isStylesheetOnlyMode(types: ProxyResourceTypeId[]): boolean {
  return types.length === 1 && types[0] === "stylesheet";
}

export function proxySiteCookiePath(targetUrl: string): string {
  const u = new URL(targetUrl);
  return `/proxy/${u.protocol.replace(":", "")}/${u.host}`;
}

export function parseProxyTypesCookie(cookieHeader: string | undefined): ProxyResourceTypeId[] | undefined {
  if (!cookieHeader) return undefined;
  const match = cookieHeader.match(/(?:^|;\s*)relay-proxy-types=([^;]*)/);
  if (!match?.[1]) return undefined;
  const raw = match[1].trim();
  for (const decode of [(s: string) => decodeURIComponent(s), (s: string) => s]) {
    try {
      return normalizeProxyResourceTypes(JSON.parse(decode(raw)));
    } catch {
      /* try next */
    }
  }
  return undefined;
}
