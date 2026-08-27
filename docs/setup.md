# Setup

## One-click start (recommended)

Double-click **`shortcut/Install Desktop Shortcut.bat`** once to put **Phone Relay** on your Desktop (green icon). Then use that shortcut anytime — no terminal window.

Or double-click **`shortcut/Start Phone Relay.bat`** from the project folder.

1. Starts **`npm run dev`** silently in the background
2. Opens **Chrome** at http://127.0.0.1:3000
3. QR code uses your laptop **LAN IP** (same Wi-Fi — no Dev Tunnel needed)

On the phone: open **Phone Relay** → **Scan laptop QR code**.

Use **`shortcut/Stop Phone Relay.bat`** to free port 3000.

**Different network?** Add `USE_DEV_TUNNEL=1` to `.env` and install [Dev Tunnel](https://learn.microsoft.com/en-us/azure/developer/dev-tunnels/) — only needed when phone is not on the same Wi-Fi.

## Laptop (manual)

Requires Node 20+.

```powershell
cd C:\Users\VishalVarshney\Documents\prsnl\phone-relay
npm install
npm run dev
```

Open http://localhost:3000

If you see a **white screen**, stop the server (Ctrl+C) and run `npm run dev` again. An older dev setup used `tsx watch`, which restarted whenever Vite wrote temp files and broke JS loading — that is fixed now.

Allow **inbound TCP 3000** on the Private Windows Firewall profile so the phone can connect on the same Wi‑Fi.

## Public URL (Dev Tunnel) — phone over the internet

The **Start Phone Relay** shortcut handles this automatically. Manual setup:

```powershell
# Install once: winget install Microsoft.devtunnel
devtunnel user login
devtunnel create phone-relay --allow-anonymous
devtunnel port create phone-relay -p 3000
devtunnel host phone-relay -p 3000 --allow-anonymous
```

Copy the **https** URL into `phone-relay/.env`:

```env
PUBLIC_URL=https://xxxx-3000.inc1.devtunnels.ms
```

Restart `npm run dev`. The dashboard QR uses this URL. The phone connects via **wss://** to `/ws/phone`.

**Important:** Without `--allow-anonymous`, Dev Tunnels shows a GitHub sign-in page and the phone WebSocket will fail. Use anonymous access for the relay tunnel only.

The Android app reads the URL from the **QR scan** — you do not need to rebuild the APK when the tunnel hostname changes.

## Chrome / Edge extension (portal mode v0.4)

1. `chrome://extensions` (or `edge://extensions`)
2. Enable Developer mode
3. Load unpacked → `phone-relay/apps/extension`
4. Open **http://127.0.0.1:3000/portal** (not the blocked site in the address bar)
5. Connect the phone on the dashboard first
6. Enter the site URL on the portal → **Open through phone**

The browser only talks to `127.0.0.1:3000/proxy/…`. The phone fetches the real site. The address bar shows the proxy path; location spoofing keeps in-page scripts on the site URL.

Keep the dashboard (`localhost:3000`) in a **separate tab**. Turn routing off with **Stop routing this tab** on relay tabs.

**Do not** type blocked hostnames (e.g. `hotstar.com`) in Chrome's address bar — your laptop network may block them before the extension can help.

## Android app

Requires Android Studio (JDK 17) and a device/emulator.

```powershell
cd apps\android
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-17.0.20.101-hotspot"  # or your JDK 17 path
.\gradlew.bat :app:assembleDebug
# APK: apps\android\app\build\outputs\apk\debug\app-debug.apk
.\gradlew.bat :app:installDebug   # if a device is connected via adb
```

On the phone:

1. Open **Phone Relay** → tap **Scan laptop QR code** (point at the dashboard QR)
2. Allow camera if asked — it connects automatically
3. Keep the app open (foreground service)

Same Wi‑Fi as the laptop is **not** required when using a public tunnel URL (`PUBLIC_URL` in `.env`).

Manual fallback: enter the tunnel URL (e.g. `https://xxxx-3000.inc1.devtunnels.ms`) or `laptop-ip:3000`, plus the 6-digit pairing code, then **Connect to laptop**.

## Fake phone (no APK)

```powershell
$env:PAIR_CODE = "123456"   # digits from the dashboard
cd apps\web\backend
npx tsx src/fake-phone.ts
```

Traffic then egresses from the **laptop**, which is only useful to test the protocol.
