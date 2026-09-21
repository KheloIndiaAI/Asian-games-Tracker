import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../../drizzle/schema";

function createDb() {
  const DATABASE_URL = process.env["DATABASE_URL"];
  if (!DATABASE_URL) {
    throw new Error("Missing DATABASE_URL environment variable.");
  }
  const client = postgres(DATABASE_URL, { max: 10 });
  return drizzle(client, { schema });
}

let _db: ReturnType<typeof createDb> | undefined;

export function getDb() {
  if (!_db) _db = createDb();
  return _db;
}

export const db = new Proxy({} as ReturnType<typeof createDb>, {
  get(_, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver);
  },
});

export * as schema from "../../drizzle/schema";
