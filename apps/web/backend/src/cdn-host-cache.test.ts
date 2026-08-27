import { describe, expect, it, beforeEach } from "vitest";
import { cachedManifestUrl, cachedMediaCdnSite, clearMediaCdnCache, leakedVideoPathWithCdn, noteManifestUrl, noteMediaCdnHost, parseRelayCdnCookie } from "./cdn-host-cache.ts";

describe("cdn host cache", () => {
  beforeEach(() => clearMediaCdnCache());

  it("remembers hses CDN from manifest fetch", () => {
    noteMediaCdnHost("127.0.0.1", "https://hses7.hotstar.com/path/master.m3u8");
    expect(cachedMediaCdnSite("127.0.0.1")).toEqual({ scheme: "https", host: "hses7.hotstar.com" });
  });

  it("ignores www.hotstar.com page URLs", () => {
    noteMediaCdnHost("127.0.0.1", "https://www.hotstar.com/in/movies/foo/watch");
    expect(cachedMediaCdnSite("127.0.0.1")).toBeNull();
  });

  it("ignores ad akamai hosts", () => {
    noteMediaCdnHost("127.0.0.1", "https://hesads.akamaized.net/foo");
    expect(cachedMediaCdnSite("127.0.0.1")).toBeNull();
  });

  it("caches manifest URL for CDN segment Referer", () => {
    const manifest =
      "https://hses5-vod-jiol.cdn.hotstar.com/videos/foo/master.mpd?hdnea=exp=1~hmac=x";
    noteManifestUrl("127.0.0.1", manifest);
    expect(cachedManifestUrl("127.0.0.1")).toBe(manifest);
  });

  it("parses relay CDN cookie for leaked segment recovery", () => {
    expect(parseRelayCdnCookie("relay-cdn-host=hses9.hotstar.com; other=1")).toEqual({
      scheme: "https",
      host: "hses9.hotstar.com",
    });
    expect(parseRelayCdnCookie("foo=bar")).toBeNull();
  });

  it("builds proxy path for leaked audio init segment", () => {
    const path = leakedVideoPathWithCdn(
      "/audio_aac_1710298377297/hi/mp4a/1/init.mp4",
      "",
      { scheme: "https", host: "hses9.hotstar.com" },
    );
    expect(path).toBe("/proxy/https/hses9.hotstar.com/audio_aac_1710298377297/hi/mp4a/1/init.mp4");
  });

  it("builds proxy path for leaked video CDN segment", () => {
    const path = leakedVideoPathWithCdn(
      "/video_h265_fhd_sdr_1761920355448/hvc1/6_HhblfnM/init.mp4",
      "",
      { scheme: "https", host: "hses7.hotstar.com" },
    );
    expect(path).toBe(
      "/proxy/https/hses7.hotstar.com/video_h265_fhd_sdr_1761920355448/hvc1/6_HhblfnM/init.mp4",
    );
  });
});
