/**
 * Portal relay inject: on /proxy/… pages, rewrite fetch/XHR through phone relay.
 * Every outbound request becomes /proxy/https/host/path — phone makes the real call.
 */
(function phoneRelayInject() {
  if (window.__PHONE_RELAY_INJECTED__) return;
  window.__PHONE_RELAY_INJECTED__ = true;

  const PROXY_ORIGIN = "http://127.0.0.1:3000";
  const LOCAL = new Set(["127.0.0.1", "localhost", "backend.lcl", "::1"]);
  const RELAY_API_PREFIX = "/api/pr7k9m2";
  const PROXY_PATH_RE = /^\/proxy\/(https?)\/([^/]+)(\/.*)?$/;

  function rememberRelaySite(scheme, host) {
    try {
      sessionStorage.setItem("__relay_site_scheme__", scheme);
      sessionStorage.setItem("__relay_site_host__", host);
    } catch {
      /* ignore */
    }
  }

  function relaySiteFromStorage() {
    try {
      const host = sessionStorage.getItem("__relay_site_host__");
      const scheme = sessionStorage.getItem("__relay_site_scheme__") || "https";
      if (!host) return null;
      return { scheme, host };
    } catch {
      return null;
    }
  }

  function parseRelaySite() {
    const m = location.pathname.match(PROXY_PATH_RE);
    if (m) {
      const path = m[3] || "/";
      rememberRelaySite(m[1], m[2]);
      return {
        scheme: m[1],
        host: m[2],
        siteHref: `${m[1]}://${m[2]}${path}${location.search}${location.hash}`,
      };
    }
    const stored = relaySiteFromStorage();
    if (stored) {
      return {
        scheme: stored.scheme,
        host: stored.host,
        siteHref: `${stored.scheme}://${stored.host}${location.pathname}${location.search}${location.hash}`,
      };
    }
    return null;
  }

  function targetFromProxy(proxyUrl) {
    try {
      const u = new URL(proxyUrl);
      const curl = u.searchParams.get("curl");
      if (curl) return new URL(curl);
      const m = u.pathname.match(PROXY_PATH_RE);
      if (!m) return null;
      const path = m[3] || "/";
      return new URL(`${m[1]}://${m[2]}${path}${u.search}${u.hash}`);
    } catch {
      return null;
    }
  }

  function pageBaseUrl() {
    const site = parseRelaySite();
    if (site) return site.siteHref;
    if (window.__PHONE_RELAY_SITE__) return window.__PHONE_RELAY_SITE__;
    return location.href;
  }

  function isBackendUrl(abs) {
    try {
      const u = new URL(abs);
      if (!LOCAL.has(u.hostname)) return false;
      return (
        u.pathname.startsWith("/proxy") ||
        u.pathname.startsWith("/portal") ||
        u.pathname.endsWith("/relay-inject.js") ||
        u.pathname.endsWith("/ad-filters.js") ||
        u.pathname === RELAY_API_PREFIX ||
        u.pathname.startsWith(`${RELAY_API_PREFIX}/`)
      );
    } catch {
      return false;
    }
  }

  function toPathProxy(abs) {
    const u = new URL(abs);
    const path = u.pathname === "/" ? "" : u.pathname;
    return `${PROXY_ORIGIN}/proxy/${u.protocol.replace(":", "")}/${u.host}${path}${u.search}${u.hash}`;
  }

  function fixProxyLeaks(value) {
    if (typeof value !== "string" || !value.includes("/proxy")) return value;
    let out = value;
    out = out.replace(
      /https?:\/\/(?:127\.0\.0\.1|localhost):3000\/proxy\/(https?)\/([^/?#\s"']+)([^?\s"']*)?/gi,
      (_m, scheme, host, path) => `${scheme}://${host}${path || ""}`,
    );
    out = out.replace(/https?:\/\/(?:127\.0\.0\.1|localhost):3000\/proxy\?curl=([^"'\s&]+)/gi, (_m, encoded) => {
      try {
        return decodeURIComponent(encoded);
      } catch {
        return _m;
      }
    });
    out = out.replace(
      /\/proxy\/(https?)\/([^/?#\s"']+)(\/[^?\s"']*)?/g,
      (_m, scheme, host, path) => `${scheme}://${host}${path || ""}`,
    );
    return out;
  }

  function fixBody(body) {
    if (body == null) return body;
    if (typeof body === "string") return fixProxyLeaks(body);
    if (body instanceof URLSearchParams) {
      const next = new URLSearchParams();
      for (const [k, v] of body.entries()) next.set(k, fixProxyLeaks(v));
      return next;
    }
    return body;
  }

  function requestCookies(targetUrl) {
    return new Promise((resolve) => {
      const id = Math.random().toString(36).slice(2);
      const timeout = setTimeout(() => {
        window.removeEventListener("__phone_relay_cookies__", onReply);
        resolve("");
      }, 2000);
      function onReply(event) {
        if (event.detail?.id !== id) return;
        clearTimeout(timeout);
        window.removeEventListener("__phone_relay_cookies__", onReply);
        resolve(event.detail.cookie ?? "");
      }
      window.addEventListener("__phone_relay_cookies__", onReply);
      window.dispatchEvent(
        new CustomEvent("__phone_relay_cookie_req__", { detail: { id, url: targetUrl } }),
      );
    });
  }

  function applyRelaySetCookies(resp) {
    const target = resp.headers.get("x-relay-target");
    const raw = resp.headers.get("x-relay-set-cookie");
    if (!target || !raw) return;
    let list;
    try {
      list = JSON.parse(raw);
    } catch {
      return;
    }
    if (!Array.isArray(list)) return;
    for (const cookie of list) {
      if (typeof cookie !== "string" || !cookie) continue;
      window.dispatchEvent(
        new CustomEvent("__phone_relay_set_cookie__", { detail: { url: target, cookie } }),
      );
    }
  }

  function isStreamingCdnHost(hostname) {
    if (/^hesads\./i.test(hostname)) return false;
    if (/^hses\d+/i.test(hostname)) return true;
    if (hostname.includes("disneyplus.com")) return true;
    if (hostname.endsWith(".cdn.hotstar.com")) return true;
    if (/\.akamaized\.net$/i.test(hostname) && /^hses/i.test(hostname)) return true;
    return false;
  }

  function isManifestUrl(url) {
    try {
      const u = new URL(url);
      const path = u.pathname.toLowerCase();
      return path.endsWith(".mpd") || path.endsWith(".m3u8") || path.includes("master");
    } catch {
      return false;
    }
  }

  function noteManifestUrl(url) {
    if (!isManifestUrl(url)) return;
    sessionStorage.setItem("__relay_manifest_url__", url);
  }

  function pageSiteOrigin() {
    const site = parseRelaySite();
    if (site) return `${site.scheme}://${site.host}`;
    if (window.__PHONE_RELAY_SITE__) {
      try {
        return new URL(window.__PHONE_RELAY_SITE__).origin;
      } catch {
        return null;
      }
    }
    return null;
  }

  function relayHeaders(target, initHeaders, inputHeaders) {
    const headers = new Headers(initHeaders || (inputHeaders ? inputHeaders : undefined));
    const pageOrigin = pageSiteOrigin();
    const pageReferer = pageBaseUrl();
    if (pageOrigin) headers.set("X-Relay-Page-Origin", pageOrigin);
    if (pageReferer) headers.set("X-Relay-Page-Referer", pageReferer);
    if (isStreamingCdnHost(target.hostname)) {
      const manifest = sessionStorage.getItem("__relay_manifest_url__");
      if (manifest) headers.set("X-Relay-Manifest-Referer", manifest);
    }
    return headers;
  }

  async function attachCookies(headers, targetHref) {
    const cookie = await requestCookies(targetHref);
    if (cookie) headers.set("Cookie", cookie);
    return headers;
  }

  const RELAY_CDN_ROOT = /^\/(?:video_|audio_)[^/]+\//;

  function noteCdnTarget(targetUrl) {
    try {
      const u = new URL(targetUrl);
      if (!isStreamingCdnHost(u.hostname)) return;
      sessionStorage.setItem("__relay_cdn_host__", u.hostname);
      sessionStorage.setItem("__relay_cdn_scheme__", u.protocol.replace(":", ""));
    } catch {
      /* ignore */
    }
  }

  function afterRelayResponse(resp) {
    applyRelaySetCookies(resp);
    const relayTarget = resp.headers.get("x-relay-target");
    if (!relayTarget) return;
    noteManifestUrl(relayTarget);
    noteCdnTarget(relayTarget);
  }

  function leakedLocalhostToProxy(abs) {
    try {
      const u = new URL(abs);
      if (!LOCAL.has(u.hostname) || u.pathname.startsWith("/proxy")) return null;
      if (isBackendUrl(abs)) return null;

      if (RELAY_CDN_ROOT.test(u.pathname)) {
        const host = sessionStorage.getItem("__relay_cdn_host__");
        if (host) {
          const scheme = sessionStorage.getItem("__relay_cdn_scheme__") || "https";
          return `${PROXY_ORIGIN}/proxy/${scheme}/${host}${u.pathname}${u.search}${u.hash}`;
        }
      }

      const site = parseRelaySite() || relaySiteFromStorage();
      if (!site) return null;
      return `${PROXY_ORIGIN}/proxy/${site.scheme}/${site.host}${u.pathname}${u.search}${u.hash}`;
    } catch {
      return null;
    }
  }

  function toProxy(raw) {
    try {
      const abs = new URL(raw, pageBaseUrl()).href;
      const leaked = leakedLocalhostToProxy(abs);
      if (leaked) return leaked;
      if (isBackendUrl(abs)) return abs;
      if (abs.includes("/proxy/")) return abs;
      if (LOCAL.has(new URL(abs).hostname)) return abs;
      if (!/^https?:/i.test(abs)) return raw;
      return toPathProxy(abs);
    } catch {
      return raw;
    }
  }

  function isAdBlocked(url) {
    const filters = window.__PHONE_RELAY_AD_FILTERS__;
    if (!filters?.isBlockedUrl) return false;
    return filters.isBlockedUrl(url);
  }

  function blockedResponse() {
    return new Response("", { status: 204, statusText: "No Content" });
  }

  const origFetch = window.fetch.bind(window);
  async function relayFetch(input, init) {
    try {
      const nextInit = init ? { ...init } : undefined;
      if (nextInit?.body != null) nextInit.body = fixBody(nextInit.body);

      if (input instanceof Request) {
        const url = toProxy(input.url);
        const target = targetFromProxy(url);
        if (url === input.url || !target) return origFetch(input, init);
        if (isAdBlocked(target.href)) return blockedResponse();
        const headers = await attachCookies(relayHeaders(target, nextInit?.headers, input.headers), target.href);
        const resp = await origFetch(
          new Request(url, {
            method: input.method,
            headers,
            body: nextInit?.body ?? input.body,
            mode: "cors",
            credentials: "include",
            cache: input.cache,
            redirect: input.redirect,
            integrity: input.integrity,
          }),
        );
        afterRelayResponse(resp);
        return resp;
      }

      const url = toProxy(String(input));
      const target = targetFromProxy(url);
      if (url === String(input) || !target) return origFetch(input, init);
      if (isAdBlocked(target.href)) return blockedResponse();
      const headers = await attachCookies(relayHeaders(target, nextInit?.headers), target.href);
      const resp = await origFetch(url, { ...nextInit, credentials: "include", headers });
      afterRelayResponse(resp);
      return resp;
    } catch {
      return origFetch(input, init);
    }
  }

  try {
    Object.defineProperty(window, "fetch", { value: relayFetch, writable: true, configurable: true });
  } catch {
    window.fetch = relayFetch;
  }

  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  const origSetHeader = XMLHttpRequest.prototype.setRequestHeader;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__relayTarget = targetFromProxy(toProxy(url));
    return origOpen.call(this, method, toProxy(url), ...rest);
  };

  XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
    this.__relayHeadersSet = true;
    return origSetHeader.call(this, name, value);
  };

  XMLHttpRequest.prototype.send = function (body) {
    const self = this;
    const target = self.__relayTarget;
    const payload = fixBody(body);
    if (!target) return origSend.call(self, payload);
    if (isAdBlocked(target.href)) {
      try {
        Object.defineProperty(self, "status", { value: 204 });
        Object.defineProperty(self, "readyState", { value: 4 });
      } catch {
        /* ignore */
      }
      if (typeof self.onload === "function") self.onload();
      if (typeof self.onreadystatechange === "function") self.onreadystatechange();
      return;
    }

    void (async () => {
      try {
        const pageOrigin = pageSiteOrigin();
        const pageReferer = pageBaseUrl();
        if (pageOrigin) origSetHeader.call(self, "X-Relay-Page-Origin", pageOrigin);
        if (pageReferer) origSetHeader.call(self, "X-Relay-Page-Referer", pageReferer);
        if (isStreamingCdnHost(target.hostname)) {
          const manifest = sessionStorage.getItem("__relay_manifest_url__");
          if (manifest) origSetHeader.call(self, "X-Relay-Manifest-Referer", manifest);
        }
        const cookie = await requestCookies(target.href);
        if (cookie) origSetHeader.call(self, "Cookie", cookie);
      } catch {
        /* continue */
      }
      origSend.call(self, payload);
    })();
  };

  if (navigator.sendBeacon) {
    const origBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = function (url, data) {
      const target = targetFromProxy(toProxy(String(url)));
      if (target && isAdBlocked(target.href)) return true;
      const fixed = typeof data === "string" ? fixProxyLeaks(data) : data;
      return origBeacon(toProxy(String(url)), fixed);
    };
  }
})();
