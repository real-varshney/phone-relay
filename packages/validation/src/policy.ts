import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { ErrorCode } from "@phone-relay/shared-types";

export type ResolveFn = (
  hostname: string,
) => Promise<Array<{ address: string; family: 4 | 6 }>>;

export type PolicyOptions = {
  allowPrivateLan: boolean;
  /** Test-only. Production always keeps loopback blocked. */
  allowLoopback?: boolean;
  resolve?: ResolveFn;
};

export type PolicyResult =
  | { ok: true; url: URL; hostname: string; addresses: string[] }
  | { ok: false; code: ErrorCode; message: string };

const BLOCKED_NAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata.goog",
  "instance-data",
]);

const BLOCKED_SUFFIXES = [".local", ".localhost", ".internal", ".lan"];

function ipv4ToInt(ip: string): number {
  const parts = ip.split(".").map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    return -1;
  }
  return ((parts[0]! << 24) | (parts[1]! << 16) | (parts[2]! << 8) | parts[3]!) >>> 0;
}

function ipv4InCidr(ip: string, cidr: string): boolean {
  const [net, bitsStr] = cidr.split("/");
  const bits = Number(bitsStr);
  const ipInt = ipv4ToInt(ip);
  const netInt = ipv4ToInt(net ?? "");
  if (ipInt < 0 || netInt < 0) return false;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ipInt & mask) === (netInt & mask);
}

function isLoopback(ip: string, family: number): boolean {
  if (family === 4) return ipv4InCidr(ip, "127.0.0.0/8") || ip === "0.0.0.0";
  const v = ip.toLowerCase();
  return v === "::1" || v === "::" || v === "0:0:0:0:0:0:0:1";
}

function isLinkLocal(ip: string, family: number): boolean {
  if (family === 4) return ipv4InCidr(ip, "169.254.0.0/16");
  const v = ip.toLowerCase();
  return v.startsWith("fe80:");
}

function isPrivateLan(ip: string, family: number): boolean {
  if (family === 4) {
    return (
      ipv4InCidr(ip, "10.0.0.0/8") ||
      ipv4InCidr(ip, "172.16.0.0/12") ||
      ipv4InCidr(ip, "192.168.0.0/16") ||
      ipv4InCidr(ip, "100.64.0.0/10")
    );
  }
  const v = ip.toLowerCase();
  return v.startsWith("fc") || v.startsWith("fd");
}

function isMetadataIp(ip: string, family: number): boolean {
  return family === 4 && ip === "169.254.169.254";
}

function hostnameBlocked(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, "");
  if (BLOCKED_NAMES.has(h)) return true;
  return BLOCKED_SUFFIXES.some((s) => h.endsWith(s));
}

function addressBlocked(
  ip: string,
  family: 4 | 6,
  allowPrivateLan: boolean,
  allowLoopback: boolean,
): boolean {
  if (isLoopback(ip, family) && !allowLoopback) return true;
  if (isMetadataIp(ip, family)) return true;
  if (isLinkLocal(ip, family)) return true;
  if (isPrivateLan(ip, family) && !allowPrivateLan) return true;
  return false;
}

const defaultResolve: ResolveFn = async (hostname) => {
  const records = await lookup(hostname, { all: true, verbatim: true });
  return records.map((r) => ({
    address: r.address,
    family: r.family === 6 ? 6 : 4,
  }));
};

export async function inspectDestination(
  raw: string,
  options: PolicyOptions,
): Promise<PolicyResult> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return {
      ok: false,
      code: "DESTINATION_BLOCKED",
      message: "URL could not be parsed.",
    };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return {
      ok: false,
      code: "DESTINATION_BLOCKED",
      message: "Only http and https destinations are allowed.",
    };
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (hostnameBlocked(hostname)) {
    return {
      ok: false,
      code: "DESTINATION_BLOCKED",
      message: "That destination is not permitted by the relay security policy.",
    };
  }

  const family = isIP(hostname);
  if (family === 4 || family === 6) {
    if (addressBlocked(hostname, family, options.allowPrivateLan, Boolean(options.allowLoopback))) {
      return {
        ok: false,
        code: "DESTINATION_BLOCKED",
        message: "That destination is not permitted by the relay security policy.",
      };
    }
    return { ok: true, url, hostname, addresses: [hostname] };
  }

  const resolve = options.resolve ?? defaultResolve;
  let records: Array<{ address: string; family: 4 | 6 }>;
  try {
    records = await resolve(hostname);
  } catch {
    return {
      ok: false,
      code: "DESTINATION_UNREACHABLE",
      message: "The hostname could not be resolved.",
    };
  }

  if (records.length === 0) {
    return {
      ok: false,
      code: "DESTINATION_UNREACHABLE",
      message: "The hostname could not be resolved.",
    };
  }

  if (
    records.some((r) =>
      addressBlocked(r.address, r.family, options.allowPrivateLan, Boolean(options.allowLoopback)),
    )
  ) {
    return {
      ok: false,
      code: "DESTINATION_BLOCKED",
      message: "That destination is not permitted by the relay security policy.",
    };
  }

  return {
    ok: true,
    url,
    hostname,
    addresses: records.map((r) => r.address),
  };
}

export { hostnameBlocked, addressBlocked };
