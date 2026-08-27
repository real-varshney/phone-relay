# Phone Relay

Local laptop dashboard + Android phone HTTP relay. The **browser never talks to the destination**. Every request is rewritten to:

```text
http://127.0.0.1:3000/proxy?curl=https://hoststar.com/api
```

The Node backend sends that request over a WebSocket to the phone. The phone fetches it and returns the response.

```text
Laptop Chrome  →  localhost:3000/proxy?curl=…  →  phone socket  →  internet
```

## Quick start

1. `cd phone-relay` then `npm install`
2. `npm run dev` and open [http://localhost:3000](http://localhost:3000)
3. Load the unpacked Chrome/Edge extension from `apps/extension`
4. Install the Android app (`apps/android`) and scan the dashboard QR
5. Open a site tab → extension popup → **Route this tab through phone** (tab-specific; other tabs stay direct)

Full steps: [docs/setup.md](docs/setup.md)

## Layout

```text
apps/web/backend     Node API, WebSocket, /proxy?curl=
apps/web/frontend    Dashboard UI
apps/extension       Chrome/Edge MV3 (rewrites all network to /proxy)
apps/android         Kotlin relay (OkHttp)
packages/protocol    URL encoding + message types
packages/validation  SSRF / DNS checks
packages/shared-types
```

## Tests

```bash
npm test
```

Laptop-only (no phone): after `npm run dev`, copy the pairing code and run:

```bash
cd apps/web/backend
npx tsx src/fake-phone.ts
```

Set `PAIR_CODE` to the 6-digit code first (PowerShell: `$env:PAIR_CODE="482913"`).
