// Ingest scheduler — the in-process replacement for the old pg_cron + pg_net
// jobs (see docs/AWS_MIGRATION.md §4). Runs as its own long-lived systemd
// service on the EC2 instance, separate from the web process, and calls the
// ingest engine directly instead of round-tripping through HTTP.
//
// Run with: node --import tsx src/worker/index.ts   (see package.json "worker" script)

import { getSql } from "../lib/pg.server";
import { newCtx, runIngestMode, indiaLiveWindowActive } from "../server/ingest-engine";

const sql = getSql();
const MIN = 60_000;
const HOUR = 60 * MIN;

const running = new Set<string>();

function log(name: string, result: unknown) {
  console.log(`[worker] ${new Date().toISOString()} ${name}`, JSON.stringify(result));
}

async function runJob(name: string, fn: () => Promise<void>) {
  if (running.has(name)) {
    console.warn(`[worker] skipping ${name}: previous run still in progress`);
    return;
  }
  running.add(name);
  try {
    await fn();
  } catch (err) {
    console.error(`[worker] ${name} failed:`, err);
  } finally {
    running.delete(name);
  }
}

/** Runs `fn` once after `initialDelayMs`, then every `intervalMs`. Skips overlapping runs of the same job. */
function schedule(name: string, intervalMs: number, initialDelayMs: number, fn: () => Promise<void>) {
  setTimeout(() => {
    void runJob(name, fn);
    setInterval(() => void runJob(name, fn), intervalMs);
  }, initialDelayMs);
}

// ag-cycle-today: */5 * * * *
schedule("cycle-today", 5 * MIN, 0, async () => {
  log("cycle-today", await runIngestMode(sql, "cycle", {}));
});

// ag-cycle-tomorrow: 1-56/5 * * * * (offset a minute from "today" so they don't collide)
schedule("cycle-tomorrow", 5 * MIN, 1 * MIN, async () => {
  log("cycle-tomorrow", await runIngestMode(sql, "cycle", { offset: "1" }));
});

// ag-results: 2-57/5 * * * *
schedule("results", 5 * MIN, 2 * MIN, async () => {
  log("results", await runIngestMode(sql, "results", { limit: "25" }));
});

// ag-live: * * * * *, guarded — only fetches when an India item is live,
// starting within 2 minutes, or started within the last 20.
schedule("live", 1 * MIN, 0, async () => {
  const active = await indiaLiveWindowActive(newCtx(sql));
  if (!active) return;
  log("live", await runIngestMode(sql, "live", { limit: "30" }));
});

// ag-medals: */10 * * * *
schedule("medals", 10 * MIN, 0, async () => {
  log("medals", await runIngestMode(sql, "medals", {}));
});

// ag-entries: 0 */6 * * *
schedule("entries", 6 * HOUR, 0, async () => {
  log("entries", await runIngestMode(sql, "entries", {}));
});

// ag-sweep-MM-DD x16: 6-hourly full sweep of every competition day, staggered
// so the feed doesn't get hit with 16 requests at once.
const GAMES_START = "2026-09-19";
const GAMES_END = "2026-10-04";
function gamesDates(): string[] {
  const dates: string[] = [];
  const d = new Date(`${GAMES_START}T00:00:00Z`);
  const end = new Date(`${GAMES_END}T00:00:00Z`);
  while (d <= end) {
    dates.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return dates;
}
schedule("sweep", 6 * HOUR, 30 * MIN, async () => {
  for (const date of gamesDates()) {
    log("sweep", await runIngestMode(sql, "day", { date }));
    await new Promise((r) => setTimeout(r, 2000));
  }
});

// ag-fetchlog-cleanup: 15 3 * * * — daily is close enough for a housekeeping job.
schedule("fetchlog-cleanup", 24 * HOUR, 0, async () => {
  const result = await sql`DELETE FROM fetch_log WHERE started_at < now() - interval '3 days'`;
  log("fetchlog-cleanup", { deleted: result.count });
});

console.log(`[worker] started ${new Date().toISOString()}`);

process.on("SIGTERM", () => {
  console.log("[worker] SIGTERM received, exiting");
  process.exit(0);
});
