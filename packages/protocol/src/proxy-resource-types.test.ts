import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROXY_RESOURCE_TYPES,
  isFullProxyMode,
  normalizeProxyResourceTypes,
  parseProxyTypesCookie,
  PROXY_RESOURCE_TYPE_IDS,
} from "./proxy-resource-types.ts";

describe("normalizeProxyResourceTypes", () => {
  it("returns all types when input is missing or invalid", () => {
    expect(normalizeProxyResourceTypes(undefined)).toEqual([...DEFAULT_PROXY_RESOURCE_TYPES]);
    expect(normalizeProxyResourceTypes(null)).toEqual([...DEFAULT_PROXY_RESOURCE_TYPES]);
    expect(normalizeProxyResourceTypes("stylesheet")).toEqual([...DEFAULT_PROXY_RESOURCE_TYPES]);
  });

  it("filters unknown values and preserves order of allowed ids", () => {
    expect(normalizeProxyResourceTypes(["stylesheet", "nope", "image"])).toEqual(["stylesheet", "image"]);
  });

  it("falls back to default when every value is invalid", () => {
    expect(normalizeProxyResourceTypes(["bad", "worse"])).toEqual([...DEFAULT_PROXY_RESOURCE_TYPES]);
  });

  it("falls back to default when array is empty", () => {
    expect(normalizeProxyResourceTypes([])).toEqual([...DEFAULT_PROXY_RESOURCE_TYPES]);
  });

  it("accepts every known resource type", () => {
    expect(normalizeProxyResourceTypes([...PROXY_RESOURCE_TYPE_IDS])).toEqual([...PROXY_RESOURCE_TYPE_IDS]);
  });
});

describe("isFullProxyMode", () => {
  it("is true when every type is selected", () => {
    expect(isFullProxyMode([...PROXY_RESOURCE_TYPE_IDS])).toBe(true);
  });

  it("is false for css-only selection", () => {
    expect(isFullProxyMode(["stylesheet"])).toBe(false);
  });
});

describe("parseProxyTypesCookie", () => {
  it("reads relay-proxy-types cookie", () => {
    const value = encodeURIComponent(JSON.stringify(["stylesheet"]));
    expect(
      parseProxyTypesCookie(`relay-site=net77.cc; relay-proxy-types=${value}`),
    ).toEqual(["stylesheet"]);
  });

  it("returns undefined when cookie is missing", () => {
    expect(parseProxyTypesCookie(undefined)).toBeUndefined();
  });
});
