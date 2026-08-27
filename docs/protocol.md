# Protocol

## Proxy URL

Query form (used by fetch/XHR):

```text
http://127.0.0.1:3000/proxy?curl=https%3A%2F%2Fhoststar.com%2Fapi%3Fx%3D1
```

Path form (used by DNR redirects and HTML `<base href>`):

```text
http://127.0.0.1:3000/proxy/https/hoststar.com/api?x=1
```

`backend.lcl` is an optional hosts-file alias for `127.0.0.1`.

## Phone WebSocket

Connect: `ws://<laptop-lan>:3000/ws/phone`

### hello (phone → laptop)

```json
{ "type": "hello", "code": "482913", "name": "Android Phone" }
```

or after pairing:

```json
{ "type": "hello", "token": "<sessionToken>" }
```

### hello_ok

```json
{ "type": "hello_ok", "deviceId": "…", "sessionToken": "…", "laptopLanIp": "192.168.1.10" }
```

### relay_request (laptop → phone)

```json
{
  "type": "relay_request",
  "requestId": "uuid",
  "method": "GET",
  "url": "https://hoststar.com/api",
  "headers": { "Accept": "application/json" },
  "bodyBase64": null,
  "timeoutMs": 30000
}
```

### relay_response (phone → laptop)

```json
{
  "type": "relay_response",
  "requestId": "uuid",
  "status": 200,
  "headers": { "content-type": "application/json" },
  "bodyBase64": "…",
  "error": null,
  "durationMs": 842
}
```

Errors use `error: { "code": "PHONE_OFFLINE", "message": "…" }` with `status: null`.

Operator UI uses `ws://127.0.0.1:3000/ws/operator` for live status only.
