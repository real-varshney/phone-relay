import { describe, expect, it } from "vitest";
import { inspectDestination } from "./policy.ts";

describe("inspectDestination", () => {
  it("allows public https URLs", async () => {
    const result = await inspectDestination("https://example.com/x", {
      allowPrivateLan: false,
      resolve: async () => [{ address: "93.184.216.34", family: 4 }],
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.hostname).toBe("example.com");
  });

  it("blocks localhost by name", async () => {
    const result = await inspectDestination("http://localhost:8080", {
      allowPrivateLan: false,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("DESTINATION_BLOCKED");
  });

  it("blocks loopback IPs even when LAN is allowed", async () => {
    const result = await inspectDestination("http://127.0.0.1/", {
      allowPrivateLan: true,
    });
    expect(result.ok).toBe(false);
  });

  it("allows loopback only in test mode", async () => {
    const result = await inspectDestination("http://127.0.0.1/", {
      allowPrivateLan: true,
      allowLoopback: true,
    });
    expect(result.ok).toBe(true);
  });

  it("blocks private IPv4 by default", async () => {
    const result = await inspectDestination("http://192.168.1.25/", {
      allowPrivateLan: false,
    });
    expect(result.ok).toBe(false);
  });

  it("allows private IPv4 when LAN toggle is on", async () => {
    const result = await inspectDestination("http://192.168.1.25/api", {
      allowPrivateLan: true,
    });
    expect(result.ok).toBe(true);
  });

  it("blocks cloud metadata hosts", async () => {
    const result = await inspectDestination("http://169.254.169.254/latest", {
      allowPrivateLan: true,
    });
    expect(result.ok).toBe(false);
  });

  it("blocks metadata DNS names", async () => {
    const result = await inspectDestination("http://metadata.google.internal/", {
      allowPrivateLan: true,
    });
    expect(result.ok).toBe(false);
  });

  it("blocks when DNS resolves to a private address", async () => {
    const result = await inspectDestination("https://evil.example", {
      allowPrivateLan: false,
      resolve: async () => [{ address: "10.0.0.8", family: 4 }],
    });
    expect(result.ok).toBe(false);
  });

  it("blocks .local names", async () => {
    const result = await inspectDestination("http://printer.local/", {
      allowPrivateLan: false,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects non-http schemes", async () => {
    const result = await inspectDestination("file:///etc/passwd", {
      allowPrivateLan: false,
    });
    expect(result.ok).toBe(false);
  });
});
