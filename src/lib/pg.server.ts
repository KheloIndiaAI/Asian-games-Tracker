import postgres from "postgres";

// Raw postgres.js client for the read/write-heavy public API and ingest
// routes. Rows come back with native (snake_case) column names, matching
// the JSON shape the frontend and the voice agent already expect — no
// column-name mapping layer needed. drizzle/schema.ts + drizzle-kit remain
// the source of truth for the schema and migrations; this client just runs
// SQL against it.
//
// Type overrides: postgres.js's defaults (Date objects for date/timestamptz,
// strings for int8/bigint) don't match what this codebase expects — it was
// written against Supabase/PostgREST, which serializes dates as
// "YYYY-MM-DD", timestamps as ISO strings, and doesn't have a bigint
// problem since it goes through JSON either way. Without these overrides,
// every `row.start_time > nowIso` / `row.date_ist === today` comparison
// against a Date object silently fails, emptying the "upcoming"/"next"
// lists, and `short_id` comes back as a string.
const TYPES = {
  date: {
    to: 1082,
    from: [1082],
    serialize: (x: unknown) => String(x),
    parse: (x: string) => x,
  },
  timestamptz: {
    to: 1184,
    from: [1114, 1184],
    serialize: (x: unknown) => (x instanceof Date ? x.toISOString() : String(x)),
    parse: (x: string) => new Date(x).toISOString(),
  },
  int8: {
    to: 20,
    from: [20],
    serialize: (x: unknown) => String(x),
    parse: (x: string) => Number(x),
  },
};

function sslOption(): "require" | false {
  // RDS PostgreSQL defaults to rds.force_ssl = 1 and rejects plaintext
  // connections, so "require" is the safe default. Local/dev Postgres
  // usually has no TLS at all — set PGSSLMODE=disable to turn it off.
  return process.env["PGSSLMODE"] === "disable" ? false : "require";
}

function createSql() {
  const DATABASE_URL = process.env["DATABASE_URL"];
  if (!DATABASE_URL) {
    throw new Error("Missing DATABASE_URL environment variable.");
  }
  return postgres(DATABASE_URL, {
    max: 10,
    ssl: sslOption(),
    types: TYPES,
  });
}

let _sql: ReturnType<typeof createSql> | undefined;

export function getSql() {
  if (!_sql) _sql = createSql();
  return _sql;
}
