/** Ad / tracker filters — keep lists in sync with shared/ad-domains.json and shared/ad-allow-domains.json */
export const BLOCKED_DOMAINS = [
  "hesads.akamaized.net",
  "doubleclick.net",
  "googlesyndication.com",
  "googleadservices.com",
  "googletagmanager.com",
  "google-analytics.com",
  "googleads.g.doubleclick.net",
  "pagead2.googlesyndication.com",
  "adservice.google.com",
  "facebook.net",
  "connect.facebook.net",
  "scorecardresearch.com",
  "taboola.com",
  "outbrain.com",
  "moatads.com",
  "adsafeprotected.com",
  "pubmatic.com",
  "rubiconproject.com",
  "criteo.com",
  "criteo.net",
  "smartadserver.com",
  "adnxs.com",
  "adsrvr.org",
  "3lift.com",
  "hotstarads.com",
  "shifu.hotstar.com",
];

export const ALLOWED_CDN_DOMAINS = [
  "githubassets.com",
  "githubusercontent.com",
  "gstatic.com",
  "googleusercontent.com",
  "cloudflare.com",
  "cloudfront.net",
  "fastly.net",
  "jsdelivr.net",
  "unpkg.com",
  "cdnjs.cloudflare.com",
];

function hostMatchesSuffix(hostname, suffix) {
  return hostname === suffix || hostname.endsWith(`.${suffix}`);
}

export function isAllowedHost(hostname) {
  const h = String(hostname ?? "").toLowerCase();
  if (!h) return false;
  return ALLOWED_CDN_DOMAINS.some((d) => hostMatchesSuffix(h, d));
}

export function isBlockedHost(hostname) {
  const h = String(hostname ?? "").toLowerCase();
  if (!h || isAllowedHost(h)) return false;
  return BLOCKED_DOMAINS.some((d) => hostMatchesSuffix(h, d));
}

export function isBlockedUrl(url) {
  try {
    const u = new URL(url);
    if (isAllowedHost(u.hostname)) return false;
    return isBlockedHost(u.hostname);
  } catch {
    return false;
  }
}

const api = { BLOCKED_DOMAINS, ALLOWED_CDN_DOMAINS, isAllowedHost, isBlockedHost, isBlockedUrl };
if (typeof globalThis !== "undefined") {
  globalThis.__PHONE_RELAY_AD_FILTERS__ = api;
}
