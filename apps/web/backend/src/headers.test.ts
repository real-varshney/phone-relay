import { describe, expect, it } from "vitest";
import { incomingToRelay, outgoingFromRelay, rewriteHeadersForTarget } from "./headers.ts";
import { proxyRefererToSiteUrl } from "./leaked-asset.ts";

describe("rewriteHeadersForTarget", () => {
  it("rewrites localhost Origin/Referer from path-proxy referer", () => {
    const headers: Record<string, string> = {
      Origin: "http://127.0.0.1:3000",
      Referer:
        "http://127.0.0.1:3000/proxy/https/www.hotstar.com/in/movies/ant-man/1260140795/watch",
      "User-Agent": "Test",
    };
    rewriteHeadersForTarget(headers, { headers: {} } as import("node:http").IncomingMessage, proxyRefererToSiteUrl);
    expect(headers.Origin).toBe("https://www.hotstar.com");
    expect(headers.Referer).toBe("https://www.hotstar.com/in/movies/ant-man/1260140795/watch");
    expect(headers["User-Agent"]).toBe("Test");
  });

  it("uses X-Relay-Page-* headers from inject when present", () => {
    const headers: Record<string, string> = {
      Origin: "http://127.0.0.1:3000",
      "X-Relay-Page-Origin": "https://www.hotstar.com",
      "X-Relay-Page-Referer": "https://www.hotstar.com/in/watch",
    };
    rewriteHeadersForTarget(headers, { headers: {} } as import("node:http").IncomingMessage, proxyRefererToSiteUrl);
    expect(headers.Origin).toBe("https://www.hotstar.com");
    expect(headers.Referer).toBe("https://www.hotstar.com/in/watch");
    expect(headers["X-Relay-Page-Origin"]).toBeUndefined();
  });

  it("rewrites apix license call referer for DRM APIs", () => {
    const watchReferer =
      "http://127.0.0.1:3000/proxy/https/www.hotstar.com/in/movies/foo/1260140795/watch";
    const headers: Record<string, string> = {
      Origin: "http://127.0.0.1:3000",
      Referer: watchReferer,
    };
    rewriteHeadersForTarget(headers, { headers: { referer: watchReferer }, method: "POST" } as import("node:http").IncomingMessage, proxyRefererToSiteUrl, {
      targetHost: "apix.hotstar.com",
      method: "POST",
    });
    expect(headers.Origin).toBe("https://www.hotstar.com");
    expect(headers.Referer).toContain("https://www.hotstar.com/in/movies/foo");
  });

  it("strips Origin for CDN GET; keeps watch Referer when no manifest URL", () => {
    const headers: Record<string, string> = {
      Origin: "http://127.0.0.1:3000",
      Referer: "http://127.0.0.1:3000/proxy/https/www.hotstar.com/in/movies/foo/watch",
      "Sec-Fetch-Site": "same-origin",
      "Sec-Fetch-Mode": "cors",
      "X-Relay-Page-Origin": "https://www.hotstar.com",
      "X-Relay-Page-Referer": "https://www.hotstar.com/in/movies/foo/watch",
    };
    rewriteHeadersForTarget(
      headers,
      { headers: {}, method: "GET" } as import("node:http").IncomingMessage,
      proxyRefererToSiteUrl,
      { targetHost: "hses8-vod-jiol.cdn.hotstar.com", method: "GET" },
    );
    expect(headers.Origin).toBeUndefined();
    expect(headers.Referer).toBe("https://www.hotstar.com/in/movies/foo/watch");
    expect(headers["X-Relay-Page-Origin"]).toBeUndefined();
  });

  it("uses signed manifest URL as Referer for CDN segment GET", () => {
    const manifest =
      "https://hses5-vod-jiol.cdn.hotstar.com/videos/foo/master.mpd?hdnea=exp=123~hmac=abc";
    const headers: Record<string, string> = {
      "X-Relay-Manifest-Referer": manifest,
      "X-Relay-Page-Referer": "https://www.hotstar.com/in/movies/foo/watch",
    };
    rewriteHeadersForTarget(
      headers,
      { headers: {}, method: "GET" } as import("node:http").IncomingMessage,
      proxyRefererToSiteUrl,
      { targetHost: "hses5-vod-jiol.cdn.hotstar.com", method: "GET" },
    );
    expect(headers.Referer).toBe(manifest);
  });

  it("uses relay-site cookie when Referer is the dashboard root", () => {
    const headers: Record<string, string> = {
      Referer: "http://127.0.0.1:3000/",
      Cookie: "relay-site=www.hotstar.com; relay-scheme=https",
    };
    rewriteHeadersForTarget(
      headers,
      { headers: { cookie: headers.Cookie, referer: headers.Referer }, method: "GET" } as import("node:http").IncomingMessage,
      proxyRefererToSiteUrl,
      { targetHost: "img10.hotstar.com", method: "GET" },
    );
    expect(headers.Origin).toBe("https://www.hotstar.com");
    expect(headers.Referer).toBe("https://www.hotstar.com/");
  });

  it("drops Sec-Ch-Ua headers but forwards Sec-Fetch for upstream CDN checks", () => {
    const out = incomingToRelay({
      "Sec-Fetch-Site": "same-origin",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Dest": "document",
      "sec-ch-ua": '"Chromium";v="120"',
      "User-Agent": "Test",
    });
    expect(out["Sec-Fetch-Site"]).toBe("same-origin");
    expect(out["Sec-Fetch-Mode"]).toBe("cors");
    expect(out["Sec-Fetch-Dest"]).toBe("document");
    expect(out["sec-ch-ua"]).toBeUndefined();
    expect(out["User-Agent"]).toBe("Test");
  });

  it("strips relay-only cookies before forwarding to the phone", () => {
    const out = incomingToRelay({
      Cookie:
        "relay-site=www.hotstar.com; relay-scheme=https; relay-proxy-types=%5B%22stylesheet%22%5D; session=abc; relay-cdn-host=foo.cdn.hotstar.com",
    });
    expect(out.Cookie).toBe("session=abc");
  });

  it("omits Origin on no-cors image GET to the page host", () => {
    const headers: Record<string, string> = {
      Referer: "http://127.0.0.1:3000/proxy/https/www.hotstar.com/in/home",
      Accept: "image/avif,image/webp,image/*,*/*;q=0.8",
      "Sec-Fetch-Dest": "image",
      "Sec-Fetch-Mode": "no-cors",
    };
    rewriteHeadersForTarget(
      headers,
      { headers: { referer: headers.Referer }, method: "GET" } as import("node:http").IncomingMessage,
      proxyRefererToSiteUrl,
      { targetHost: "www.hotstar.com", method: "GET" },
    );
    expect(headers.Origin).toBeUndefined();
    expect(headers.Referer).toBe("https://www.hotstar.com/in/home");
  });

  it("packs upstream Set-Cookie into x-relay-set-cookie for the browser bridge", () => {
    const out = outgoingFromRelay({
      "Content-Type": "application/json",
      "Set-Cookie": "session=abc; Path=/; Domain=.hotstar.com",
    });
    expect(out["Set-Cookie"]).toBeUndefined();
    expect(JSON.parse(out["x-relay-set-cookie"])).toEqual([
      "session=abc; Path=/; Domain=.hotstar.com",
    ]);
  });
});

describe("proxyRefererToSiteUrl", () => {
  it("converts path-proxy URL to site URL", () => {
    expect(
      proxyRefererToSiteUrl("http://127.0.0.1:3000/proxy/https/www.hotstar.com/in?x=1"),
    ).toBe("https://www.hotstar.com/in?x=1");
  });
});
