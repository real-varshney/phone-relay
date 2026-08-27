import { randomUUID } from "node:crypto";
import type { WebSocket } from "ws";
import type {
  RelayRequestMessage,
  RelayResponseMessage,
} from "@phone-relay/protocol";
import { RELAY_MAX_BODY_BYTES } from "@phone-relay/protocol";
import type { PhoneStatus } from "@phone-relay/shared-types";

export type ConnectedPhone = {
  deviceId: string;
  name: string;
  phoneIp: string | null;
  ws: WebSocket;
  connectedAt: number;
};

const MAX_BODY = RELAY_MAX_BODY_BYTES;

export class PhoneHub {
  private phone: ConnectedPhone | null = null;
  private pending = new Map<
    string,
    {
      resolve: (msg: RelayResponseMessage) => void;
      reject: (err: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private listeners = new Set<() => void>();

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  get status(): PhoneStatus {
    if (!this.phone) return "DISCONNECTED";
    if (this.phone.ws.readyState === 1) return "CONNECTED";
    return "CONNECTING";
  }

  get connected(): ConnectedPhone | null {
    return this.phone;
  }

  attach(phone: ConnectedPhone): void {
    if (this.phone && this.phone.ws !== phone.ws) {
      try {
        this.phone.ws.close();
      } catch {
        /* ignore */
      }
    }
    this.phone = phone;
    phone.ws.on("close", () => {
      if (this.phone?.ws === phone.ws) {
        this.phone = null;
        this.flushPending(new Error("PHONE_OFFLINE"));
        this.emit();
      }
    });
    this.emit();
  }

  detach(reason = "revoked"): void {
    const p = this.phone;
    this.phone = null;
    this.flushPending(new Error("AUTHENTICATION_FAILED"));
    if (p) {
      try {
        p.ws.send(JSON.stringify({ type: "revoke", reason }));
        p.ws.close();
      } catch {
        /* ignore */
      }
    }
    this.emit();
  }

  handleMessage(raw: string): void {
    let msg: RelayResponseMessage;
    try {
      msg = JSON.parse(raw) as RelayResponseMessage;
    } catch {
      return;
    }
    if (msg.type !== "relay_response" || !msg.requestId) return;
    const pending = this.pending.get(msg.requestId);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(msg.requestId);
    pending.resolve(msg);
  }

  async relay(input: Omit<RelayRequestMessage, "type" | "requestId">): Promise<RelayResponseMessage> {
    const phone = this.phone;
    if (!phone || phone.ws.readyState !== 1) {
      return {
        type: "relay_response",
        requestId: "none",
        status: null,
        headers: {},
        bodyBase64: null,
        error: {
          code: "PHONE_OFFLINE",
          message: "The phone is not reachable. Keep the app open and stay on the same Wi-Fi.",
        },
        durationMs: 0,
      };
    }

    const requestId = randomUUID();
    const payload: RelayRequestMessage = { type: "relay_request", requestId, ...input };
    const bodyBytes = input.bodyBase64 ? Buffer.byteLength(input.bodyBase64, "base64") : 0;
    if (bodyBytes > MAX_BODY) {
      return {
        type: "relay_response",
        requestId,
        status: null,
        headers: {},
        bodyBase64: null,
        error: {
          code: "RESPONSE_TOO_LARGE",
          message: "Request exceeded the configured 50 MB limit.",
        },
        durationMs: 0,
      };
    }

    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        resolve({
          type: "relay_response",
          requestId,
          status: null,
          headers: {},
          bodyBase64: null,
          error: {
            code: "REQUEST_TIMEOUT",
            message: `Request timed out after ${Math.round(input.timeoutMs / 1000)} seconds.`,
          },
          durationMs: input.timeoutMs,
        });
      }, input.timeoutMs + 2000);

      this.pending.set(requestId, { resolve, reject, timer });
      try {
        phone.ws.send(JSON.stringify(payload));
      } catch (err) {
        clearTimeout(timer);
        this.pending.delete(requestId);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  private flushPending(err: Error): void {
    for (const [id, p] of this.pending) {
      clearTimeout(p.timer);
      p.resolve({
        type: "relay_response",
        requestId: id,
        status: null,
        headers: {},
        bodyBase64: null,
        error: { code: err.message, message: err.message },
        durationMs: 0,
      });
    }
    this.pending.clear();
  }
}

export const MAX_RESPONSE_BYTES = MAX_BODY;
