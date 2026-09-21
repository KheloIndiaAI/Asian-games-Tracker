import postgres from "postgres";

// Raw postgres.js client for the read/write-heavy public API and ingest
// routes. Rows come back with native (snake_case) column names, matching
// the JSON shape the frontend and the voice agent already expect — no
// column-name mapping layer needed. drizzle/schema.ts + drizzle-kit remain
// the source of truth for the schema and migrations; this client just runs
// SQL against it.
function createSql() {
  const DATABASE_URL = process.env["DATABASE_URL"];
  if (!DATABASE_URL) {
    throw new Error("Missing DATABASE_URL environment variable.");
  }
  return postgres(DATABASE_URL, { max: 10 });
}

let _sql: ReturnType<typeof createSql> | undefined;

export function getSql() {
  if (!_sql) _sql = createSql();
  return _sql;
}
