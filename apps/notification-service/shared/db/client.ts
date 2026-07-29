import { drizzle } from "drizzle-orm/d1";

export type DB = ReturnType<typeof drizzle>;

/** Creates a Drizzle DB instance bound to the given D1 database. */
export function createDb(d1: D1Database): DB {
  return drizzle(d1);
}
