import blockDomains from "../../../../shared/ad-domains.json" with { type: "json" };
import allowDomains from "../../../../shared/ad-allow-domains.json" with { type: "json" };

const BLOCKED = new Set(blockDomains.map((d) => d.toLowerCase()));
const ALLOWED = new Set(allowDomains.map((d) => d.toLowerCase()));

function hostMatchesSuffix(hostname: string, suffix: string): boolean {
  return hostname === suffix || hostname.endsWith(`.${suffix}`);
}

export function isAdAllowedHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  for (const d of ALLOWED) {
    if (hostMatchesSuffix(h, d)) return true;
  }
  return false;
}

export function isAdBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (!h || isAdAllowedHost(h)) return false;
  for (const d of BLOCKED) {
    if (hostMatchesSuffix(h, d)) return true;
  }
  return false;
}

export function isAdBlockedUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (isAdAllowedHost(u.hostname)) return false;
    return isAdBlockedHost(u.hostname);
  } catch {
    return false;
  }
}
