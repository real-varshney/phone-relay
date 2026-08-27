import { describe, expect, it, vi, afterEach } from "vitest";
import os from "node:os";
import { lanIPv4, primaryLanIPv4 } from "./lan.ts";

describe("lan", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("prefers 192.168.x over virtual-looking addresses", () => {
    vi.spyOn(os, "networkInterfaces").mockReturnValue({
      "vEthernet (WSL)": [{ family: "IPv4", internal: false, address: "172.28.0.1" } as os.NetworkInterfaceInfo],
      "Wi-Fi": [{ family: "IPv4", internal: false, address: "192.168.1.42" } as os.NetworkInterfaceInfo],
    });
    expect(lanIPv4()).toEqual(["192.168.1.42"]);
    expect(primaryLanIPv4()).toBe("192.168.1.42");
  });

  it("honours RELAY_LAN_IP override", () => {
    vi.stubEnv("RELAY_LAN_IP", "192.168.0.99");
    vi.spyOn(os, "networkInterfaces").mockReturnValue({
      "Wi-Fi": [{ family: "IPv4", internal: false, address: "192.168.1.42" } as os.NetworkInterfaceInfo],
    });
    expect(primaryLanIPv4()).toBe("192.168.0.99");
  });
});
