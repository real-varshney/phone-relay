import { describe, expect, it } from "vitest";
import { isRelayDashboardApi, relayApiPath } from "@phone-relay/protocol";
import {
  isLeakedMediaSegment,
  isLeakedSiteAsset,
  leakedMediaToProxyPath,
  parseRelaySiteCookie,
  parseRelaySiteFromUrl,
  proxyRefererToSiteUrl,
  relaySiteFromHeaders,
  toPathProxyRequest,
} from "./leaked-asset.ts";
import { rewriteAbsoluteUrls, rewriteHtml, rewriteManifestUrls, rewriteRedirectLocation, restoreSiteUrlsFromProxy, shouldRewriteManifest, toDocumentHistoryUrl } from "./html-rewrite.ts";

describe("leaked site assets", () => {
  it("detects root-absolute asset paths", () => {
    expect(isLeakedSiteAsset("/assets-x/web/_next/static/chunks/6622.js")).toBe(true);
    expect(isLeakedSiteAsset("/proxy/https/host/path")).toBe(false);
    expect(isLeakedSiteAsset(relayApiPath("status"))).toBe(false);
  });

  it("does not treat relay dashboard or portal paths as leaked assets", () => {
    expect(isLeakedSiteAsset("/portal")).toBe(false);
    expect(isLeakedSiteAsset("/portal?target=https://www.hotstar.com")).toBe(false);
    expect(isLeakedSiteAsset("/")).toBe(false);
    expect(isLeakedSiteAsset("/health")).toBe(false);
    expect(isLeakedSiteAsset("/phone")).toBe(false);
  });

  it("does not treat Vite TypeScript modules as media segments", () => {
    expect(isLeakedMediaSegment("/src/main.ts")).toBe(false);
    expect(isLeakedMediaSegment("/@fs/C:/project/foo.ts")).toBe(false);
    expect(isLeakedMediaSegment("/src/main.tsx")).toBe(false);
    expect(isLeakedMediaSegment("/hls/seg-1.ts")).toBe(true);
  });

  it("does not treat CDN media segments as hotstar site assets", () => {
    expect(isLeakedMediaSegment("/video_h264_fhd_sdr_1734507144263/avc1/6_XoGWQQU/seg-50.m4s")).toBe(true);
    expect(isLeakedMediaSegment("/audio_aac_1710298377297/hi/mp4a/1/init.mp4")).toBe(true);
    expect(isLeakedSiteAsset("/video_h264_fhd_sdr_1734507144263/avc1/6_XoGWQQU/seg-50.m4s")).toBe(false);
    expect(isLeakedSiteAsset("/audio_aac_1710298377297/hi/mp4a/1/init.mp4")).toBe(false);
  });

  it("allows site BFF API paths on localhost", () => {
    expect(isRelayDashboardApi(relayApiPath("status"))).toBe(true);
    expect(isRelayDashboardApi("/api/internal/bff/v2/freshstart")).toBe(false);
    expect(isLeakedSiteAsset("/api/internal/bff/v2/freshstart")).toBe(true);
  });

  it("parses relay site from proxied referer", () => {
    expect(
      parseRelaySiteFromUrl("http://127.0.0.1:3000/proxy/https/www.hotstar.com/in"),
    ).toEqual({ scheme: "https", host: "www.hotstar.com" });
    expect(
      proxyRefererToSiteUrl(
        "http://127.0.0.1:3000/proxy/https/www.hotstar.com/in/movies/foo/watch",
      ),
    ).toBe("https://www.hotstar.com/in/movies/foo/watch");
  });

  it("builds path-proxy URL for leaked asset", () => {
    expect(
      toPathProxyRequest(
        { scheme: "https", host: "www.hotstar.com" },
        "/assets-x/web/a.js",
        "?v=1",
      ),
    ).toBe("/proxy/https/www.hotstar.com/assets-x/web/a.js?v=1");
  });

  it("parses relay site from cookie when referer is a leaked path", () => {
    expect(parseRelaySiteCookie("relay-site=net77.cc; relay-scheme=https")).toEqual({
      scheme: "https",
      host: "net77.cc",
    });
    expect(
      relaySiteFromHeaders({
        headers: {
          referer: "http://127.0.0.1:3000/verify2?__cf_chl_rt_tk=abc",
          cookie: "relay-site=net77.cc; relay-scheme=https",
        },
      } as import("node:http").IncomingMessage),
    ).toEqual({ scheme: "https", host: "net77.cc" });
  });

  it("detects Cloudflare challenge paths as leaked site assets", () => {
    expect(isLeakedSiteAsset("/verify2")).toBe(true);
    expect(
      toPathProxyRequest({ scheme: "https", host: "net77.cc" }, "/verify2", "?x=1"),
    ).toBe("/proxy/https/net77.cc/verify2?x=1");
  });
});

describe("html rewrite", () => {
  it("rewrites absolute CDN URLs in HTML", () => {
    const html =
      '<link rel="icon" href="https://secure-media.hotstar.com/web-assets/prod/favicon.ico">';
    const out = rewriteAbsoluteUrls(html, "http://127.0.0.1:3000");
    expect(out).toContain("/proxy/https/secure-media.hotstar.com/web-assets/prod/favicon.ico");
  });

  it("css-only mode keeps sub-resources on the real site and skips inject scripts", () => {
    const html =
      '<html><head><link rel="stylesheet" href="/style.css"><script src="/app.js"></script></head><body><img src="https://net77.cc/x.png"></body></html>';
    const out = rewriteHtml(html, "https://net77.cc/", "http://127.0.0.1:3000", ["stylesheet"]);
    expect(out).toContain('base href="https://net77.cc/"');
    expect(out).toContain('href="/style.css"');
    expect(out).toContain('src="/app.js"');
    expect(out).not.toContain("/proxy/https/net77.cc/app.js");
    expect(out).not.toContain("/proxy/https/net77.cc/x.png");
    expect(out).not.toMatch(/<script src="[^"]*relay-inject\.js"/);
    expect(out).not.toMatch(/<script src="[^"]*ad-filters\.js"/);
    expect(out).toContain("__PHONE_RELAY_PROXY_TYPES__");
  });

  it("rewrites HTML document with location spoof, proxy base href, and inject", () => {
    const html = `<html><head></head><body><img src="https://img.hotstar.com/x.webp"></body></html>`;
    const out = rewriteHtml(html, "https://www.hotstar.com/in", "http://127.0.0.1:3000");
    expect(out).toContain("/proxy/https/img.hotstar.com/x.webp");
    expect(out).toContain('base href="http://127.0.0.1:3000/proxy/https/www.hotstar.com/"');
    expect(out).toContain("history.replaceState");
    expect(out).toContain("relay-inject.js");
  });

  it("rewrites DASH manifest CDN URLs to proxy paths", () => {
    const mpd =
      '<MPD><Period><AdaptationSet><Representation media="https://hses.akamaized.net/v1/segment.m4s"/></AdaptationSet></Period></MPD>';
    const out = rewriteManifestUrls(mpd, "http://127.0.0.1:3000");
    expect(out).toContain("/proxy/https/hses.akamaized.net/v1/segment.m4s");
  });

  it("rewrites relative HLS segment lines against manifest URL", () => {
    const manifestUrl = "https://hses13.apps.disneyplus.com/b/master.m3u8";
    const playlist = [
      "#EXTM3U",
      "#EXT-X-VERSION:6",
      "video_h264_fhd_sdr_1734507144263/avc1/6_XoGWQQU/seg-50.m4s",
    ].join("\n");
    const out = rewriteManifestUrls(playlist, "http://127.0.0.1:3000", manifestUrl);
    expect(out).toContain(
      "/proxy/https/hses13.apps.disneyplus.com/b/video_h264_fhd_sdr_1734507144263/avc1/6_XoGWQQU/seg-50.m4s",
    );
  });

  it("rewrites root-absolute HLS segment paths against CDN origin", () => {
    const manifestUrl = "https://hses7.hotstar.com/path/master.m3u8";
    const playlist = ["#EXTM3U", "/video_h264_fhd_sdr_1734507144263/avc1/6_XoGWQQU/seg-50.m4s"].join("\n");
    const out = rewriteManifestUrls(playlist, "http://127.0.0.1:3000", manifestUrl);
    expect(out).toContain(
      "/proxy/https/hses7.hotstar.com/video_h264_fhd_sdr_1734507144263/avc1/6_XoGWQQU/seg-50.m4s",
    );
    expect(out).not.toContain("\n/video_h264");
  });

  it("recovers leaked CDN segment from manifest referer", () => {
    const referer =
      "http://127.0.0.1:3000/proxy/https/hses7.hotstar.com/path/master.m3u8";
    expect(
      leakedMediaToProxyPath(
        referer,
        "/video_h264_fhd_sdr_1734507144263/avc1/6_XoGWQQU/seg-50.m4s",
        "",
      ),
    ).toBe(
      "/proxy/https/hses7.hotstar.com/video_h264_fhd_sdr_1734507144263/avc1/6_XoGWQQU/seg-50.m4s",
    );
  });

  it("does not map leaked segments to www.hotstar.com watch page referer", () => {
    expect(
      leakedMediaToProxyPath(
        "http://127.0.0.1:3000/proxy/https/www.hotstar.com/in/movies/foo/watch",
        "/video_h264_fhd/seg-1.m4s",
        "",
      ),
    ).toBeNull();
  });

  it("does not rewrite generic JSON as a manifest", () => {
    const json = '{"contentId":"abc123","host":"hses7.hotstar.com"}';
    expect(shouldRewriteManifest("application/json", "https://hses7.hotstar.com/foo/video-meta.json", json)).toBe(
      false,
    );
    expect(rewriteManifestUrls(json, "http://127.0.0.1:3000", "https://hses7.hotstar.com/foo/video-meta.json")).toBe(
      json,
    );
  });

  it("restores real site URLs from proxy paths in API bodies", () => {
    const leaked =
      '{"path":"http://127.0.0.1:3000/proxy/https/hses7.hotstar.com/abc123/video-meta.json"}';
    expect(restoreSiteUrlsFromProxy(leaked)).toBe('{"path":"https://hses7.hotstar.com/abc123/video-meta.json"}');
  });

  it("maps site history URLs to same-origin proxy paths", () => {
    expect(
      toDocumentHistoryUrl(
        "http://hotstar.com/proxy/http/hotstar.com/",
        "http",
        "hotstar.com",
        "http://hotstar.com/",
      ),
    ).toBe("/proxy/http/hotstar.com/");
    expect(toDocumentHistoryUrl("/watch/123", "https", "www.hotstar.com", "https://www.hotstar.com/")).toBe(
      "/proxy/https/www.hotstar.com/watch/123",
    );
  });

  it("rewrites Hotstar CMS image paths to img.hotstar.com proxy URLs", () => {
    const html =
      '<img src="/in/w_256/sources/r1/cms/prod/2448/1462448-v-f21a9b6d25d3" alt="x">';
    const out = rewriteHtml(html, "https://www.hotstar.com/in/home", "http://127.0.0.1:3000");
    expect(out).toContain(
      "/proxy/https/img.hotstar.com/image/upload/w_256/sources/r1/cms/prod/2448/1462448-v-f21a9b6d25d3",
    );
  });

  it("rewrites upstream redirect locations to proxy paths", () => {
    expect(
      rewriteRedirectLocation(
        "/verify2?__cf_chl_rt_tk=abc",
        "https://net77.cc/home",
        "http://127.0.0.1:3000",
      ),
    ).toBe("http://127.0.0.1:3000/proxy/https/net77.cc/verify2?__cf_chl_rt_tk=abc");
    expect(
      rewriteRedirectLocation(
        "https://net77.cc/verify2?x=1",
        "https://net77.cc/home",
        "http://127.0.0.1:3000",
      ),
    ).toBe("http://127.0.0.1:3000/proxy/https/net77.cc/verify2?x=1");
  });
});
