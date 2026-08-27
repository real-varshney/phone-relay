import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ViteDevServer } from "vite";
import { WebSocketServer, type WebSocket } from "ws";
import QRCode from "qrcode";
import type { PhoneHelloMessage } from "@phone-relay/protocol";
import { relayApiSubpath } from "@phone-relay/protocol";
import { PairingStore } from "./pairing.ts";
import { EventLog } from "./log.ts";
import { lanIPv4, primaryLanIPv4, isLoopbackAddress } from "./lan.ts";
import { getPublicBaseUrl, getPublicWsUrl, isUsingPublicUrl, phonePairingUrl } from "./public-url.ts";
import { PhoneHub } from "./phone-hub.ts";
import { cachedMediaCdnSite, leakedVideoPathWithCdn, parseRelayCdnCookie } from "./cdn-host-cache.ts";
import { handleProxy } from "./proxy.ts";
import {
  isDefiniteLeakedMediaSegment,
  isLeakedCdnRootPath,
  isLeakedMediaSegment,
  isLeakedSiteAsset,
  isLeakedVideoCdnPath,
  leakedMediaToProxyPath,
  relaySiteFromHeaders,
  toPathProxyRequest,
} from "./leaked-asset.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../../..");
dotenv.config({ path: path.join(REPO_ROOT, ".env") });
const BACKEND_DIR = path.resolve(__dirname, "..");
const FRONTEND_DIR = path.resolve(__dirname, "../../frontend");
const DATA_DIR = path.join(BACKEND_DIR, "data");

export type AppState = {
  pairing: PairingStore;
  hub: PhoneHub;
  log: EventLog;
  allowPrivateLan: boolean;
  pairingDisplay: { display: string; code: string; expiresAt: number };
  port: number;
};

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  return JSON.parse(raw);
}

function snapshot(state: AppState) {
  const phone = state.hub.connected;
  return {
    phoneStatus: state.hub.status,
    phone: phone
      ? {
          deviceId: phone.deviceId,
          name: phone.name,
          phoneIp: phone.phoneIp,
        }
      : null,
    laptopLanIps: lanIPv4(),
    laptopLanIp: primaryLanIPv4(),
    relayPort: state.port,
    publicUrl: getPublicBaseUrl(state.port),
    publicWsUrl: getPublicWsUrl(state.port),
    usePublicUrl: isUsingPublicUrl(),
    allowPrivateLan: state.allowPrivateLan,
    pairing: {
      display: state.pairingDisplay.display,
      expiresAt: state.pairingDisplay.expiresAt,
      qrUrl: phonePairingUrl(state.port, state.pairingDisplay.code),
    },
    devices: state.pairing.list().map((d) => ({
      deviceId: d.deviceId,
      name: d.name,
      lastSeen: d.lastSeen,
      status:
        phone?.deviceId === d.deviceId ? state.hub.status : "DISCONNECTED",
    })),
  };
}

export async function createApp(opts: { port: number; policyTestMode?: boolean }) {
  const pairing = new PairingStore(path.join(DATA_DIR, "devices.json"));
  await pairing.load();
  const log = new EventLog(path.join(DATA_DIR, "events.jsonl"));
  await log.load();
  const hub = new PhoneHub();
  const state: AppState = {
    pairing,
    hub,
    log,
    allowPrivateLan: false,
    pairingDisplay: pairing.issueCode(),
    port: opts.port,
  };

  const operatorClients = new Set<WebSocket>();
  const broadcast = () => {
    const msg = JSON.stringify({ type: "status", payload: snapshot(state) });
    for (const ws of operatorClients) {
      if (ws.readyState === ws.OPEN) ws.send(msg);
    }
  };
  hub.onChange(broadcast);

  const injectPath = path.join(__dirname, "relay-inject.js");
  const adFiltersPath = path.join(REPO_ROOT, "apps/extension/ad-filters.js");
  let vite: ViteDevServer | null = null;

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", `http://127.0.0.1:${opts.port}`);

      if (url.pathname === "/ad-filters.js") {
        const { readFile } = await import("node:fs/promises");
        const body = await readFile(adFiltersPath, "utf8");
        res.writeHead(200, {
          "content-type": "application/javascript; charset=utf-8",
          "cache-control": "no-store",
        });
        res.end(body);
        return;
      }

      if (url.pathname === "/relay-inject.js") {
        const { readFile } = await import("node:fs/promises");
        const body = await readFile(injectPath, "utf8");
        res.writeHead(200, {
          "content-type": "application/javascript; charset=utf-8",
          "cache-control": "no-store",
        });
        res.end(body);
        return;
      }

      if (url.pathname.startsWith("/proxy")) {
        await handleProxy(req, res, {
          hub,
          log,
          origin: `http://127.0.0.1:${opts.port}`,
          allowPrivateLan: () => state.allowPrivateLan,
          policyTestMode: Boolean(opts.policyTestMode),
        });
        return;
      }

      // CDN segments with root-absolute paths (/video_h264/…/seg.m4s) miss /proxy and hit :3000 directly.
      if (
        isLoopbackAddress(req.socket.remoteAddress) &&
        isLeakedMediaSegment(url.pathname) &&
        (req.method === "GET" || req.method === "HEAD")
      ) {
        const proxyPath =
          leakedMediaToProxyPath(
            typeof req.headers.referer === "string" ? req.headers.referer : undefined,
            url.pathname,
            url.search,
          ) ??
          (() => {
            if (!isLeakedCdnRootPath(url.pathname)) return null;
            const site =
              cachedMediaCdnSite(req.socket.remoteAddress ?? "local") ??
              parseRelayCdnCookie(req.headers.cookie);
            return site ? leakedVideoPathWithCdn(url.pathname, url.search, site) : null;
          })();
        if (proxyPath) {
          req.url = proxyPath;
          await handleProxy(req, res, {
            hub,
            log,
            origin: `http://127.0.0.1:${opts.port}`,
            allowPrivateLan: () => state.allowPrivateLan,
            policyTestMode: Boolean(opts.policyTestMode),
          });
          return;
        }
        if (isDefiniteLeakedMediaSegment(url.pathname)) {
          json(res, 404, {
            code: "LEAKED_MEDIA",
            message:
              "Media segment reached the dashboard host without /proxy. Reload the watch page after updating the relay.",
          });
          return;
        }
      }

      // Path-absolute assets (/assets-x/…) hit 127.0.0.1:3000 directly when the
      // proxied page origin is localhost. Recover target site from Referer.
      if (
        isLoopbackAddress(req.socket.remoteAddress) &&
        isLeakedSiteAsset(url.pathname) &&
        (req.method === "GET" || req.method === "HEAD")
      ) {
        const site = relaySiteFromHeaders(req);
        if (site) {
          const proxyPath = toPathProxyRequest(site, url.pathname, url.search);
          const accept = typeof req.headers.accept === "string" ? req.headers.accept : "";
          if (req.method === "GET" && accept.includes("text/html")) {
            res.writeHead(302, { Location: `http://127.0.0.1:${opts.port}${proxyPath}` });
            res.end();
            return;
          }
          req.url = proxyPath;
          await handleProxy(req, res, {
            hub,
            log,
            origin: `http://127.0.0.1:${opts.port}`,
            allowPrivateLan: () => state.allowPrivateLan,
            policyTestMode: Boolean(opts.policyTestMode),
          });
          return;
        }
      }

      if (url.pathname === "/health" && req.method === "GET") {
        json(res, 200, {
          ok: true,
          port: opts.port,
          lanIp: primaryLanIPv4(),
          lanIps: lanIPv4(),
          phoneTestUrl: `http://${primaryLanIPv4()}:${opts.port}/health`,
        });
        return;
      }

      const apiRoute = relayApiSubpath(url.pathname);

      if (apiRoute === "status" && req.method === "GET") {
        json(res, 200, snapshot(state));
        return;
      }

      if (apiRoute === "pairing" && req.method === "POST") {
        state.pairingDisplay = pairing.issueCode();
        const qrUrl = phonePairingUrl(opts.port, state.pairingDisplay.code);
        const qrDataUrl = await QRCode.toDataURL(qrUrl, { margin: 1, width: 280 });
        json(res, 200, { ...state.pairingDisplay, qrUrl, qrDataUrl });
        broadcast();
        return;
      }

      if (apiRoute === "pairing" && req.method === "GET") {
        const qrUrl = phonePairingUrl(opts.port, state.pairingDisplay.code);
        const qrDataUrl = await QRCode.toDataURL(qrUrl, { margin: 1, width: 280 });
        json(res, 200, { ...state.pairingDisplay, qrUrl, qrDataUrl });
        return;
      }

      if (apiRoute === "revoke" && req.method === "POST") {
        hub.detach("dashboard-disconnect");
        pairing.revoke();
        state.pairingDisplay = pairing.issueCode();
        json(res, 200, { ok: true });
        broadcast();
        return;
      }

      if (apiRoute === "settings" && req.method === "POST") {
        const body = (await readJson(req)) as { allowPrivateLan?: boolean };
        if (typeof body.allowPrivateLan === "boolean") {
          state.allowPrivateLan = body.allowPrivateLan;
        }
        json(res, 200, snapshot(state));
        broadcast();
        return;
      }

      if (apiRoute === "logs" && req.method === "GET") {
        json(res, 200, { events: log.list() });
        return;
      }

      if (apiRoute === "logs" && req.method === "DELETE") {
        await log.clear();
        json(res, 200, { ok: true });
        return;
      }

      if (apiRoute === "extension/hello" && req.method === "POST") {
        json(res, 200, { ok: true, phoneStatus: hub.status });
        return;
      }

      if (apiRoute === "diagnostics" && req.method === "GET") {
        json(res, 200, {
          laptopLanIp: primaryLanIPv4(),
          laptopLanIps: lanIPv4(),
          publicUrl: getPublicBaseUrl(opts.port),
          publicWsUrl: getPublicWsUrl(opts.port),
          phoneReachable: hub.status === "CONNECTED",
          authentication: hub.status === "CONNECTED" ? "OK" : "NONE",
          proxy: `http://127.0.0.1:${opts.port}/proxy?curl=`,
        });
        return;
      }

      res.setHeader("x-phone-relay", "dashboard");

      if (process.env.NODE_ENV !== "test") {
        if (vite) {
          vite.middlewares(req, res, () => {
            res.writeHead(404);
            res.end("Not found");
          });
          return;
        }
        console.error("[dashboard] Vite dev server is not initialized — run npm install from phone-relay root");
      }

      res.writeHead(404);
      res.end("Not found");
    } catch (err) {
      console.error(err);
      if (!res.headersSent) json(res, 500, { code: "BAD_REQUEST", message: "Server error" });
    }
  });

  const wss = new WebSocketServer({ noServer: true });

  if (process.env.NODE_ENV !== "test") {
    const { createServer: createVite } = await import("vite");
    vite = await createVite({
      configFile: path.join(FRONTEND_DIR, "vite.config.ts"),
      root: FRONTEND_DIR,
      appType: "spa",
      server: {
        middlewareMode: true,
        hmr: { server },
        allowedHosts: true,
      },
    });
    await Promise.all(Object.values(vite.environments).map((env) => env.listen(vite!)));
  }

  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${opts.port}`);
    if (url.pathname === "/ws/phone") {
      const remote = (req.socket.remoteAddress ?? "").replace(/^::ffff:/, "");
      console.log(`[ws/phone] upgrade from ${remote}`);
      void state.log.append({ event: "phone_ws_upgrade", host: remote });
      wss.handleUpgrade(req, socket, head, (ws) => {
        void handlePhoneSocket(ws, req, state, broadcast);
      });
      return;
    }
    if (url.pathname === "/ws/operator") {
      wss.handleUpgrade(req, socket, head, (ws) => {
        operatorClients.add(ws);
        ws.send(JSON.stringify({ type: "status", payload: snapshot(state) }));
        ws.on("close", () => operatorClients.delete(ws));
      });
      return;
    }
    // Vite HMR attaches its own upgrade listener via hmr.server above.
  });

  void injectPath;
  return { server, state, vite };
}

async function handlePhoneSocket(
  ws: WebSocket,
  req: IncomingMessage,
  state: AppState,
  broadcast: () => void,
): Promise<void> {
  const remote = (req.socket.remoteAddress ?? "").replace(/^::ffff:/, "");
  console.log(`[ws/phone] socket open from ${remote}, waiting for hello`);
  const timer = setTimeout(() => ws.close(), 15_000);

  ws.once("message", (data) => {
    clearTimeout(timer);
    let msg: PhoneHelloMessage;
    try {
      msg = JSON.parse(String(data)) as PhoneHelloMessage;
    } catch {
      void state.log.append({ event: "phone_hello_invalid", host: remote });
      ws.send(JSON.stringify({ type: "error", code: "AUTHENTICATION_FAILED", message: "Invalid hello" }));
      ws.close();
      return;
    }
    if (msg.type !== "hello") {
      ws.close();
      return;
    }
    console.log(`[ws/phone] hello from ${msg.name ?? "phone"} (${remote})`);
    void state.log.append({ event: "phone_hello", device: msg.name ?? "Phone", host: remote });

    let deviceId: string;
    let sessionToken: string;
    let name: string;

    if (msg.token) {
      const device = state.pairing.verifyToken(msg.token);
      if (!device) {
        ws.send(
          JSON.stringify({
            type: "error",
            code: "AUTHENTICATION_FAILED",
            message: "Pairing expired or disconnect was used. Scan the QR again.",
          }),
        );
        ws.close();
        return;
      }
      deviceId = device.deviceId;
      sessionToken = msg.token;
      name = device.name;
    } else if (msg.code) {
      if (!state.pairing.consumeCode(msg.code)) {
        ws.send(
          JSON.stringify({
            type: "error",
            code: "AUTHENTICATION_FAILED",
            message: "Invalid or expired pairing code.",
          }),
        );
        ws.close();
        return;
      }
      const created = state.pairing.createDevice(msg.name ?? "Phone");
      deviceId = created.deviceId;
      sessionToken = created.sessionToken;
      name = msg.name ?? "Phone";
    } else {
      ws.close();
      return;
    }

    ws.send(
      JSON.stringify({
        type: "hello_ok",
        deviceId,
        sessionToken,
        laptopLanIp: primaryLanIPv4(),
      }),
    );

    state.hub.attach({
      deviceId,
      name,
      phoneIp: isLoopbackAddress(remote) ? "127.0.0.1" : remote,
      ws,
      connectedAt: Date.now(),
    });
    void state.log.append({ event: "pair", device: name });
    broadcast();

    ws.on("message", (buf) => {
      const text = String(buf);
      state.hub.handleMessage(text);
      try {
        const parsed = JSON.parse(text) as { type?: string };
        if (parsed.type === "heartbeat") {
          ws.send(JSON.stringify({ type: "heartbeat_ok" }));
          state.pairing.touch(deviceId);
        }
      } catch {
        /* binary not used in v1 */
      }
    });
  });
}

export { snapshot };
