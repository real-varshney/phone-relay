import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { relayApiPath } from "@phone-relay/protocol";
import { createApp } from "./server.ts";
import { connectFakePhone } from "./fake-phone.ts";

describe("proxy through fake phone", () => {
  let close: () => Promise<void>;
  let origin: string;
  let fixtureOrigin: string;

  beforeAll(async () => {
    const fixture = createServer((req, res) => {
      if (req.url === "/hello") {
        res.writeHead(200, { "content-type": "text/plain" });
        res.end("ok-from-fixture");
        return;
      }
      if (req.url === "/echo" && req.method === "POST") {
        const chunks: Buffer[] = [];
        req.on("data", (c) => chunks.push(c));
        req.on("end", () => {
          res.writeHead(201, { "content-type": "application/json" });
          res.end(JSON.stringify({ body: Buffer.concat(chunks).toString("utf8") }));
        });
        return;
      }
      res.writeHead(404);
      res.end();
    });
    await new Promise<void>((r) => fixture.listen(0, "127.0.0.1", r));
    const fPort = (fixture.address() as AddressInfo).port;
    fixtureOrigin = `http://127.0.0.1:${fPort}`;

    const { server, state } = await createApp({ port: 0, policyTestMode: true });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const port = (server.address() as AddressInfo).port;
    state.port = port;
    origin = `http://127.0.0.1:${port}`;

    const pairing = await fetch(`${origin}${relayApiPath("pairing")}`).then((r) => r.json());
    await connectFakePhone({
      url: `ws://127.0.0.1:${port}/ws/phone`,
      code: pairing.code,
      name: "TestPhone",
    });

    close = async () => {
      server.close();
      fixture.close();
    };
  });

  afterAll(async () => {
    await close?.();
  });

  it("GETs through /proxy?curl=", async () => {
    const url = `${origin}/proxy?curl=${encodeURIComponent(`${fixtureOrigin}/hello`)}`;
    const res = await fetch(url);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok-from-fixture");
    expect(res.headers.get("x-relay-via")).toBe("phone");
  });

  it("POSTs a body through the relay", async () => {
    const url = `${origin}/proxy?curl=${encodeURIComponent(`${fixtureOrigin}/echo`)}`;
    const res = await fetch(url, { method: "POST", body: "hello-phone" });
    expect(res.status).toBe(201);
    const json = (await res.json()) as { body: string };
    expect(json.body).toBe("hello-phone");
  });

  it("blocks destinations when test mode is off", async () => {
    const { server, state } = await createApp({ port: 0, policyTestMode: false });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const port = (server.address() as AddressInfo).port;
    state.port = port;
    const url = `http://127.0.0.1:${port}/proxy?curl=${encodeURIComponent("http://127.0.0.1/secret")}`;
    const res = await fetch(url);
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("DESTINATION_BLOCKED");
    server.close();
  });
});
