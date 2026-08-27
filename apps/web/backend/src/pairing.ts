import { createHash, randomBytes, randomInt } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type StoredDevice = {
  deviceId: string;
  name: string;
  tokenHash: string;
  lastSeen: number | null;
};

export type PairingCode = {
  code: string;
  expiresAt: number;
};

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function now(): number {
  return Date.now();
}

export class PairingStore {
  private codes = new Map<string, PairingCode>();
  private devices = new Map<string, StoredDevice>();
  private failUntil = 0;
  private fails = 0;

  constructor(private readonly filePath: string) {}

  async load(): Promise<void> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as { devices?: StoredDevice[] };
      for (const d of parsed.devices ?? []) this.devices.set(d.deviceId, d);
    } catch {
      /* first run */
    }
  }

  async persist(): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(
      this.filePath,
      JSON.stringify({ devices: [...this.devices.values()] }, null, 2),
    );
  }

  issueCode(): { display: string; code: string; expiresAt: number } {
    const n = randomInt(0, 1_000_000);
    const code = n.toString().padStart(6, "0");
    const expiresAt = now() + 10 * 60 * 1000;
    this.codes.set(code, { code, expiresAt });
    const display = `${code.slice(0, 3)}-${code.slice(3)}`;
    return { display, code, expiresAt };
  }

  consumeCode(raw: string): boolean {
    if (now() < this.failUntil) return false;
    const code = raw.replace(/\D/g, "");
    const row = this.codes.get(code);
    if (!row || row.expiresAt < now()) {
      this.fail();
      return false;
    }
    this.codes.delete(code);
    this.fails = 0;
    return true;
  }

  createDevice(name: string): { deviceId: string; sessionToken: string } {
    const deviceId = randomBytes(16).toString("hex");
    const sessionToken = randomBytes(32).toString("hex");
    this.devices.set(deviceId, {
      deviceId,
      name: name || "Phone",
      tokenHash: hashToken(sessionToken),
      lastSeen: now(),
    });
    void this.persist();
    return { deviceId, sessionToken };
  }

  verifyToken(token: string): StoredDevice | null {
    if (now() < this.failUntil) return null;
    const h = hashToken(token);
    for (const d of this.devices.values()) {
      if (d.tokenHash === h) {
        d.lastSeen = now();
        this.fails = 0;
        return d;
      }
    }
    this.fail();
    return null;
  }

  revoke(deviceId?: string): void {
    if (deviceId) this.devices.delete(deviceId);
    else this.devices.clear();
    void this.persist();
  }

  list(): StoredDevice[] {
    return [...this.devices.values()];
  }

  touch(deviceId: string): void {
    const d = this.devices.get(deviceId);
    if (d) d.lastSeen = now();
  }

  private fail(): void {
    this.fails += 1;
    if (this.fails >= 8) this.failUntil = now() + 15_000;
  }
}
