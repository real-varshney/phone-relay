import { inspect } from "node:util";
import { mkdir, writeFile, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { SENSITIVE_HEADERS } from "@phone-relay/shared-types";

export type LogEvent = {
  time: string;
  device?: string;
  event: string;
  host?: string;
  method?: string;
  status?: number;
  durationMs?: number;
  code?: string;
};

const sensitive = new Set<string>(SENSITIVE_HEADERS);

export function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    out[k] = sensitive.has(k.toLowerCase()) ? "[redacted]" : v;
  }
  return out;
}

export class EventLog {
  private events: LogEvent[] = [];

  constructor(private readonly filePath: string) {}

  async append(event: Omit<LogEvent, "time"> & { time?: string }): Promise<void> {
    const row: LogEvent = {
      ...event,
      time: event.time ?? new Date().toISOString(),
    };
    this.events.push(row);
    if (this.events.length > 500) this.events = this.events.slice(-400);
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(
      this.filePath,
      this.events.map((e) => JSON.stringify(e)).join("\n") + "\n",
    );
  }

  list(): LogEvent[] {
    return [...this.events].reverse();
  }

  async clear(): Promise<void> {
    this.events = [];
    await rm(this.filePath, { force: true });
  }

  async load(): Promise<void> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      this.events = raw
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as LogEvent)
        .slice(-400);
    } catch {
      this.events = [];
    }
  }

  format(event: LogEvent): string {
    return inspect(event, { breakLength: 120, colors: false });
  }
}
