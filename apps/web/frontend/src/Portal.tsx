import { useEffect, useState } from "react";
import { relayApiPath, toPathProxyUrl } from "@phone-relay/protocol";

type PortalReply =
  | { enabled: boolean }
  | { ok: boolean; error?: string; proxyUrl?: string };

function portalCall<T extends PortalReply>(
  type: string,
  payload: Record<string, unknown> = {},
): Promise<T & { timedOut?: boolean }> {
  return new Promise((resolve) => {
    const id = Math.random().toString(36).slice(2);
    const timeout = setTimeout(() => {
      window.removeEventListener("__phone_relay_portal__", onReply);
      resolve({
        timedOut: true,
        ok: false,
        error: "Extension did not respond — reload it at chrome://extensions, then reload this page.",
      } as T & { timedOut: boolean });
    }, 3000);

    function onReply(event: Event) {
      const detail = (event as CustomEvent<{ id: string; result: T }>).detail;
      if (detail?.id !== id) return;
      clearTimeout(timeout);
      window.removeEventListener("__phone_relay_portal__", onReply);
      resolve(detail.result);
    }

    window.addEventListener("__phone_relay_portal__", onReply);
    window.dispatchEvent(
      new CustomEvent("__phone_relay_portal_req__", {
        detail: { id, type, ...payload },
      }),
    );
  });
}

const phoneRelay = {
  tabEnabled: () =>
    portalCall<{ enabled: boolean }>("tabEnabled").then((r) => ({
      enabled: Boolean(r.enabled),
      timedOut: Boolean(r.timedOut),
    })),
  enableTab: () => portalCall<{ ok: boolean; error?: string }>("enableTab"),
  openTarget: (url: string) =>
    portalCall<{ ok: boolean; error?: string; proxyUrl?: string }>("openTarget", { url }),
};

function normalizeTarget(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("Enter a site URL.");
  return new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`).toString();
}

export function Portal() {
  const [target, setTarget] = useState("https://www.hotstar.com");
  const [phoneOk, setPhoneOk] = useState(false);
  const [relayOn, setRelayOn] = useState(false);
  const [extReady, setExtReady] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetch(relayApiPath("status"))
      .then((r) => r.json())
      .then((s) => setPhoneOk(s.phoneStatus === "CONNECTED"));

    let cancelled = false;
    async function syncRelayState() {
      const { enabled, timedOut } = await phoneRelay.tabEnabled();
      if (cancelled) return;
      setExtReady(!timedOut);
      setRelayOn(enabled);
    }
    void syncRelayState();
    return () => {
      cancelled = true;
    };
  }, []);

  async function ensureRelay() {
    if (relayOn) return true;
    const res = await phoneRelay.enableTab();
    if (!res.ok) {
      setErr(res.error ?? "Could not enable routing on this tab.");
      return false;
    }
    setRelayOn(true);
    return true;
  }

  async function openThroughPhone() {
    setErr(null);
    setBusy(true);
    try {
      if (!phoneOk) {
        setErr("Connect the phone on the dashboard first.");
        return;
      }
      const abs = normalizeTarget(target);
      if (!(await ensureRelay())) return;

      const res = await phoneRelay.openTarget(abs);
      if (!res.ok) {
        // Fallback when extension popup already enabled routing but openTarget failed
        if (relayOn) {
          window.location.href = toPathProxyUrl(abs);
          return;
        }
        setErr(res.error ?? "Extension could not open the site.");
        return;
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Invalid URL.");
    } finally {
      setBusy(false);
    }
  }

  const extLabel = !extReady
    ? "Not detected — reload extension at chrome://extensions, then reload this page"
    : relayOn
      ? "Routing ON for this tab"
      : "Click Open — routing enables automatically";

  return (
    <div className="shell portal-shell">
      <div className="card portal-card">
        <h1>Phone Relay Portal</h1>
        <p className="sub">
          Opens blocked sites without naming them on the laptop network — only <code>127.0.0.1:3000/proxy/…</code>{" "}
          is used. The phone fetches the real site.
        </p>

        <div className={`row ${phoneOk ? "" : "warn"}`}>
          <span className="k">Phone</span>
          <span className="v">{phoneOk ? "Connected" : "Not connected — fix on dashboard"}</span>
        </div>
        <div className="row">
          <span className="k">Extension</span>
          <span className="v">{extLabel}</span>
        </div>

        <ol className="steps">
          <li>Install / reload the Phone Relay extension.</li>
          <li>Connect the phone on the <a href="/">dashboard</a>.</li>
          <li>Enter the site below — do not type it in the Chrome address bar.</li>
        </ol>

        <label>Site URL</label>
        <input
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          placeholder="https://www.hotstar.com"
          onKeyDown={(e) => {
            if (e.key === "Enter") void openThroughPhone();
          }}
        />

        {err ? <p className="portal-err">{err}</p> : null}

        <div className="actions">
          <button disabled={busy} onClick={() => void openThroughPhone()}>
            {busy ? "Opening…" : "Open through phone"}
          </button>
          <a className="btn secondary" href="/">
            Dashboard
          </a>
        </div>
      </div>
    </div>
  );
}
