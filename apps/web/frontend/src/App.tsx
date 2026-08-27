import { useEffect, useMemo, useState } from "react";
import { relayApiPath, toPathProxyUrl } from "@phone-relay/protocol";
import { Portal } from "./Portal";

type Status = {
  phoneStatus: "DISCONNECTED" | "CONNECTING" | "CONNECTED" | "ERROR";
  phone: { deviceId: string; name: string; phoneIp: string | null } | null;
  laptopLanIp: string;
  laptopLanIps?: string[];
  relayPort: number;
  publicUrl?: string;
  publicWsUrl?: string;
  usePublicUrl?: boolean;
  allowPrivateLan: boolean;
  pairing: { display: string; expiresAt: number; qrUrl: string };
  devices: Array<{ deviceId: string; name: string; status: string; lastSeen: number | null }>;
};

type Pairing = { display: string; code: string; qrUrl: string; qrDataUrl: string };
type LogEvent = { time: string; event: string; host?: string; method?: string; status?: number; durationMs?: number; code?: string };

function statusLabel(s: Status["phoneStatus"] | undefined): string {
  switch (s) {
    case "CONNECTED":
      return "Connected";
    case "CONNECTING":
      return "Connecting…";
    case "ERROR":
      return "Error";
    default:
      return "Waiting for phone";
  }
}

function PhonePage() {
  const params = new URLSearchParams(location.search);
  const code = params.get("code") ?? "";
  return (
    <div className="shell phone-page">
      <div className="card">
        <h1>Phone Relay</h1>
        <p className="sub">Pairing helper — open the Android app and enter this code.</p>
        <div className="code">{code.replace(/(\d{3})(\d{3})/, "$1-$2")}</div>
      </div>
    </div>
  );
}

function Dashboard() {
  const [status, setStatus] = useState<Status | null>(null);
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [url, setUrl] = useState("https://httpbin.org/ip");
  const [logs, setLogs] = useState<LogEvent[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    const ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws/operator`);
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data) as { type: string; payload: Status };
      if (msg.type === "status") setStatus(msg.payload);
    };
    void fetch(relayApiPath("pairing")).then((r) => r.json()).then(setPairing);
    void fetch(relayApiPath("status")).then((r) => r.json()).then(setStatus);
    void fetch(relayApiPath("logs")).then((r) => r.json()).then((j) => setLogs(j.events ?? []));
    return () => ws.close();
  }, []);

  const phoneDot = status?.phoneStatus === "CONNECTED" ? "ok" : status?.phoneStatus === "CONNECTING" ? "warn" : "bad";
  const port = status?.relayPort ?? 3000;
  const lanIp = status?.laptopLanIp ?? "—";
  const healthUrl = lanIp !== "—" ? `http://${lanIp}:${port}/health` : null;
  const connected = status?.phoneStatus === "CONNECTED";

  const portalHref = useMemo(() => {
    try {
      return toPathProxyUrl(new URL(url).toString(), location.origin);
    } catch {
      return "/portal";
    }
  }, [url]);

  async function refreshPairing() {
    setPairing(await fetch(relayApiPath("pairing"), { method: "POST" }).then((r) => r.json()));
  }

  async function revoke() {
    await fetch(relayApiPath("revoke"), { method: "POST" });
  }

  async function toggleLan(allowPrivateLan: boolean) {
    setStatus(
      await fetch(relayApiPath("settings"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ allowPrivateLan }),
      }).then((r) => r.json()),
    );
  }

  async function clearLogs() {
    await fetch(relayApiPath("logs"), { method: "DELETE" });
    setLogs([]);
  }

  return (
    <div className="shell">
      <header className="hero">
        <div className="hero-text">
          <p className="eyebrow">Phone Relay</p>
          <h1>Browse through your phone</h1>
          <p className="sub">Laptop traffic goes through this server. Your phone fetches the real sites.</p>
        </div>
        <div className={`status-pill ${phoneDot}`}>
          <span className="dot" />
          {statusLabel(status?.phoneStatus)}
        </div>
      </header>

      <div className="grid">
        <section className="card card-primary">
          <h2>Connect phone</h2>
          <ol className="steps compact">
            <li>Open the <strong>Phone Relay</strong> app on Android.</li>
            <li>Tap <strong>Scan laptop QR code</strong>.</li>
            <li>When status shows Connected, open the portal below.</li>
          </ol>

          <div className="pairing-block">
            {pairing?.qrDataUrl ? (
              <div className="qr">
                <img alt="Pairing QR" src={pairing.qrDataUrl} width={180} height={180} />
              </div>
            ) : null}
            <div className="pairing-meta">
              <div className="code">{pairing?.display ?? status?.pairing.display ?? "------"}</div>
              <p className="hint">Same Wi‑Fi — no tunnel needed</p>
              {healthUrl ? (
                <p className="hint mono">
                  Phone test:{" "}
                  <a href={healthUrl} target="_blank" rel="noreferrer">
                    {healthUrl}
                  </a>
                </p>
              ) : null}
              <div className="actions">
                <button type="button" className="secondary" onClick={() => void refreshPairing()}>
                  New code
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="card">
          <h2>Status</h2>
          <dl className="stat-list">
            <div className="stat">
              <dt>Phone</dt>
              <dd>{status?.phone?.phoneIp ?? "—"}</dd>
            </div>
            <div className="stat">
              <dt>Laptop LAN</dt>
              <dd className="mono">{lanIp}</dd>
            </div>
            <div className="stat">
              <dt>Port</dt>
              <dd>{port}</dd>
            </div>
            <div className="stat">
              <dt>Mode</dt>
              <dd>{status?.usePublicUrl ? "Remote tunnel" : "Same Wi‑Fi"}</dd>
            </div>
          </dl>

          {status?.laptopLanIps && status.laptopLanIps.length > 1 ? (
            <p className="hint">All IPs: {status.laptopLanIps.join(", ")}</p>
          ) : null}

          {!connected ? (
            <p className="hint warn">
              Phone can&apos;t reach the laptop? Run <code>shortcut/Fix Firewall.bat</code> as Administrator, then retry
              the health link on your phone.
            </p>
          ) : null}

          <div className="actions">
            <a className="btn" href="/portal">
              Open portal
            </a>
            {connected ? (
              <button type="button" className="danger" onClick={() => void revoke()}>
                Disconnect
              </button>
            ) : null}
          </div>
        </section>
      </div>

      <section className="card card-flat">
        <h2>Quick test</h2>
        <p className="sub">Try a URL through the phone tunnel (use the portal for blocked sites).</p>
        <label htmlFor="test-url">URL</label>
        <input id="test-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com" />
        <div className="actions">
          <a className="btn secondary" href={portalHref}>
            Open via proxy
          </a>
        </div>
      </section>

      <section className="card card-flat">
        <button type="button" className="link-btn" onClick={() => setShowAdvanced((v) => !v)}>
          {showAdvanced ? "Hide" : "Show"} advanced settings & logs
        </button>
        {showAdvanced ? (
          <div className="advanced">
            <div className="actions">
              <button type="button" className="secondary" onClick={() => void toggleLan(!(status?.allowPrivateLan ?? false))}>
                {status?.allowPrivateLan ? "LAN destinations: on" : "LAN destinations: off"}
              </button>
              <button type="button" className="secondary" onClick={() => void clearLogs()}>
                Clear logs
              </button>
            </div>
            {(status?.devices ?? []).length > 0 ? (
              <>
                <h3>Devices</h3>
                {(status?.devices ?? []).map((d) => (
                  <div className="row" key={d.deviceId}>
                    <span className="k">{d.name}</span>
                    <span className="v">{d.status}</span>
                  </div>
                ))}
              </>
            ) : null}
            <h3>Logs</h3>
            <div className="logs">
              {logs.length === 0 ? <p className="hint">No events yet.</p> : null}
              {logs.map((e, i) => (
                <div key={i}>
                  {e.time} {e.event} {e.method ?? ""} {e.host ?? ""} {e.status ?? e.code ?? ""}{" "}
                  {e.durationMs ? `${e.durationMs}ms` : ""}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

export function App() {
  if (location.pathname.startsWith("/phone")) return <PhonePage />;
  if (location.pathname === "/portal" || location.pathname.startsWith("/portal/")) return <Portal />;
  return <Dashboard />;
}
