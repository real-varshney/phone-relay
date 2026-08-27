const state = document.getElementById("state");
const toggle = document.getElementById("toggle");
const adBlock = document.getElementById("adBlock");
const tabLabel = document.getElementById("tabLabel");
const errorEl = document.getElementById("error");

let current = { tabId: null, enabled: false, title: "", url: "" };

function render() {
  const title = current.title || "(untitled tab)";
  tabLabel.textContent = current.url ? `${title}\n${current.url}` : title;
  if (!current.tabId) {
    state.textContent = "No active tab.";
    toggle.disabled = true;
    adBlock.disabled = true;
    return;
  }
  toggle.disabled = false;
  adBlock.disabled = false;
  if (current.enabled) {
    state.textContent = "This tab routes all traffic through the phone (portal / proxy pages).";
    toggle.textContent = "Stop routing this tab";
    toggle.className = "on";
  } else {
    state.textContent = "Open the portal tab, then enable routing — blocked sites never hit the laptop network.";
    toggle.textContent = "Route this tab through phone";
    toggle.className = "off";
  }
}

function showError(msg) {
  errorEl.hidden = !msg;
  errorEl.textContent = msg || "";
}

chrome.runtime.sendMessage({ type: "getTabState" }, (res) => {
  if (chrome.runtime.lastError) {
    showError(chrome.runtime.lastError.message);
    return;
  }
  current = res ?? current;
  render();
});

chrome.runtime.sendMessage({ type: "getAdBlockState" }, (res) => {
  if (chrome.runtime.lastError || !adBlock) return;
  adBlock.checked = res?.enabled !== false;
});

adBlock?.addEventListener("change", () => {
  chrome.runtime.sendMessage({ type: "setAdBlockEnabled", enabled: adBlock.checked }, (res) => {
    if (chrome.runtime.lastError) {
      showError(chrome.runtime.lastError.message);
      return;
    }
    if (!res?.ok) showError("Could not update ad block setting.");
  });
});

toggle.addEventListener("click", () => {
  if (!current.tabId) return;
  const next = !current.enabled;
  showError("");
  toggle.disabled = true;

  chrome.runtime.sendMessage(
    { type: "setTabEnabled", tabId: current.tabId, enabled: next },
    (res) => {
      toggle.disabled = false;
      if (chrome.runtime.lastError) {
        showError(chrome.runtime.lastError.message);
        return;
      }
      if (!res?.ok) {
        showError(res?.error ?? "Could not update this tab.");
        return;
      }
      current.enabled = next;
      render();
      if (next) window.close();
    },
  );
});
