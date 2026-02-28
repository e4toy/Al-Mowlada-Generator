import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "../shared/schema";

const { Pool } = pg;

let pool: pg.Pool | null = null;

function getPool(): pg.Pool {
  if (!pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is not set");
    }
    const isExternal = !process.env.DATABASE_URL.includes('localhost') && !process.env.DATABASE_URL.includes('127.0.0.1');
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
      ...(isExternal ? { ssl: { rejectUnauthorized: false } } : {}),
    });
  }
  return pool;
}

export function getDb() {
  return drizzle(getPool(), { schema });
}

export { schema };
