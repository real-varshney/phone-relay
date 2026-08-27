import type { IncomingMessage } from "node:http";
import { isRelayControlPath } from "@phone-relay/protocol";

export type RelaySite = { scheme: string; host: string };

export function parseRelaySiteFromUrl(urlString: string): RelaySite | null {
  try {
    const u = new URL(urlString);
    const m = u.pathname.match(/^\/proxy\/(https?)\/([^/]+)/);
    if (m) return { scheme: m[1], host: m[2] };
  } catch {
    /* ignore */
  }
  return null;
}

/** Convert a path-proxy Referer/URL back to the real site URL. */
export function proxyRefererToSiteUrl(referer: string): string | null {
  try {
    const u = new URL(referer);
    const m = u.pathname.match(/^\/proxy\/(https?)\/([^/]+)(\/.*)?$/);
    if (!m) return null;
    const path = m[3] || "/";
    return `${m[1]}://${m[2]}${path}${u.search}${u.hash}`;
  } catch {
    return null;
  }
}

export function parseRelaySiteCookie(cookieHeader: string | undefined): RelaySite | null {
  if (!cookieHeader) return null;
  const hostMatch = cookieHeader.match(/(?:^|;\s*)relay-site=([^;]+)/i);
  if (!hostMatch) return null;
  const host = decodeURIComponent(hostMatch[1].trim());
  if (!host) return null;
  const schemeMatch = cookieHeader.match(/(?:^|;\s*)relay-scheme=([^;]+)/i);
  const scheme = schemeMatch ? decodeURIComponent(schemeMatch[1].trim()) : "https";
  if (scheme !== "http" && scheme !== "https") return null;
  return { scheme, host };
}

export function relaySiteSetCookies(site: RelaySite): string[] {
  return [
    `relay-site=${encodeURIComponent(site.host)}; Path=/; Max-Age=600; SameSite=Lax`,
    `relay-scheme=${encodeURIComponent(site.scheme)}; Path=/; Max-Age=600; SameSite=Lax`,
  ];
}

export function relaySiteFromHeaders(req: IncomingMessage): RelaySite | null {
  const ref = req.headers.referer ?? req.headers.origin;
  if (typeof ref === "string" && ref) {
    const fromUrl = parseRelaySiteFromUrl(ref);
    if (fromUrl) return fromUrl;
  }
  const cookie = typeof req.headers.cookie === "string" ? req.headers.cookie : undefined;
  return parseRelaySiteCookie(cookie);
}

/** Root-absolute Hotstar CDN media paths that miss /proxy on :3000. */
const LEAKED_CDN_ROOT = /^\/(?:video_|audio_)[^/]+\//i;

/** CDN segment paths must not be mapped to the page host (e.g. www.hotstar.com) via Referer. */
export function isLeakedMediaSegment(pathname: string): boolean {
  if (LEAKED_CDN_ROOT.test(pathname)) return true;
  if (/\.(m4s|mp4|m4v|aac|vtt)(\?|$)/i.test(pathname)) return true;
  // HLS .ts segments only — do not match Vite TypeScript modules (/src/*.ts?v=…)
  if (/\.ts(\?|$)/i.test(pathname) && /\/(seg|segment|video|media|stream|hls)/i.test(pathname)) return true;
  return false;
}

/** Definite leaked CDN segment — safe to 404 instead of falling through to the dashboard. */
export function isDefiniteLeakedMediaSegment(pathname: string): boolean {
  return LEAKED_CDN_ROOT.test(pathname) || /\.(m4s|mp4|m4v)(\?|$)/i.test(pathname);
}

/** GET leaked paths on :3000 without /proxy — proxied site assets/APIs, not dashboard. */
export function isLeakedSiteAsset(pathname: string): boolean {
  if (isRelayControlPath(pathname)) return false;
  if (pathname.startsWith("/@")) return false;
  if (pathname.startsWith("/node_modules/")) return false;
  if (pathname.startsWith("/src/")) return false;
  if (isLeakedMediaSegment(pathname)) return false;
  return true;
}

export function toPathProxyRequest(site: RelaySite, pathname: string, search: string): string {
  return `/proxy/${site.scheme}/${site.host}${pathname}${search}`;
}

/**
 * Recover CDN proxy path for media segments that hit 127.0.0.1:3000/… without /proxy
 * (root-absolute manifest URLs). Uses Referer when it points at a CDN manifest/segment.
 */
export function leakedMediaToProxyPath(
  referer: string | undefined,
  pathname: string,
  search: string,
): string | null {
  if (!referer) return null;
  const site = parseRelaySiteFromUrl(referer);
  if (!site) return null;

  const siteUrl = proxyRefererToSiteUrl(referer);
  if (!siteUrl) return null;

  try {
    const refUrl = new URL(siteUrl);
    if (
      site.host === "www.hotstar.com" &&
      !/\.(m3u8|mpd|m4s|mp4|ts|aac|m4v|vtt)(\?|$)/i.test(refUrl.pathname)
    ) {
      return null;
    }

    const target = pathname.startsWith("/")
      ? new URL(pathname, `${refUrl.protocol}//${refUrl.host}/`)
      : new URL(pathname, refUrl);
    return `/proxy/${site.scheme}/${site.host}${target.pathname}${target.search}`;
  } catch {
    return null;
  }
}

/** @deprecated alias — use isLeakedCdnRootPath */
export function isLeakedVideoCdnPath(pathname: string): boolean {
  return isLeakedCdnRootPath(pathname);
}

export function isLeakedCdnRootPath(pathname: string): boolean {
  return LEAKED_CDN_ROOT.test(pathname);
}
