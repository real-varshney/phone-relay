# Phone Relay — desktop shortcut

## Same Wi-Fi (default)

1. Run **`Install Desktop Shortcut.bat`** once — adds **Phone Relay** to your Desktop.
2. Double-click the desktop icon — server starts silently, **tray icon** appears (green PR badge near the clock).
3. Chrome opens the dashboard — scan the QR with the Android app.

**Tray menu (right-click icon):**
- Open dashboard
- **Stop Phone Relay** — stops the backend
- Exit tray

## Phone won't connect?

On the dashboard, check **Laptop LAN (QR)** — it must be your Wi-Fi IP (e.g. `192.168.1.42`), not `172.x` from WSL/VPN.

If the QR IP is wrong, add to `phone-relay/.env` and restart:

```
RELAY_LAN_IP=192.168.1.42
```

Or on the phone app, enter manually: `192.168.1.42:3000` and the 6-digit pairing code.

Windows Firewall: the launcher adds a **Private network** rule for port 3000 automatically.

## Logs

`%LOCALAPPDATA%\PhoneRelay\launcher.log`

## Remote network (optional)

Add `USE_DEV_TUNNEL=1` to `.env` only when phone is **not** on the same Wi-Fi.
