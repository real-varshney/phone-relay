import { describe, expect, it } from "vitest";
import {
  BACKEND_ORIGIN,
  decodeRelayTarget,
  encodeRelayUrl,
  isLocalBackendUrl,
  isRelayControlPath,
  normalizeRelayTarget,
  toPathProxyUrl,
} from "./proxy-url.ts";

describe("proxy URL", () => {
  it("encodes a target as /proxy?curl=", () => {
    const out = encodeRelayUrl("https://hoststar.com/api?x=1");
    expect(out).toBe(
      `${BACKEND_ORIGIN}/proxy?curl=${encodeURIComponent("https://hoststar.com/api?x=1")}`,
    );
  });

  it("decodes curl query form", () => {
    const encoded = encodeRelayUrl("https://hoststar.com/api?x=1&y=2");
    expect(decodeRelayTarget(encoded)).toBe("https://hoststar.com/api?x=1&y=2");
  });

  it("decodes path form /proxy/https/host/path", () => {
    const target = decodeRelayTarget(
      "http://127.0.0.1:3000/proxy/https/hoststar.com/api/v1?z=9",
    );
    expect(target).toBe("https://hoststar.com/api/v1?z=9");
  });

  it("treats backend.lcl as local backend", () => {
    expect(isLocalBackendUrl("http://backend.lcl/proxy?curl=https://x")).toBe(true);
    expect(isLocalBackendUrl("https://hoststar.com/api")).toBe(false);
  });

  it("does not double-wrap an already proxied URL", () => {
    const once = encodeRelayUrl("https://example.com/");
    expect(encodeRelayUrl(once)).toBe(once);
  });

  it("recognizes relay control paths that must not be proxied", () => {
    expect(isRelayControlPath("/portal")).toBe(true);
    expect(isRelayControlPath("/portal?target=https://x")).toBe(true);
    expect(isRelayControlPath("/")).toBe(true);
    expect(isRelayControlPath("/proxy/https/www.hotstar.com/")).toBe(true);
    expect(isRelayControlPath("/in/movies/foo")).toBe(false);
  });

  it("normalizes bare Hotstar root to /in", () => {
    expect(normalizeRelayTarget("https://www.hotstar.com")).toBe("https://www.hotstar.com/in");
    expect(normalizeRelayTarget("https://www.hotstar.com/")).toBe("https://www.hotstar.com/in");
    expect(normalizeRelayTarget("https://www.hotstar.com/in/movies/foo")).toBe(
      "https://www.hotstar.com/in/movies/foo",
    );
    expect(toPathProxyUrl("https://www.hotstar.com")).toBe(
      `${BACKEND_ORIGIN}/proxy/https/www.hotstar.com/in`,
    );
  });
});
