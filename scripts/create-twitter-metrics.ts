// Run: npx tsx scripts/create-twitter-metrics.ts
import * as fs from "fs";
import * as path from "path";

// Manual load .env.local (no dotenv dep)
const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

import { getPool, SCHEMA } from "../lib/pg";

async function main() {
  const pool = getPool();

  console.log(`Creating tables in schema "${SCHEMA}"...`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${SCHEMA}.twitter_metrics (
      id bigserial PRIMARY KEY,
      connection_id bigint NOT NULL,
      owner_name text NOT NULL,
      twitter_username text NOT NULL,
      snapshot_date date NOT NULL,
      followers_count int NOT NULL DEFAULT 0,
      following_count int NOT NULL DEFAULT 0,
      tweet_count int NOT NULL DEFAULT 0,
      listed_count int NOT NULL DEFAULT 0,
      created_at timestamptz DEFAULT now(),
      UNIQUE (connection_id, snapshot_date)
    );
  `);
  console.log("✓ twitter_metrics created");

  await pool.query(`
    CREATE INDEX IF NOT EXISTS twitter_metrics_owner_date_idx
      ON ${SCHEMA}.twitter_metrics (owner_name, snapshot_date DESC);
  `);
  console.log("✓ twitter_metrics index created");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${SCHEMA}.twitter_post_metrics (
      id bigserial PRIMARY KEY,
      connection_id bigint NOT NULL,
      tweet_id text NOT NULL,
      owner_name text NOT NULL,
      twitter_username text NOT NULL,
      like_count int NOT NULL DEFAULT 0,
      retweet_count int NOT NULL DEFAULT 0,
      reply_count int NOT NULL DEFAULT 0,
      quote_count int NOT NULL DEFAULT 0,
      impression_count int NOT NULL DEFAULT 0,
      bookmark_count int NOT NULL DEFAULT 0,
      tweet_created_at timestamptz,
      fetched_at timestamptz DEFAULT now(),
      UNIQUE (tweet_id)
    );
  `);
  console.log("✓ twitter_post_metrics created");

  await pool.query(`
    CREATE INDEX IF NOT EXISTS twitter_post_metrics_owner_idx
      ON ${SCHEMA}.twitter_post_metrics (owner_name, fetched_at DESC);
  `);
  console.log("✓ twitter_post_metrics index created");

  console.log("\n✅ All done");
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
