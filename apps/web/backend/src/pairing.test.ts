import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PairingStore } from "./pairing.ts";

describe("PairingStore", () => {
  it("accepts a fresh code once", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "pair-"));
    const store = new PairingStore(path.join(dir, "d.json"));
    const { code } = store.issueCode();
    expect(store.consumeCode(code)).toBe(true);
    expect(store.consumeCode(code)).toBe(false);
    await rm(dir, { recursive: true, force: true });
  });

  it("verifies the session token it created", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "pair-"));
    const store = new PairingStore(path.join(dir, "d.json"));
    const { sessionToken, deviceId } = store.createDevice("Pixel");
    await store.persist();
    const found = store.verifyToken(sessionToken);
    expect(found?.deviceId).toBe(deviceId);
    expect(store.verifyToken("nope")).toBeNull();
    await rm(dir, { recursive: true, force: true });
  });
});
