/** ISOLATED world on /portal — forwards page CustomEvents to the extension background. */
(function phoneRelayPortalBridge() {
  if (window.__PHONE_RELAY_PORTAL_BRIDGE__) return;
  window.__PHONE_RELAY_PORTAL_BRIDGE__ = true;

  window.addEventListener("__phone_relay_portal_req__", (event) => {
    const detail = event.detail;
    if (!detail?.id || !detail.type) return;

    const reply = (result) => {
      window.dispatchEvent(
        new CustomEvent("__phone_relay_portal__", {
          detail: { id: detail.id, result },
        }),
      );
    };

    if (detail.type === "tabEnabled") {
      chrome.runtime.sendMessage({ type: "portalTabEnabled" }, (res) => {
        reply(res ?? { enabled: false });
      });
      return;
    }

    if (detail.type === "enableTab") {
      chrome.runtime.sendMessage({ type: "portalEnableTab" }, (res) => {
        reply(res ?? { ok: false, error: "No response from extension." });
      });
      return;
    }

    if (detail.type === "openTarget") {
      chrome.runtime.sendMessage({ type: "openRelayTarget", url: detail.url }, (res) => {
        reply(res ?? { ok: false, error: "No response from extension." });
      });
    }
  });
})();
