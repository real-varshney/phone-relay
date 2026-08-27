import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./server.ts";
import { getPublicBaseUrl, getPublicWsUrl, isUsingPublicUrl } from "./public-url.ts";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
dotenv.config({ path: path.join(rootDir, ".env") });

const port = Number(process.env.PORT ?? 3000);
const policyTestMode = process.env.RELAY_POLICY === "test";

const { server } = await createApp({ port, policyTestMode });
server.listen(port, "0.0.0.0", () => {
  console.log(`Phone Relay dashboard: http://localhost:${port}`);
  if (isUsingPublicUrl()) {
    console.log(`Public URL (phone):  ${getPublicBaseUrl(port)}`);
    console.log(`Phone WebSocket:     ${getPublicWsUrl(port)}`);
  } else {
    console.log(`Phone WebSocket:     ws://<laptop-lan>:${port}/ws/phone`);
    console.log(`Tip: set PUBLIC_URL in phone-relay/.env for Dev Tunnel / port forwarding`);
  }
  console.log(`Browser proxy:         http://127.0.0.1:${port}/proxy?curl=https://example.com`);
});
