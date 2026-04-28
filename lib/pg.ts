// Direct PostgreSQL client untuk twitterdood schema (bypass PostgREST)
// Pakai Supabase Pooler 6543 (pgbouncer transaction mode)
import { Pool } from "pg";

let _pool: Pool | null = null;

export function getPool(): Pool {
  if (_pool) return _pool;
  _pool = new Pool({
    host: process.env.PG_HOST || "aws-1-ap-southeast-1.pooler.supabase.com",
    port: Number(process.env.PG_PORT || 6543),
    database: process.env.PG_DATABASE || "postgres",
    user: process.env.PG_USER!,
    password: process.env.PG_PASSWORD!,
    ssl: { rejectUnauthorized: false },
    // Pooler 6543 = pgbouncer transaction mode → disable prepared statements
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  return _pool;
}

export const SCHEMA = "twitterdood";
