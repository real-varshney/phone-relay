import { isLocalBackendUrl } from "@phone-relay/protocol";

function pathProxyUrl(raw: string, origin: string): string {
  try {
    const u = new URL(raw);
    if (isLocalBackendUrl(u.toString())) return raw;
    const path = u.pathname === "/" ? "" : u.pathname;
    return `${origin}/proxy/${u.protocol.replace(":", "")}/${u.host}${path}${u.search}`;
  } catch {
    return raw;
  }
}

function proxyBaseHref(targetUrl: string, origin: string): string {
  const site = new URL(targetUrl);
  return `${origin}/proxy/${site.protocol.replace(":", "")}/${site.host}/`;
}

/**
 * Sync inline bootstrap: spoof location reads (site URL) and translate history writes
 * to same-origin proxy paths (document stays on 127.0.0.1:3000).
 */
export function locationSpoofScript(): string {
  return `<script>(function(){var PR=/^\\/proxy\\/(https?)\\/([^/]+)(\\/.*)?$/;var m=location.pathname.match(PR);var scheme,host;if(m){scheme=m[1];host=m[2];}else{var hm=document.cookie.match(/(?:^|;)\\s*relay-site=([^;]+)/);if(!hm)return;host=decodeURIComponent(hm[1].trim());var sm=document.cookie.match(/(?:^|;)\\s*relay-scheme=([^;]+)/);scheme=sm?decodeURIComponent(sm[1].trim()):"https";}try{sessionStorage.setItem("__relay_site_scheme__",scheme);sessionStorage.setItem("__relay_site_host__",host);}catch(e){}var sitePath=m?(m[3]||"/"):location.pathname;var r=new URL(scheme+"://"+host+sitePath+location.search+location.hash);function toDocUrl(u){if(u==null||u==="")return u;var s=String(u),emb=s.match(/(\\/proxy\\/(?:https?)\\/[^?\\s#]+(?:\\/[^?\\s#]*)?(?:\\?[^#\\s]*)?(?:#\\S*)?)/);if(emb)return emb[1];if(s.startsWith("/proxy/"))return s;try{var p=new URL(s,r.href);if(p.hostname===host)return"/proxy/"+scheme+"/"+host+(p.pathname||"/")+p.search+p.hash}catch(e){}if(s.startsWith("/"))return"/proxy/"+scheme+"/"+host+s;return s}var nativeLoc=location;var fake={get href(){return r.href},set href(u){nativeLoc.assign(toDocUrl(u));},get origin(){return r.origin},get protocol(){return r.protocol},get host(){return r.host},get hostname(){return r.hostname},get port(){return r.port},get pathname(){return r.pathname},get search(){return r.search},get hash(){return r.hash},toString:function(){return r.href},assign:function(u){nativeLoc.assign(toDocUrl(u));},replace:function(u){nativeLoc.replace(toDocUrl(u));},reload:nativeLoc.reload.bind(nativeLoc)};try{Object.defineProperty(window,"location",{get:function(){return fake},configurable:true});Object.defineProperty(document,"location",{get:function(){return fake},configurable:true})}catch(e){}function wrapHist(fn){return function(state,title,url){var docUrl=url==null||url===""?url:toDocUrl(url);var out=fn.call(this,state,title,docUrl);if(url!=null&&url!==""){try{var n=new URL(url,r.href);r.pathname=n.pathname;r.search=n.search;r.hash=n.hash}catch(e){}}return out}}history.pushState=wrapHist(history.pushState.bind(history));history.replaceState=wrapHist(history.replaceState.bind(history));window.__PHONE_RELAY_SITE__=r.href})();</script>`;
}

/** Rewrite root-absolute src/href="/path" so they work when document origin is 127.0.0.1:3000. */
export function rewriteRootAbsoluteUrls(html: string, targetUrl: string, origin: string): string {
  let site: URL;
  try {
    site = new URL(targetUrl);
  } catch {
    return html;
  }
  const prefix = `${origin}/proxy/${site.protocol.replace(":", "")}/${site.host}`;
  return html.replace(
    /(\s(?:href|src|action)=)(["'])\/([^"'#?][^"']*)(\2)/gi,
    (_match, lead, quote, path, endQuote) => `${lead}${quote}${prefix}/${path}${endQuote}`,
  );
}

/** Rewrite absolute https:// CDN URLs in HTML attributes (favicon, images, scripts). */
export function rewriteAbsoluteUrls(html: string, origin: string): string {
  return html.replace(
    /(\s(?:href|src|content|poster|data-src)=)(["'])(https?:\/\/[^"']+)(\2)/gi,
    (_match, lead, quote, url, endQuote) => `${lead}${quote}${pathProxyUrl(url, origin)}${endQuote}`,
  );
}

/** Rewrite url(https://…) inside proxied stylesheets. */
export function rewriteCssUrls(css: string, origin: string): string {
  return css.replace(/url\(\s*(["']?)(https?:\/\/[^"')]+)\1\s*\)/gi, (_m, quote, url) => {
    return `url(${quote}${pathProxyUrl(url, origin)}${quote})`;
  });
}

export function rewriteMetaRefresh(html: string, targetUrl: string, origin: string): string {
  return html.replace(
    /(<meta[^>]+http-equiv=["']refresh["'][^>]+content=["'][^"']*url=)([^"';]+)(["'])/gi,
    (_match, lead, url, tail) => {
      const rewritten = rewriteRedirectLocation(String(url).trim(), targetUrl, origin);
      const path = rewritten.startsWith(origin) ? rewritten.slice(origin.length) : rewritten;
      return `${lead}${path}${tail}`;
    },
  );
}

export function rewriteHtml(html: string, targetUrl: string, origin: string): string {
  const safeBase = proxyBaseHref(targetUrl, origin).replace(/"/g, "&quot;");
  const headInject = `${locationSpoofScript()}<base href="${safeBase}"><script src="${origin}/ad-filters.js"></script><script src="${origin}/relay-inject.js"></script>`;
  let out = rewriteAbsoluteUrls(html, origin);
  out = rewriteRootAbsoluteUrls(out, targetUrl, origin);
  out = rewriteMetaRefresh(out, targetUrl, origin);
  if (/<head[^>]*>/i.test(out)) {
    return out.replace(/<head[^>]*>/i, (m) => `${m}${headInject}`);
  }
  return `${headInject}${out}`;
}

export function isHtmlContentType(value: string | undefined): boolean {
  return (value ?? "").toLowerCase().includes("text/html");
}

export function isCssContentType(value: string | undefined): boolean {
  return (value ?? "").toLowerCase().includes("text/css");
}

export function isManifestContentType(value: string | undefined): boolean {
  const ct = (value ?? "").toLowerCase();
  return ct.includes("dash+xml") || ct.includes("mpegurl") || ct.includes("m3u8");
}

export function isManifestPath(url: string): boolean {
  try {
    const p = new URL(url).pathname.toLowerCase();
    return p.endsWith(".m3u8") || p.endsWith(".mpd");
  } catch {
    return false;
  }
}

/** Only rewrite bodies that are actually HLS/DASH manifests — not generic XML/JSON APIs. */
export function shouldRewriteManifest(contentType: string | undefined, targetUrl: string, body: string): boolean {
  if (isManifestPath(targetUrl)) return true;
  if (isManifestContentType(contentType)) return true;
  const trimmed = body.trimStart();
  return trimmed.startsWith("#EXTM3U") || trimmed.includes("<MPD");
}

/** Convert embedded /proxy/… paths back to real https:// URLs for outbound API bodies. */
export function restoreSiteUrlsFromProxy(value: string): string {
  if (!value.includes("/proxy")) return value;
  let out = value;
  out = out.replace(
    /https?:\/\/(?:127\.0\.0\.1|localhost):3000\/proxy\/(https?)\/([^/?#\s"']+)([^?\s"']*)?/gi,
    (_match, scheme, host, path) => `${scheme}://${host}${path || ""}`,
  );
  out = out.replace(/https?:\/\/(?:127\.0\.0\.1|localhost):3000\/proxy\?curl=([^"'\s&]+)/gi, (_match, encoded) => {
    try {
      return decodeURIComponent(encoded);
    } catch {
      return _match;
    }
  });
  out = out.replace(
    /\/proxy\/(https?)\/([^/?#\s"']+)(\/[^?\s"']*)?/g,
    (_match, scheme, host, path) => `${scheme}://${host}${path || ""}`,
  );
  return out;
}

function isRelativeManifestRef(value: string): boolean {
  const v = value.trim();
  if (!v || /^https?:\/\//i.test(v) || v.startsWith("/proxy/")) return false;
  if (v.includes("$")) return false;
  return true;
}

function toProxiedRef(raw: string, base: URL, origin: string): string {
  try {
    const trimmed = raw.trim();
    // Root-absolute (/video_h264/…) resolves against the CDN origin, not the manifest directory.
    // Without this, Shaka requests http://127.0.0.1:3000/video_h264/… (no /proxy) → dashboard HTML.
    const resolveBase = trimmed.startsWith("/")
      ? new URL(`${base.protocol}//${base.host}/`)
      : base;
    return pathProxyUrl(new URL(trimmed, resolveBase).href, origin);
  } catch {
    return raw;
  }
}

/** Rewrite absolute and relative media URLs inside DASH MPD / HLS playlists so Shaka fetches via proxy. */
export function rewriteManifestUrls(text: string, origin: string, manifestUrl?: string): string {
  let base: URL | null = null;
  if (manifestUrl) {
    try {
      base = new URL(manifestUrl);
    } catch {
      base = null;
    }
  }

  let out = text.replace(
    /(\s(?:media|initialization|href|src|baseUri|BaseURL|url)=["'])(https?:\/\/[^"']+)(["'])/gi,
    (_match, lead, url, endQuote) => `${lead}${pathProxyUrl(url, origin)}${endQuote}`,
  );
  out = out.replace(
    /(<(?:BaseURL|Location)[^>]*>)(https?:\/\/[^<]+)(<\/?)/gi,
    (_match, lead, url, tail) => `${lead}${pathProxyUrl(url, origin)}${tail}`,
  );
  out = out.replace(/^(https?:\/\/[^\s#]+)$/gm, (url) => pathProxyUrl(url, origin));
  out = out.replace(/URI="(https?:\/\/[^"]+)"/gi, (_match, url) => `URI="${pathProxyUrl(url, origin)}"`);

  if (base) {
    const manifestPath = manifestUrl?.toLowerCase() ?? "";
    const isHls = manifestPath.includes(".m3u8") || text.trimStart().startsWith("#EXTM3U");
    const isMpd = manifestPath.includes(".mpd") || text.includes("<MPD");

    out = out.replace(/URI="([^"]+)"/gi, (match, uri) => {
      if (!isRelativeManifestRef(uri)) return match;
      return `URI="${toProxiedRef(uri, base, origin)}"`;
    });
    if (isMpd) {
      out = out.replace(
        /(\s(?:media|initialization|href|src|baseUri|url)=["'])([^"']+)(["'])/gi,
        (match, lead, ref, endQuote) => {
          if (!isRelativeManifestRef(ref)) return match;
          return `${lead}${toProxiedRef(ref, base, origin)}${endQuote}`;
        },
      );
      out = out.replace(/(<BaseURL[^>]*>)([^<]+)(<\/BaseURL>)/gi, (match, lead, ref, tail) => {
        const trimmed = ref.trim();
        if (/^https?:\/\//i.test(trimmed) || !isRelativeManifestRef(trimmed)) return match;
        return `${lead}${toProxiedRef(trimmed, base, origin)}${tail}`;
      });
    }
    if (isHls) {
      out = out.replace(/^([^#\r\n][^\r\n]*)$/gm, (line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) return line;
        if (/^https?:\/\//i.test(trimmed)) return pathProxyUrl(trimmed, origin);
        if (!isRelativeManifestRef(trimmed)) return line;
        return toProxiedRef(trimmed, base, origin);
      });
    }
  }

  return out;
}

export function isPlainTextBody(payload: Buffer): boolean {
  if (!payload.length) return true;
  if (payload.includes(0)) return false;
  if (payload.length >= 2 && payload[0] === 0x1f && payload[1] === 0x8b) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(payload);
    return true;
  } catch {
    return false;
  }
}

export function toDocumentHistoryUrl(
  url: string | null | undefined,
  scheme: string,
  host: string,
  siteHref: string,
): string | null | undefined {
  if (url == null || url === "") return url;
  const str = String(url);

  const embedded = str.match(/(\/proxy\/(?:https?)\/[^?\s#]+(?:\/[^?\s#]*)?(?:\?[^#\s]*)?(?:#\S*)?)/);
  if (embedded) return embedded[1];

  if (str.startsWith("/proxy/")) return str;

  try {
    const parsed = new URL(str, siteHref);
    if (parsed.hostname === host) {
      return `/proxy/${scheme}/${host}${parsed.pathname || "/"}${parsed.search}${parsed.hash}`;
    }
  } catch {
    /* ignore */
  }

  if (str.startsWith("/")) return `/proxy/${scheme}/${host}${str}`;

  return str;
}

/** Map upstream redirect targets to same-origin /proxy/… paths for the browser. */
export function rewriteRedirectLocation(location: string, targetUrl: string, origin: string): string {
  const trimmed = location.trim();
  if (!trimmed) return location;

  try {
    const target = new URL(targetUrl);
    const scheme = target.protocol.replace(":", "");
    const host = target.hostname;
    const docPath = toDocumentHistoryUrl(trimmed, scheme, host, target.href);
    if (typeof docPath === "string" && docPath.startsWith("/proxy/")) {
      return `${origin}${docPath}`;
    }
    if (/^https?:\/\//i.test(trimmed)) {
      return pathProxyUrl(trimmed, origin);
    }
  } catch {
    /* ignore */
  }

  return location;
}
