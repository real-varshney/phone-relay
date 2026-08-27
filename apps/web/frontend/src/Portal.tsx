import { useEffect, useState } from "react";
import {
  PROXY_RESOURCE_TYPE_OPTIONS,
  isFullProxyMode,
  isStylesheetOnlyMode,
  normalizeProxyResourceTypes,
  relayApiPath,
  toPathProxyUrl,
  type ProxyResourceTypeId,
} from "@phone-relay/protocol";

type PortalReply =
  | { enabled: boolean }
  | { ok: boolean; error?: string; proxyUrl?: string }
  | { enabled: boolean };

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
  openTarget: (url: string, proxyTypes?: ProxyResourceTypeId[]) =>
    portalCall<{ ok: boolean; error?: string; proxyUrl?: string }>("openTarget", { url, proxyTypes }),
  getAdBlock: () => portalCall<{ enabled: boolean }>("getAdBlock"),
  setAdBlock: (enabled: boolean) => portalCall<{ ok: boolean }>("setAdBlock", { enabled }),
};

function normalizeTarget(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("Enter a site URL.");
  const abs = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`).toString();
  try {
    const u = new URL(abs);
    if (u.hostname === "www.hotstar.com" && (u.pathname === "/" || u.pathname === "")) {
      u.pathname = "/in";
      return u.toString();
    }
  } catch {
    /* ignore */
  }
  return abs;
}

function isStreamingSite(url: string): boolean {
  try {
    return new URL(url).hostname.includes("hotstar.com");
  } catch {
    return false;
  }
}

const PROXY_TYPES_STORAGE_KEY = "phone-relay-proxy-types";

function loadStoredProxyTypes(): ProxyResourceTypeId[] {
  try {
    const raw = localStorage.getItem(PROXY_TYPES_STORAGE_KEY);
    if (raw) return normalizeProxyResourceTypes(JSON.parse(raw));
  } catch {
    /* ignore */
  }
  return normalizeProxyResourceTypes(undefined);
}

function initialPortalTarget(): string {
  const fromQuery = new URLSearchParams(location.search).get("target");
  if (fromQuery?.trim()) return fromQuery.trim();
  return "https://www.hotstar.com/in";
}

export function Portal() {
  const [target, setTarget] = useState(initialPortalTarget);
  const [phoneOk, setPhoneOk] = useState(false);
  const [relayOn, setRelayOn] = useState(false);
  const [extReady, setExtReady] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [proxyTypes, setProxyTypes] = useState<ProxyResourceTypeId[]>(loadStoredProxyTypes);
  const [adBlock, setAdBlock] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    localStorage.setItem(PROXY_TYPES_STORAGE_KEY, JSON.stringify(proxyTypes));
  }, [proxyTypes]);

  useEffect(() => {
    void fetch(relayApiPath("status"))
      .then((r) => r.json())
      .then((s) => setPhoneOk(s.phoneStatus === "CONNECTED"));

    let cancelled = false;
    async function syncRelayState() {
      const [{ enabled, timedOut }, ad] = await Promise.all([
        phoneRelay.tabEnabled(),
        phoneRelay.getAdBlock(),
      ]);
      if (cancelled) return;
      setExtReady(!timedOut);
      setRelayOn(enabled);
      if (!ad.timedOut) setAdBlock(ad.enabled !== false);
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
      let types = proxyTypes;
      if (isStreamingSite(abs) && isStylesheetOnlyMode(types)) {
        types = normalizeProxyResourceTypes(undefined);
        setProxyTypes(types);
      }
      if (!(await ensureRelay())) return;

      const res = await phoneRelay.openTarget(abs, types);
      if (!res.ok) {
        if (relayOn && !isStylesheetOnlyMode(types)) {
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

  async function toggleAdBlock(next: boolean) {
    setAdBlock(next);
    const res = await phoneRelay.setAdBlock(next);
    if (!res.ok) setErr("Could not update ad blocker setting.");
  }

  const extLabel = !extReady
    ? "Not detected — reload extension at chrome://extensions, then reload this page"
    : relayOn
      ? "Routing ON for this tab"
      : "Click Open — routing enables automatically";

  const modeLabel = isStylesheetOnlyMode(proxyTypes)
    ? "CSS only — opens real site URL, phone fetches stylesheets only"
    : isFullProxyMode(proxyTypes)
      ? "Full proxy — all traffic via 127.0.0.1:3000/proxy/… (Hotstar)"
      : "Custom — selected resource types only";

  function toggleProxyType(id: ProxyResourceTypeId) {
    setProxyTypes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return normalizeProxyResourceTypes([...next]);
    });
  }

  return (
    <div className="shell portal-shell">
      <div className="card portal-card">
        <p className="eyebrow">Phone Relay</p>
        <h1>Portal</h1>
        <p className="sub">Open blocked sites through your phone. Pick a preset below, then click Open.</p>

        <div className="portal-status">
          <div className={`row ${phoneOk ? "" : "warn"}`}>
            <span className="k">Phone</span>
            <span className="v">{phoneOk ? "Connected" : "Not connected — fix on dashboard"}</span>
          </div>
          <div className="row">
            <span className="k">Extension</span>
            <span className="v">{extLabel}</span>
          </div>
          <div className="row">
            <span className="k">Mode</span>
            <span className="v">{modeLabel}</span>
          </div>
        </div>

        <div className="portal-field">
          <label htmlFor="portal-target">Site URL</label>
          <input
            id="portal-target"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="https://www.hotstar.com/in"
            onKeyDown={(e) => {
              if (e.key === "Enter") void openThroughPhone();
            }}
          />
        </div>

        <fieldset className="proxy-types">
          <legend>Proxy preset</legend>
          <div className="proxy-types-panel">
            <div className="proxy-types-actions">
              <button
                type="button"
                className={`secondary small${isFullProxyMode(proxyTypes) ? " active-preset" : ""}`}
                onClick={() => setProxyTypes(normalizeProxyResourceTypes(undefined))}
              >
                Full proxy (Hotstar)
              </button>
              <button
                type="button"
                className={`secondary small${isStylesheetOnlyMode(proxyTypes) ? " active-preset" : ""}`}
                onClick={() => setProxyTypes(["stylesheet"])}
              >
                CSS only (Cloudflare)
              </button>
            </div>
            <label className="portal-adblock">
              <input
                type="checkbox"
                checked={adBlock}
                onChange={(e) => void toggleAdBlock(e.target.checked)}
              />
              <span>Block ads &amp; trackers on relay tabs</span>
            </label>
            <button type="button" className="link-btn" onClick={() => setShowAdvanced((v) => !v)}>
              {showAdvanced ? "Hide" : "Show"} custom resource types
            </button>
            {showAdvanced ? (
              <div className="proxy-types-grid">
                {PROXY_RESOURCE_TYPE_OPTIONS.map((opt) => (
                  <label key={opt.id} className="proxy-type-option" title={opt.hint}>
                    <input
                      type="checkbox"
                      checked={proxyTypes.includes(opt.id)}
                      onChange={() => toggleProxyType(opt.id)}
                    />
                    <span>{opt.label}</span>
                  </label>
                ))}
              </div>
            ) : null}
          </div>
        </fieldset>

        {err ? <p className="portal-err">{err}</p> : null}

        <div className="actions">
          <button type="button" disabled={busy} onClick={() => void openThroughPhone()}>
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
