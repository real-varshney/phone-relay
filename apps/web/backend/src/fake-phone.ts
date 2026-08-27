import { WebSocket } from "ws";
import type { RelayRequestMessage, RelayResponseMessage } from "@phone-relay/protocol";

export type FakePhone = {
  close: () => void;
  deviceId: string;
};

export async function connectFakePhone(opts: {
  url: string;
  code?: string;
  token?: string;
  name?: string;
}): Promise<FakePhone> {
  const ws = new WebSocket(opts.url);
  await new Promise<void>((resolve, reject) => {
    ws.once("open", () => resolve());
    ws.once("error", reject);
  });
  ws.send(
    JSON.stringify({
      type: "hello",
      code: opts.code,
      token: opts.token,
      name: opts.name ?? "Fake Phone",
    }),
  );

  const deviceId = await new Promise<string>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("hello timeout")), 5000);
    ws.once("message", (buf) => {
      clearTimeout(t);
      const msg = JSON.parse(String(buf)) as {
        type: string;
        deviceId?: string;
        code?: string;
        message?: string;
      };
      if (msg.type === "hello_ok" && msg.deviceId) resolve(msg.deviceId);
      else reject(new Error(msg.message ?? "hello failed"));
    });
  });

  ws.on("message", async (buf) => {
    const msg = JSON.parse(String(buf)) as RelayRequestMessage & { type: string };
    if (msg.type !== "relay_request") return;
    const started = Date.now();
    try {
      const headers = new Headers(msg.headers);
      headers.delete("accept-encoding");
      headers.set("Accept-Encoding", "identity");
      const res = await fetch(msg.url, {
        method: msg.method,
        headers,
        body: msg.bodyBase64 ? Buffer.from(msg.bodyBase64, "base64") : undefined,
        signal: AbortSignal.timeout(msg.timeoutMs),
        redirect: "follow",
      });
      const bytes = Buffer.from(await res.arrayBuffer());
      const outHeaders: Record<string, string> = {};
      res.headers.forEach((v, k) => {
        const key = k.toLowerCase();
        if (key === "content-encoding" || key === "content-length" || key === "transfer-encoding") {
          return;
        }
        outHeaders[k] = v;
      });
      const reply: RelayResponseMessage = {
        type: "relay_response",
        requestId: msg.requestId,
        status: res.status,
        headers: outHeaders,
        bodyBase64: bytes.toString("base64"),
        error: null,
        durationMs: Date.now() - started,
      };
      ws.send(JSON.stringify(reply));
    } catch (err) {
      const reply: RelayResponseMessage = {
        type: "relay_response",
        requestId: msg.requestId,
        status: null,
        headers: {},
        bodyBase64: null,
        error: {
          code: "DESTINATION_UNREACHABLE",
          message: err instanceof Error ? err.message : String(err),
        },
        durationMs: Date.now() - started,
      };
      ws.send(JSON.stringify(reply));
    }
  });

  return {
    deviceId,
    close: () => ws.close(),
  };
}

const isCli = process.argv[1]?.replaceAll("\\", "/").includes("fake-phone");
if (isCli) {
  const port = process.env.PORT ?? "3000";
  const code = process.env.PAIR_CODE;
  if (!code) {
    console.error("Set PAIR_CODE to the dashboard pairing code (digits only).");
    process.exit(1);
  }
  const phone = await connectFakePhone({
    url: `ws://127.0.0.1:${port}/ws/phone`,
    code,
    name: "Fake Phone",
  });
  console.log("Fake phone connected", phone.deviceId);
}
