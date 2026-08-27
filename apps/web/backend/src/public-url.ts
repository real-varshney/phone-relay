import { primaryLanIPv4 } from "./lan.ts";

export function getPublicBaseUrl(port: number): string {
  const fromEnv = process.env.PUBLIC_URL?.trim().replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  return `http://${primaryLanIPv4()}:${port}`;
}

export function getPublicWsUrl(port: number): string {
  const base = getPublicBaseUrl(port);
  try {
    const u = new URL(base);
    const proto = u.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${u.host}/ws/phone`;
  } catch {
    return `ws://${primaryLanIPv4()}:${port}/ws/phone`;
  }
}

export function isUsingPublicUrl(): boolean {
  return Boolean(process.env.PUBLIC_URL?.trim());
}

export function phonePairingUrl(port: number, code: string): string {
  const base = getPublicBaseUrl(port);
  return `${base}/phone?code=${code}`;
}
