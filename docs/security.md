# Security

- `/proxy` returns 403 unless the TCP client is loopback. LAN neighbors cannot use your laptop as an open HTTP proxy.
- The phone accepts relay commands only on a WebSocket that completed pairing (`code` or `sessionToken`).
- Pairing codes are 6 digits, 10 minutes, single use, with a short cooldown after repeated failures.
- Session tokens are stored hashed on disk (`apps/web/backend/data/devices.json`). Dashboard **Disconnect** deletes them and closes the socket.
- Destination policy (DNS resolve, then IP check) runs on the laptop before dispatch and again on the phone before `connect()`. Loopback and metadata addresses cannot be enabled.
- Browser `Cookie` / `Origin` / `Referer` are not forwarded. The phone HTTP client does not send the laptop’s cookies.
- Logs never record Authorization, Cookie, Set-Cookie, tokens, pairing codes, or bodies.
- Do not expose port 3000 on a router or VPS. This is a local-network tool.
