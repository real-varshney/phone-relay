import type { RelaySite } from "./leaked-asset.ts";

type Entry = { site: RelaySite; at: number };

const TTL_MS = 10 * 60 * 1000;
const byClient = new Map<string, Entry>();

export function isMediaCdnHost(hostname: string): boolean {
  if (hostname === "www.hotstar.com" || hostname === "apix.hotstar.com") return false;
  if (/^hses\d+/i.test(hostname)) return true;
  if (hostname.includes("disneyplus.com") || hostname.includes("akamaized.net")) return true;
  if (hostname.endsWith(".cdn.hotstar.com")) return true;
  return hostname.endsWith(".hotstar.com");
}

/** Video/audio segment CDNs only (not img.hotstar.com, secure-media, hesads, etc.). */
export function isStreamingMediaCdnHost(hostname: string): boolean {
  if (/^hesads\./i.test(hostname)) return false;
  if (/^hses\d+/i.test(hostname)) return true;
  if (hostname.includes("disneyplus.com")) return true;
  if (hostname.endsWith(".cdn.hotstar.com")) return true;
  if (/\.akamaized\.net$/i.test(hostname) && /^hses/i.test(hostname)) return true;
  return false;
}

type ManifestEntry = { url: string; at: number };

const manifestByClient = new Map<string, ManifestEntry>();

/** Remember signed manifest URL (hdnea) for CDN segment Referer auth. */
export function noteManifestUrl(clientKey: string, targetUrl: string): void {
  try {
    const u = new URL(targetUrl);
    if (!isStreamingMediaCdnHost(u.hostname)) return;
    const path = u.pathname.toLowerCase();
    if (!path.endsWith(".mpd") && !path.endsWith(".m3u8") && !path.includes("master")) return;
    manifestByClient.set(clientKey, { url: targetUrl, at: Date.now() });
  } catch {
    /* ignore */
  }
}

export function cachedManifestUrl(clientKey: string): string | null {
  const entry = manifestByClient.get(clientKey);
  if (!entry || Date.now() - entry.at > TTL_MS) return null;
  return entry.url;
}

/** Remember which CDN served the latest manifest/segment for this browser tab (by loopback client). */
export function noteMediaCdnHost(clientKey: string, targetUrl: string): void {
  try {
    const u = new URL(targetUrl);
    if (!isStreamingMediaCdnHost(u.hostname)) return;
    byClient.set(clientKey, {
      site: { scheme: u.protocol.replace(":", ""), host: u.hostname },
      at: Date.now(),
    });
  } catch {
    /* ignore */
  }
}

export function cachedMediaCdnSite(clientKey: string): RelaySite | null {
  const entry = byClient.get(clientKey);
  if (!entry || Date.now() - entry.at > TTL_MS) return null;
  return entry.site;
}

export function leakedVideoPathWithCdn(pathname: string, search: string, site: RelaySite): string {
  return `/proxy/${site.scheme}/${site.host}${pathname}${search}`;
}

export function parseRelayCdnCookie(cookieHeader: string | undefined): RelaySite | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/(?:^|;\s*)relay-cdn-host=([^;]+)/i);
  if (!match) return null;
  const host = decodeURIComponent(match[1].trim());
  if (!isStreamingMediaCdnHost(host)) return null;
  return { scheme: "https", host };
}

/** @internal test helper */
export function clearMediaCdnCache(): void {
  byClient.clear();
  manifestByClient.clear();
}
