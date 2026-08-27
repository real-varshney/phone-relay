/** ISOLATED world — bridges chrome.cookies to the MAIN-world inject via DOM events. */
(function phoneRelayBridge() {
  if (window.__PHONE_RELAY_BRIDGE__) return;
  window.__PHONE_RELAY_BRIDGE__ = true;

  window.addEventListener("__phone_relay_cookie_req__", (event) => {
    const detail = event.detail;
    if (!detail?.id || !detail.url) return;
    chrome.runtime.sendMessage({ type: "getCookies", url: detail.url }, (cookie) => {
      window.dispatchEvent(
        new CustomEvent("__phone_relay_cookies__", {
          detail: { id: detail.id, cookie: cookie ?? "" },
        }),
      );
    });
  });

  window.addEventListener("__phone_relay_set_cookie__", (event) => {
    const detail = event.detail;
    if (!detail?.url || !detail.cookie) return;
    chrome.runtime.sendMessage({
      type: "setCookie",
      url: detail.url,
      cookie: detail.cookie,
    });
  });
})();
