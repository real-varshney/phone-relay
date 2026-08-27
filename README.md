# Phone Relay

Route your **laptop browser** through your **Android phone**. The laptop does not connect to the destination sites directly. Requests are sent to a local server, forwarded over WebSocket to the phone, and the phone fetches the requested URL.

```text
Laptop browser
      ↓
127.0.0.1:3000/proxy/https/…
      ↓
WebSocket
      ↓
Android phone (OkHttp)
      ↓
Internet
```

Use Phone Relay to access sites that are blocked on your laptop network but are accessible through your phone's network.

---

## Requirements

| Component          | Requirement                                                   |
| ------------------ | ------------------------------------------------------------- |
| Laptop             | **Node.js 20+**, Chrome or Edge                               |
| Phone              | **Android 8+** (API 26+)                                      |
| Network            | Same Wi-Fi by default, or Dev Tunnel when the phone is remote |
| Windows (optional) | Desktop shortcut scripts in `shortcut/`                       |

---

## Quick Start

### 1. Laptop — Start the Server

#### Windows — Recommended

1. Clone this repository and open a terminal in the `phone-relay` folder.
2. Run the following script once:

```text
shortcut/Install Desktop Shortcut.bat
```

3. Double-click **Phone Relay** on your Desktop.

The application starts in the background, a tray icon appears, and Chrome opens:

```text
http://127.0.0.1:3000
```

#### Manual Setup — Windows / macOS / Linux

```bash
git clone https://github.com/real-varshney/phone-relay.git
cd phone-relay
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

You should see the dashboard with a QR code and pairing code.

> **Phone can't connect?**
>
> On Windows, run `shortcut/Fix Firewall.bat` as Administrator.
>
> Alternatively, allow inbound **TCP port 3000** through your firewall.
>
> From the phone browser, verify connectivity using:
>
> ```text
> http://<laptop-lan-ip>:3000/health
> ```

---

### 2. Phone — Install the APK

The Android APK is provided with the release.

1. Download the **Phone Relay APK** from the GitHub release.
2. Install the APK on your Android phone.
3. If prompted, allow installation from unknown sources.
4. Open **Phone Relay**.
5. Select **Scan laptop QR code**.
6. Scan the QR code displayed on the laptop dashboard.
7. Wait until the dashboard shows **Connected**.

> The Chrome/Edge extension and source code do not need to be downloaded separately. They are available directly in the repository.

#### Build the APK from Source

If you want to build the Android application yourself:

```powershell
cd apps/android
.\gradlew.bat :app:assembleDebug
```

The generated APK will be available at:

```text
apps/android/app/build/outputs/apk/debug/app-debug.apk
```

---

### 3. Browser — Load the Extension

The browser extension is included in the repository under:

```text
apps/extension
```

In Chrome:

```text
chrome://extensions
```

Or in Edge:

```text
edge://extensions
```

Then:

1. Enable **Developer mode**.
2. Select **Load unpacked**.
3. Select the `apps/extension` folder.

---

### 4. Browse Through the Phone

1. Keep the Phone Relay dashboard open:

```text
http://127.0.0.1:3000
```

2. Make sure the phone status shows **Connected**.
3. Open the Phone Relay portal:

```text
http://127.0.0.1:3000/portal
```

4. Enter the destination URL.
5. Select **Open through phone**.

> **Important:** Do not enter blocked hostnames directly into the normal browser address bar. Your laptop network may block the connection before the relay can process it. Always start browsing from the **Phone Relay portal**.

---

## Configuration

Configuration is optional.

Copy `.env.example` to `.env` in the repository root:

```bash
cp .env.example .env
```

Example configuration:

```env
# Force QR / phone to use a public HTTPS URL
# when the phone is not on the same Wi-Fi network.
# PUBLIC_URL=https://your-tunnel-3000.inc1.devtunnels.ms

# Pin the laptop LAN IP if the dashboard selects
# a WSL or VPN address instead of the Wi-Fi address.
# RELAY_LAN_IP=192.168.1.42

# Enable Dev Tunnel from the Windows launcher
# when the phone is not on the same Wi-Fi network.
# USE_DEV_TUNNEL=1
```

Restart the development server after changing `.env`:

```bash
npm run dev
```

For remote phone/tunnel configuration, see:

[docs/setup.md](docs/setup.md#public-url-dev-tunnel--phone-over-the-internet)

---

## Project Layout

```text
phone-relay/
├── apps/
│   ├── web/backend/    Node.js server, WebSocket, /proxy
│   ├── web/frontend/   Dashboard UI
│   ├── extension/      Chrome/Edge MV3 extension
│   └── android/        Kotlin relay app
├── shortcut/           Windows launcher, tray, firewall helper
├── packages/           Shared protocol and validation
├── docs/               Setup, release, troubleshooting
└── shared/             Shared/ad-block domain lists
```

---

## Documentation

| Document                                   | Description                                             |
| ------------------------------------------ | ------------------------------------------------------- |
| [Setup Guide](docs/setup.md)               | Detailed installation, Dev Tunnel, and fake-phone setup |
| [Release Guide](docs/release.md)           | Release and APK publishing instructions                 |
| [Troubleshooting](docs/troubleshooting.md) | Connection, playback, DRM, and 403 troubleshooting      |
| [Architecture](docs/architecture.md)       | Phone Relay architecture and request flow               |
| [Security](docs/security.md)               | SSRF policy and LAN destination handling                |

---

## Development

Run the test suite:

```bash
npm test
```

Build the frontend and backend:

```bash
npm run build
```

### Test Without a Phone

For protocol testing, you can use the fake phone implementation.

First, obtain the 6-digit pairing code displayed on the dashboard:

```powershell
$env:PAIR_CODE = "123456"
cd apps/web/backend
npx tsx src/fake-phone.ts
```

> When using the fake phone, traffic exits through the **laptop**. This is intended for protocol and development testing only and does not provide the same network-routing behavior as a real Android phone.

---

## Release

The release distribution includes the **Android APK**.

The browser extension and source code are available directly from the repository and do not need to be attached to the release.

For release and APK build instructions, see:

[docs/release.md](docs/release.md)

---

## License

Private / personal project — use at your own risk.

Not affiliated with any streaming service or network provider.
