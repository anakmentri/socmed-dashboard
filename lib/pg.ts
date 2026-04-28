// Direct PostgreSQL client untuk twitterdood schema (bypass PostgREST)
// Pakai Supabase Pooler 6543 (pgbouncer transaction mode)
import { Pool, types } from "pg";

// Default-nya pg parse bigint (OID 20) jadi STRING karena JS number gak bisa
// represent semua bigint. Tapi ID kita aman dalam range Number.MAX_SAFE_INTEGER,
// jadi parse jadi number biar match perilaku Supabase PostgREST.
types.setTypeParser(20, (val) => (val == null ? null : parseInt(val, 10)));
// numeric (OID 1700) → number juga
types.setTypeParser(1700, (val) => (val == null ? null : parseFloat(val)));

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
