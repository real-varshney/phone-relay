# Architecture

The laptop browser must not open a socket to blocked destinations. That would use the laptop IP and can hit geo-blocks, URL filters, or proxy detection.

## Portal mode (v0.4)

For sites blocked on the laptop network, open them from **http://127.0.0.1:3000/portal** — never type the hostname in Chrome's address bar.

```text
User enters https://www.hotstar.com on portal
        ↓ extension openRelayTarget
GET http://127.0.0.1:3000/proxy/https/www.hotstar.com/
        ↓ WebSocket JSON  relay_request
Phone OkHttp GET https://www.hotstar.com/
        ↓ relay_response (HTML rewritten: base href, location spoof, asset URLs)
Backend returns page to Chrome (document origin = 127.0.0.1:3000)
        ↓ DNR + inject on enabled tab
Subresources + fetch/XHR → /proxy/https/… (path proxy, all through phone)
        ↓ phone relay (mobile IP for every request)
Phone fetches with mobile IP
```

| Component | Role |
|---|---|
| **Portal** (`/portal`) | Safe entry — user never navigates to blocked hostnames on laptop |
| **DNR** (extension) | Redirects all HTTP(S) on enabled tabs (including `main_frame`) to path proxy |
| **HTML rewrite** (backend) | `<base href>`, location spoof, root-absolute URL fix on HTML/CSS |
| **inject.js** (MAIN world) | fetch/XHR → `/proxy/https/host/path`, cookie bridge, Set-Cookie apply, body leak fix |
| **bridge.js** (ISOLATED) | DOM events for `chrome.cookies` |

The address bar shows `127.0.0.1:3000/proxy/…`. In-page scripts read the spoofed site URL via `window.location` and `__PHONE_RELAY_SITE__`.

## Why not SOCKS?

SOCKS/CONNECT still makes Chrome speak TLS to the destination through a tunnel. Some sites and extensions treat that as a proxy. Path proxy + local backend looks like a normal call to your own service.

## Bindings

| Listener | Bind | Role |
|---|---|---|
| Dashboard + `/ws/phone` | `0.0.0.0:3000` | Phone dials in on Wi-Fi |
| `/proxy`, `/portal` | same port, **loopback clients only** for proxy | Browser and extension |

Do not port-forward 3000 on the router.

## Phone connection

The phone is a WebSocket **client**. It connects to `ws://<laptop-lan-ip>:3000/ws/phone` with a pairing code, then a session token.

## Future: HTTP CONNECT proxy

A CONNECT tunnel would preserve the real URL and cookies while still egressing from the phone. Portal mode is the interim solution when the laptop cannot load the main document at all.
