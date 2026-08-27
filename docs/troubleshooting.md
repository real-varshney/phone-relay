# Troubleshooting

## Phone status stays Disconnected

- Laptop and phone on the same Wi-Fi (client isolation / AP isolation off)
- Windows Firewall allows inbound 3000 on Private networks
- Dashboard shows a LAN IP, not only `127.0.0.1`
- Pairing code is less than 10 minutes old; click **New pairing code** and scan again

## PHONE_OFFLINE when opening a URL

The backend has no authenticated phone socket. Start the Android app (or fake-phone) and wait until the dashboard says Connected.

## AUTHENTICATION_FAILED

Disconnect was used, or the saved token is stale. New pairing code + Start Relay.

## DESTINATION_BLOCKED

Default policy refuses localhost, private IPv4, link-local, `.local`, and cloud metadata. Turn **LAN destinations** on in the dashboard only if you intentionally need RFC1918 targets. Loopback and metadata stay blocked.

## Site blocked on laptop / 403 before page loads

Use **portal mode** (v0.4+):

1. Reload the extension at `chrome://extensions`
2. Open **http://127.0.0.1:3000/portal** — do not type the blocked hostname in Chrome's address bar
3. Connect the phone on the dashboard
4. Enter `https://www.hotstar.com` (HTTPS, with `www`) on the portal → **Open through phone**

If the main document still fails, check DevTools → Network: the first request should be `127.0.0.1:3000/proxy/https/www.hotstar.com/…`, not a direct request to `hotstar.com`.

## Wrong deeplink_url / API 403 on proxy pages

- Use **HTTPS** (`https://www.hotstar.com`, not `http://hotstar.com`)
- Reload extension after updates; restart `npm run dev`
- Phone must show **Connected**
- API POST bodies should not contain `/proxy/http/…` paths — v0.4.5+ inject **restores** them to real `https://…` URLs (v0.4 stripped them, which broke playback metadata and caused `/invalid/video-meta.json` 404s)
- Cookies for the target site are forwarded via the extension cookie bridge on proxy pages

## Mixed content / CORS

The browser only talks to `127.0.0.1:3000`, so destination CORS should not block relayed calls. If fetch/XHR still hit the real hostname, the inject did not run — reload the extension and confirm routing is ON for that tab.

## Video playback / DRM license errors (`Device Certificate Revoked`, code -7008)

Hotstar playback uses Widevine DRM. The license call goes to `apix.hotstar.com/v2/fetch/license` and must look like it came from `https://www.hotstar.com`, not `127.0.0.1:3000`.

**Fix (v0.4.2+):** the backend rewrites `Origin` and `Referer` before the phone fetches the license. Restart `npm run dev`, reload the extension, and retry playback.

In DevTools → Network, select the license request and confirm the **phone relay** sends (check response headers for `x-relay-via: phone`):

- `Origin: https://www.hotstar.com`
- `Referer: https://www.hotstar.com/…/watch`

If those are still `127.0.0.1:3000`, update and reload both backend and extension.

**If headers are correct but playback still fails:**

- Widevine runs in the **laptop browser**, not on the phone. Hotstar may reject the laptop CDM certificate (common on Brave, some Chromium builds, or virtual machines).
- Try **Chrome** (not Brave) with Widevine enabled (`chrome://components` → Widevine → Update).
- Full DRM-through-proxy may not be achievable — the license challenge is bound to the laptop's CDM while egress IP is the phone's. Watching in the Hotstar **Android app** on the phone is the reliable fallback.

## Player UI loads but video never starts (no red Network errors)

Hotstar uses **Shaka Player + Widevine**. Console logs like `HSPlayer: Init Shaka Destroy` in a loop usually mean DRM keys never applied — not a visible HTTP failure.

**v0.6.0 — full phone tunnel:** All traffic (HTML, API, CDN segments, DRM license) goes through the phone relay. The laptop never talks to Hotstar/CDN directly. Session cookies from API responses are forwarded via `x-relay-set-cookie` into Chrome's cookie jar.

**Check in DevTools → Network:**

1. Filter **`mpd`** or **`m3u8`** — manifest should be 200 via `127.0.0.1:3000/proxy/…` with `x-relay-via: phone`
2. Filter **`init.mp4`** or **`.m4s`** — same: all `/proxy/https/hses…` with `x-relay-via: phone`. Status 200/206 = phone reached CDN; 403 = check cookies/Referer on relay
3. Filter **`license`** — 200 via proxy (`apix.hotstar.com` through phone)

**v0.4.6 fixes:** root-absolute manifest segments (`/video_h264/…/seg.m4s`) rewritten to full CDN proxy URLs; leaked segments no longer fall through to the Phone Relay dashboard HTML.

**v0.4.4 fixes:** relative segment URLs in manifests rewritten to absolute CDN proxy paths (prevents `.m4s` returning Hotstar HTML with 200); leaked-segment guard stops mapping CDN paths to `www.hotstar.com`.

**v0.4.3 fixes:** DASH/HLS manifest CDN URLs rewritten to proxy paths; longer timeout for Range requests; 50 MB segment limit.

**If manifests and segments are 200 but still no picture:** Widevine decrypts on the **laptop**. The phone only fetches bytes. This architecture cannot fully mimic a phone browser for DRM. Use the Hotstar app on the phone to watch, or Chrome (not Brave) on the laptop without geo-block.

## CDN segments 403 — `No sub Token` / `auth-failure`

Response headers look like:

- `x-error-details: No sub Token`
- `x-errortype: auth-failure`
- `x-relay-via: phone` (tunnel works; Akamai rejected auth)

**Cause:** Hotstar CDN expects segment requests to use the **signed manifest URL** (`master.mpd?hdnea=…`) as `Referer`, plus CDN cookies (`hdntl`) issued when the manifest was fetched.

**Fix (v0.6.1+ backend + extension):**

- Backend caches the manifest URL and sets it as `Referer` on CDN `GET`s
- Inject sends `X-Relay-Manifest-Referer` when available

**Fix (v0.6.2+ Android APK):**

- Phone OkHttp now keeps an in-memory cookie jar so `hdntl` from the manifest response is reused on `init.mp4` / `.m4s` even before Chrome stores it

**Steps:**

1. Reload extension (0.6.2+)
2. Restart `npm run dev`
3. Rebuild/install Android app (`gradlew :app:assembleDebug`) — required for cookie jar
4. Retry playback; confirm `master.mpd` returns 200 **before** `init.mp4`

**Non-blocking failures:** `bifrost-api.hotstar.com` analytics POSTs may still fail (protobuf bodies). They do not block playback. `/invalid/video-meta.json` means a proxy URL leaked into an API response — reload after v0.6.1+ JSON restore fix.


```powershell
$env:PORT = "3001"
npm run dev
```

Then point the extension and phone at that port (edit `PROXY_ORIGIN` in `apps/extension/inject.js` and `background.js` if it is not 3000).
