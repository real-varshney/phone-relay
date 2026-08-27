import { BLOCKED_DOMAINS } from "./ad-filters.js";

const PROXY_ORIGIN = "http://127.0.0.1:3000";
const AD_BLOCK_DOMAIN_RULE_ID = 3;
const AD_BLOCK_PROXY_RULE_ID_START = 4;

function managedRuleIds() {
  return [
    1,
    2,
    AD_BLOCK_DOMAIN_RULE_ID,
    ...BLOCKED_DOMAINS.map((_, i) => AD_BLOCK_PROXY_RULE_ID_START + i),
  ];
}
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "backend.lcl", "::1"]);
const PORTAL_URL = "http://127.0.0.1:3000/portal";

/** Portal mode: redirect all HTTP(S) on enabled tabs (including main_frame) to path proxy. */
const RESOURCE_TYPES = [
  "main_frame",
  "sub_frame",
  "stylesheet",
  "script",
  "image",
  "font",
  "media",
  "object",
  "xmlhttprequest",
  "ping",
  "other",
];

const BASE_RULES = [
  {
    id: 1,
    priority: 1,
    action: {
      type: "redirect",
      redirect: {
        regexSubstitution: "http://127.0.0.1:3000/proxy/https/\\1\\2",
      },
    },
    condition: {
      regexFilter: "^https://([^/]+)(/.*)?$",
      resourceTypes: RESOURCE_TYPES,
      excludedRequestDomains: ["127.0.0.1", "localhost", "backend.lcl"],
    },
  },
  {
    id: 2,
    priority: 1,
    action: {
      type: "redirect",
      redirect: {
        regexSubstitution: "http://127.0.0.1:3000/proxy/http/\\1\\2",
      },
    },
    condition: {
      regexFilter: "^http://([^/]+)(/.*)?$",
      resourceTypes: RESOURCE_TYPES,
      excludedRequestDomains: ["127.0.0.1", "localhost", "backend.lcl"],
    },
  },
];

function isPortalUrl(url) {
  try {
    const u = new URL(url);
    return LOCAL_HOSTS.has(u.hostname) && (u.pathname === "/portal" || u.pathname.startsWith("/portal/"));
  } catch {
    return false;
  }
}

function isProxyPathUrl(url) {
  try {
    return new URL(url).pathname.startsWith("/proxy/");
  } catch {
    return false;
  }
}

function isDashboardUrl(url) {
  try {
    const u = new URL(url);
    if (!LOCAL_HOSTS.has(u.hostname)) return false;
    if (u.pathname.startsWith("/proxy")) return false;
    if (u.pathname === "/portal" || u.pathname.startsWith("/portal/")) return false;
    if (u.pathname === "/relay-inject.js") return false;
    return true;
  } catch {
    return false;
  }
}

function isNewTabUrl(url) {
  const u = url.toLowerCase().split("#")[0];
  return (
    u === "about:blank" ||
    u.startsWith("chrome://newtab") ||
    u.startsWith("chrome://new-tab-page") ||
    u.startsWith("edge://newtab") ||
    u.startsWith("edge://new-tab-page")
  );
}

function canEnableRoutingOnTab(url) {
  if (!url) return false;
  if (isDashboardUrl(url)) return false;
  if (isPortalUrl(url)) return true;
  if (isProxyPathUrl(url)) return true;
  if (isHttpUrl(url)) return true;
  return isNewTabUrl(url);
}

function isInternalBrowserUrl(url) {
  if (!url) return true;
  if (isNewTabUrl(url)) return false;
  try {
    const p = new URL(url).protocol;
    return (
      p === "chrome:" ||
      p === "chrome-extension:" ||
      p === "chrome-error:" ||
      p === "edge:" ||
      p === "devtools:" ||
      p === "about:"
    );
  } catch {
    return true;
  }
}

function isHttpUrl(url) {
  try {
    const p = new URL(url).protocol;
    return p === "http:" || p === "https:";
  } catch {
    return false;
  }
}

function normalizeTargetUrl(raw) {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) throw new Error("Enter a site URL.");
  return new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`).toString();
}

function toPathProxyUrl(target) {
  const u = new URL(target);
  const path = u.pathname === "/" ? "" : u.pathname;
  return `http://127.0.0.1:3000/proxy/${u.protocol.replace(":", "")}/${u.host}${path}${u.search}`;
}

async function getEnabledTabIds() {
  const { enabledTabIds = [] } = await chrome.storage.session.get("enabledTabIds");
  return enabledTabIds.filter((id) => Number.isInteger(id));
}

async function setEnabledTabIds(tabIds) {
  await chrome.storage.session.set({ enabledTabIds: tabIds });
}

function buildAdBlockRules(tabIds) {
  if (tabIds.length === 0) return [];
  const rules = [
    {
      id: AD_BLOCK_DOMAIN_RULE_ID,
      priority: 10,
      action: { type: "block" },
      condition: {
        requestDomains: [...BLOCKED_DOMAINS],
        resourceTypes: RESOURCE_TYPES,
        tabIds: [...tabIds],
      },
    },
  ];
  for (let i = 0; i < BLOCKED_DOMAINS.length; i++) {
    const domain = BLOCKED_DOMAINS[i];
    rules.push({
      id: AD_BLOCK_PROXY_RULE_ID_START + i,
      priority: 10,
      action: { type: "block" },
      condition: {
        urlFilter: `|${PROXY_ORIGIN}/proxy/https/${domain}`,
        resourceTypes: RESOURCE_TYPES,
        tabIds: [...tabIds],
      },
    });
  }
  return rules;
}

async function syncRules(tabIds) {
  const ruleIds = managedRuleIds();
  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: ruleIds });
  await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: ruleIds });

  if (tabIds.length === 0) {
    await chrome.action.setBadgeText({ text: "" });
    return;
  }

  const { adBlockEnabled = true } = await chrome.storage.sync.get("adBlockEnabled");

  const rules = BASE_RULES.map((rule) => ({
    ...rule,
    condition: { ...rule.condition, tabIds: [...tabIds] },
  }));

  if (adBlockEnabled) {
    rules.push(...buildAdBlockRules(tabIds));
  }

  await chrome.declarativeNetRequest.updateSessionRules({ addRules: rules });
  await chrome.action.setBadgeBackgroundColor({ color: "#3ddc97" });
  await chrome.action.setBadgeText({ text: String(tabIds.length) });
}

async function injectTab(tabId, frameIds) {
  if (!Number.isInteger(tabId)) return false;
  const target = frameIds?.length ? { tabId, frameIds } : { tabId, allFrames: true };
  try {
    await chrome.scripting.executeScript({
      target,
      files: ["ad-filters.js"],
      world: "MAIN",
      injectImmediately: true,
    });
    await chrome.scripting.executeScript({
      target,
      files: ["bridge.js"],
      world: "ISOLATED",
      injectImmediately: true,
    });
    await chrome.scripting.executeScript({
      target,
      files: ["inject.js"],
      world: "MAIN",
      injectImmediately: true,
    });
    return true;
  } catch (err) {
    console.warn("[Phone Relay] inject failed", tabId, err);
    return false;
  }
}

async function isTabEnabled(tabId) {
  return (await getEnabledTabIds()).includes(tabId);
}

async function ensureTabEnabled(tabId) {
  if (await isTabEnabled(tabId)) return;
  const ids = await getEnabledTabIds();
  const nextIds = [...ids, tabId];
  await setEnabledTabIds(nextIds);
  await syncRules(nextIds);
}

async function openRelayTarget(tabId, rawUrl) {
  const abs = normalizeTargetUrl(rawUrl);
  const proxyUrl = toPathProxyUrl(abs);
  await ensureTabEnabled(tabId);
  await chrome.tabs.update(tabId, { url: proxyUrl });
  return { ok: true, proxyUrl };
}

async function setTabEnabled(tabId, enabled) {
  const ids = await getEnabledTabIds();
  if (enabled) {
    const tab = await chrome.tabs.get(tabId);
    if (!canEnableRoutingOnTab(tab.url)) {
      throw new Error("Open the portal (127.0.0.1:3000/portal) or a relay tab — not the dashboard.");
    }
    const nextIds = ids.includes(tabId) ? ids : [...ids, tabId];
    await setEnabledTabIds(nextIds);
    await syncRules(nextIds);

    if (isNewTabUrl(tab.url)) {
      await chrome.tabs.update(tabId, { url: PORTAL_URL });
      return { hint: "Enter the site on the portal page and click Open through phone." };
    }
    if (isPortalUrl(tab.url)) {
      return { hint: null };
    }
    if (isProxyPathUrl(tab.url)) {
      await injectTab(tabId);
      return { hint: null };
    }
    if (isHttpUrl(tab.url) && !isDashboardUrl(tab.url)) {
      const proxyUrl = toPathProxyUrl(tab.url);
      await chrome.tabs.update(tabId, { url: proxyUrl });
      return { hint: null };
    }
    return { hint: "Routing on. Use the portal to open blocked sites." };
  }

  const nextIds = ids.filter((id) => id !== tabId);
  await syncRules(nextIds);
  await setEnabledTabIds(nextIds);
  try {
    const tab = await chrome.tabs.get(tabId);
    if (tab.url && isProxyPathUrl(tab.url)) {
      await chrome.tabs.update(tabId, { url: PORTAL_URL });
    }
  } catch {
    /* tab gone */
  }
  return { hint: null };
}

async function pruneClosedTabs() {
  const ids = await getEnabledTabIds();
  const alive = [];
  for (const id of ids) {
    try {
      await chrome.tabs.get(id);
      alive.push(id);
    } catch {
      /* removed */
    }
  }
  if (alive.length !== ids.length) {
    await syncRules(alive);
    await setEnabledTabIds(alive);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  void chrome.storage.session.set({ enabledTabIds: [] });
  void syncRules([]);
});

chrome.runtime.onStartup.addListener(() => {
  void pruneClosedTabs();
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void (async () => {
    const ids = await getEnabledTabIds();
    if (!ids.includes(tabId)) return;
    const next = ids.filter((id) => id !== tabId);
    await syncRules(next);
    await setEnabledTabIds(next);
  })();
});

chrome.webNavigation.onCommitted.addListener((details) => {
  void (async () => {
    if (!(await isTabEnabled(details.tabId))) return;
    if (isDashboardUrl(details.url)) return;
    if (isInternalBrowserUrl(details.url)) return;
    if (isPortalUrl(details.url)) return;
    await injectTab(details.tabId, [details.frameId]);
  })();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "loading") return;
  void (async () => {
    if (!(await isTabEnabled(tabId))) return;
    if (tab.url && (isDashboardUrl(tab.url) || isInternalBrowserUrl(tab.url) || isPortalUrl(tab.url))) return;
    await injectTab(tabId);
  })();
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "getTabState") {
    void (async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) {
        sendResponse({ enabled: false, tabId: null, title: "", url: "" });
        return;
      }
      sendResponse({
        enabled: await isTabEnabled(tab.id),
        tabId: tab.id,
        title: tab.title ?? "",
        url: tab.url ?? "",
      });
    })();
    return true;
  }
  if (msg?.type === "setTabEnabled") {
    void setTabEnabled(msg.tabId, Boolean(msg.enabled)).then(
      (result) => sendResponse({ ok: true, ...result }),
      (err) => sendResponse({ ok: false, error: String(err?.message ?? err) }),
    );
    return true;
  }
  if (msg?.type === "portalTabEnabled") {
    const tabId = sender.tab?.id;
    if (!tabId) {
      sendResponse({ enabled: false });
      return true;
    }
    void isTabEnabled(tabId).then((enabled) => sendResponse({ enabled }));
    return true;
  }
  if (msg?.type === "portalEnableTab") {
    const tabId = sender.tab?.id;
    if (!tabId) {
      sendResponse({ ok: false, error: "No tab context." });
      return true;
    }
    void setTabEnabled(tabId, true).then(
      (result) => sendResponse({ ok: true, ...result }),
      (err) => sendResponse({ ok: false, error: String(err?.message ?? err) }),
    );
    return true;
  }
  if (msg?.type === "openRelayTarget") {
    const tabId = sender.tab?.id;
    if (!tabId) {
      sendResponse({ ok: false, error: "No tab context." });
      return true;
    }
    void openRelayTarget(tabId, msg.url).then(
      (result) => sendResponse(result),
      (err) => sendResponse({ ok: false, error: String(err?.message ?? err) }),
    );
    return true;
  }
  if (msg?.type === "listEnabledTabs") {
    void getEnabledTabIds().then((ids) => sendResponse({ tabIds: ids }));
    return true;
  }
  if (msg?.type === "getAdBlockState") {
    void chrome.storage.sync.get("adBlockEnabled").then(({ adBlockEnabled = true }) => {
      sendResponse({ enabled: adBlockEnabled !== false });
    });
    return true;
  }
  if (msg?.type === "setAdBlockEnabled") {
    void chrome.storage.sync.set({ adBlockEnabled: Boolean(msg.enabled) }).then(async () => {
      await syncRules(await getEnabledTabIds());
      sendResponse({ ok: true });
    });
    return true;
  }
  if (msg?.type === "getCookies") {
    void chrome.cookies.getAll({ url: msg.url }, (cookies) => {
      sendResponse(cookies.map((c) => `${c.name}=${c.value}`).join("; "));
    });
    return true;
  }
  if (msg?.type === "setCookie") {
    const raw = String(msg.cookie ?? "");
    const parts = raw.split(";").map((s) => s.trim());
    const pair = parts[0] ?? "";
    const eq = pair.indexOf("=");
    if (eq === -1) {
      sendResponse({ ok: false });
      return true;
    }
    const details = {
      url: msg.url,
      name: pair.slice(0, eq),
      value: pair.slice(eq + 1),
    };
    for (const attr of parts.slice(1)) {
      const sep = attr.indexOf("=");
      const key = (sep === -1 ? attr : attr.slice(0, sep)).toLowerCase();
      const val = sep === -1 ? "" : attr.slice(sep + 1);
      if (key === "domain") details.domain = val;
      if (key === "path") details.path = val;
      if (key === "secure") details.secure = true;
      if (key === "httponly") details.httpOnly = true;
      if (key === "samesite") details.sameSite = val;
      if (key === "max-age") details.expirationDate = Math.floor(Date.now() / 1000) + Number(val);
    }
    void chrome.cookies.set(details, () => sendResponse({ ok: true }));
    return true;
  }
});

void (async () => {
  await syncRules(await getEnabledTabIds());
})();
