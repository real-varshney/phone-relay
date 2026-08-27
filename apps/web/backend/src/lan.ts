import os from "node:os";

const VIRTUAL_IFACE =
  /vEthernet|hyper-v|wsl|vmware|virtualbox|vethernet|npcap|loopback|docker|tailscale|wireguard|hamachi|zerotier|bluetooth|tap-/i;

function isVirtualInterface(name: string): boolean {
  return VIRTUAL_IFACE.test(name);
}

export function lanIPv4(): string[] {
  const out: string[] = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    if (isVirtualInterface(name ?? "")) continue;
    for (const a of addrs ?? []) {
      if (a.internal || a.family !== "IPv4") continue;
      if (a.address.startsWith("169.254.")) continue;
      out.push(a.address);
    }
  }
  return out;
}

/** Prefer typical home Wi-Fi (192.168.x.x), then 10.x, then 172.16-31.x. */
export function primaryLanIPv4(): string {
  const override = process.env.RELAY_LAN_IP?.trim();
  if (override) return override;

  const all = lanIPv4();
  const pick = (pred: (ip: string) => boolean) => all.find(pred);
  return (
    pick((ip) => ip.startsWith("192.168.")) ??
    pick((ip) => ip.startsWith("10.")) ??
    pick((ip) => {
      const p = ip.split(".").map(Number);
      return p[0] === 172 && p[1] >= 16 && p[1] <= 31;
    }) ??
    all[0] ??
    "127.0.0.1"
  );
}

export function isLoopbackAddress(addr: string | undefined): boolean {
  if (!addr) return false;
  const ip = addr.replace(/^::ffff:/, "");
  return ip === "127.0.0.1" || ip === "::1" || ip === "localhost";
}
