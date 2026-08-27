import { describe, expect, it } from "vitest";
import {
  RELAY_API_PREFIX,
  RELAY_API_TAG,
  isRelayDashboardApi,
  relayApiPath,
  relayApiSubpath,
} from "./relay-api.ts";

describe("relay-api", () => {
  it("builds tagged dashboard paths", () => {
    expect(RELAY_API_TAG).toMatch(/^[a-z0-9]+$/);
    expect(relayApiPath("status")).toBe(`${RELAY_API_PREFIX}/status`);
    expect(relayApiPath("extension/hello")).toBe(`${RELAY_API_PREFIX}/extension/hello`);
  });

  it("recognizes only tagged dashboard routes", () => {
    expect(isRelayDashboardApi(relayApiPath("status"))).toBe(true);
    expect(isRelayDashboardApi("/api/status")).toBe(false);
    expect(isRelayDashboardApi("/api/internal/bff/v2/freshstart")).toBe(false);
  });

  it("parses subpaths", () => {
    expect(relayApiSubpath(relayApiPath("pairing"))).toBe("pairing");
    expect(relayApiSubpath(relayApiPath("extension/hello"))).toBe("extension/hello");
    expect(relayApiSubpath("/api/other")).toBe(null);
  });
});
