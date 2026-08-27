import { describe, expect, it } from "vitest";
import { isAdBlockedHost, isAdBlockedUrl } from "./ad-block.ts";

describe("ad-block", () => {
  it("blocks Hotstar ad CDN", () => {
    expect(isAdBlockedHost("hesads.akamaized.net")).toBe(true);
    expect(isAdBlockedUrl("https://hesads.akamaized.net/v1/ads/foo")).toBe(true);
  });

  it("blocks subdomains of listed trackers", () => {
    expect(isAdBlockedHost("pagead2.googlesyndication.com")).toBe(true);
  });

  it("allows GitHub asset CDN", () => {
    expect(isAdBlockedHost("github.githubassets.com")).toBe(false);
    expect(
      isAdBlockedUrl(
        "https://github.githubassets.com/assets/dark_high_contrast-f39e8ef7b7418526.css",
      ),
    ).toBe(false);
  });

  it("allows common static asset paths on normal hosts", () => {
    expect(isAdBlockedUrl("https://example.com/assets/app.js")).toBe(false);
    expect(isAdBlockedUrl("https://cdn.example.com/static/advertorial/readme")).toBe(false);
  });

  it("allows video CDN and main site", () => {
    expect(isAdBlockedHost("hses5-vod-jiol.cdn.hotstar.com")).toBe(false);
    expect(isAdBlockedHost("www.hotstar.com")).toBe(false);
    expect(isAdBlockedUrl("https://www.hotstar.com/in/movies/foo/watch")).toBe(false);
  });
});
