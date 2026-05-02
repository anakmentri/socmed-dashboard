// =====================================================================
// INIT DATABASE — Dashboard Doodstream
//
// Script ini bikin SEMUA tabel + index + seed data di schema twitterdood.
// Aman dijalankan berulang kali (pakai IF NOT EXISTS).
//
// Cara pakai:
//   1. Pastikan .env.local sudah berisi PG_HOST, PG_PORT, PG_USER, PG_PASSWORD
//   2. Run: npx tsx scripts/init-database.ts
// =====================================================================
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

  console.log(`\n🚀 Init database di schema "${SCHEMA}"...\n`);

  // ============ STEP 1: Schema ============
  await pool.query(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA};`);
  console.log(`✓ Schema "${SCHEMA}" ready`);

  // ============ STEP 2: Core tables (team, attendance, log) ============
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${SCHEMA}.team_members (
      id bigserial PRIMARY KEY,
      username text UNIQUE NOT NULL,
      password text NOT NULL,
      name text NOT NULL,
      role text,
      color text,
      platforms jsonb DEFAULT '[]',
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    );
  `);
  console.log("✓ team_members");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${SCHEMA}.attendance (
      id bigserial PRIMARY KEY,
      date text NOT NULL,
      name text NOT NULL,
      status text NOT NULL DEFAULT 'kerja',
      note text DEFAULT '',
      updated_at timestamptz DEFAULT now(),
      UNIQUE (date, name)
    );
  `);
  console.log("✓ attendance");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${SCHEMA}.activity_log (
      id bigserial PRIMARY KEY,
      who text,
      role text,
      action text,
      source text,
      detail text,
      created_at timestamptz DEFAULT now()
    );
  `);
  console.log("✓ activity_log");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${SCHEMA}.banned_accounts (
      account_id bigint PRIMARY KEY,
      banned_at timestamptz DEFAULT now()
    );
  `);
  console.log("✓ banned_accounts");

  // ============ STEP 3: Daily work + report tables ============
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${SCHEMA}.daily_work (
      id bigserial PRIMARY KEY,
      date text NOT NULL,
      name text NOT NULL,
      title text,
      status text DEFAULT 'pending',
      notes text,
      verify_link text,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    );
  `);
  console.log("✓ daily_work");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${SCHEMA}.ir_data (
      id bigserial PRIMARY KEY,
      date text NOT NULL,
      anggota text NOT NULL,
      data jsonb DEFAULT '{}',
      created_at timestamptz DEFAULT now()
    );
  `);
  console.log("✓ ir_data");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${SCHEMA}.report_items (
      id bigserial PRIMARY KEY,
      date text NOT NULL,
      name text NOT NULL,
      title text,
      content text,
      category text DEFAULT 'post',
      created_at timestamptz DEFAULT now()
    );
  `);
  console.log("✓ report_items");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${SCHEMA}.platforms (
      id bigserial PRIMARY KEY,
      name text UNIQUE NOT NULL,
      color text,
      icon text,
      created_at timestamptz DEFAULT now()
    );
  `);
  console.log("✓ platforms");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${SCHEMA}.assets (
      id bigserial PRIMARY KEY,
      name text NOT NULL,
      type text,
      url text,
      uploaded_by text,
      created_at timestamptz DEFAULT now()
    );
  `);
  console.log("✓ assets");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${SCHEMA}.soc_accounts (
      id bigserial PRIMARY KEY,
      platform text NOT NULL,
      username text NOT NULL,
      url text,
      owner_name text,
      status text DEFAULT 'active',
      notes text,
      created_at timestamptz DEFAULT now()
    );
  `);
  console.log("✓ soc_accounts");

  // ============ STEP 4: Twitter integration ============
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${SCHEMA}.twitter_connections (
      id bigserial PRIMARY KEY,
      owner_name text NOT NULL,
      twitter_user_id text,
      twitter_username text,
      access_token text NOT NULL,
      refresh_token text,
      expires_at timestamptz,
      scope text,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    );
  `);
  console.log("✓ twitter_connections");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${SCHEMA}.twitter_posts (
      id bigserial PRIMARY KEY,
      connection_id bigint REFERENCES ${SCHEMA}.twitter_connections(id) ON DELETE CASCADE,
      posted_by text,
      tweet_id text,
      text_content text,
      media_url text,
      status text DEFAULT 'posted',
      error text,
      post_group text,
      created_at timestamptz DEFAULT now()
    );
  `);
  console.log("✓ twitter_posts");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${SCHEMA}.twitter_oauth_states (
      state text PRIMARY KEY,
      code_verifier text NOT NULL,
      owner_name text,
      created_at timestamptz DEFAULT now()
    );
  `);
  console.log("✓ twitter_oauth_states");

  // ============ STEP 5: Telegram integration ============
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${SCHEMA}.telegram_connections (
      id bigserial PRIMARY KEY,
      owner_name text NOT NULL,
      bot_token text NOT NULL,
      chat_id text NOT NULL,
      chat_title text,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    );
  `);
  console.log("✓ telegram_connections");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${SCHEMA}.social_posts (
      id bigserial PRIMARY KEY,
      platform text NOT NULL,
      posted_by text,
      target_owner text,
      content text,
      media_type text,
      status text DEFAULT 'posted',
      error text,
      external_id text,
      post_group text,
      created_at timestamptz DEFAULT now()
    );
  `);
  console.log("✓ social_posts");

  // ============ STEP 6: Auto Post Scheduler ============
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${SCHEMA}.content_library (
      id bigserial PRIMARY KEY,
      name text NOT NULL,
      text_content text,
      media_base64 text,
      media_url text,
      active boolean DEFAULT true,
      used_count int DEFAULT 0,
      last_used_at timestamptz,
      created_by text,
      created_at timestamptz DEFAULT now()
    );
  `);
  console.log("✓ content_library");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${SCHEMA}.post_schedules (
      id bigserial PRIMARY KEY,
      name text NOT NULL,
      platform text NOT NULL DEFAULT 'twitter',
      owner_name text NOT NULL,
      target_group text NOT NULL,
      hour_utc int NOT NULL,
      minute int DEFAULT 0,
      frequency text DEFAULT 'daily',
      content_mode text DEFAULT 'random',
      specific_content_id bigint,
      active boolean DEFAULT true,
      last_run_at timestamptz,
      created_by text,
      created_at timestamptz DEFAULT now()
    );
  `);
  console.log("✓ post_schedules");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${SCHEMA}.scheduled_runs (
      id bigserial PRIMARY KEY,
      schedule_id bigint REFERENCES ${SCHEMA}.post_schedules(id) ON DELETE CASCADE,
      content_id bigint,
      status text NOT NULL,
      posted_count int DEFAULT 0,
      failed_count int DEFAULT 0,
      errors jsonb,
      created_at timestamptz DEFAULT now()
    );
  `);
  console.log("✓ scheduled_runs");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${SCHEMA}.scheduled_posts (
      id bigserial PRIMARY KEY,
      platform text NOT NULL DEFAULT 'twitter',
      owner_name text NOT NULL,
      target_group text NOT NULL,
      text_content text NOT NULL,
      media_base64 text,
      media_url text,
      scheduled_at timestamptz NOT NULL,
      fired_at timestamptz,
      status text DEFAULT 'pending',
      posted_count int DEFAULT 0,
      failed_count int DEFAULT 0,
      errors jsonb,
      created_by text,
      created_at timestamptz DEFAULT now()
    );
  `);
  console.log("✓ scheduled_posts");

  // ============ STEP 7: Twitter Analytics ============
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
  await pool.query(`
    CREATE INDEX IF NOT EXISTS twitter_metrics_owner_date_idx
      ON ${SCHEMA}.twitter_metrics (owner_name, snapshot_date DESC);
  `);
  console.log("✓ twitter_metrics");

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
  await pool.query(`
    CREATE INDEX IF NOT EXISTS twitter_post_metrics_owner_idx
      ON ${SCHEMA}.twitter_post_metrics (owner_name, fetched_at DESC);
  `);
  console.log("✓ twitter_post_metrics");

  // ============ STEP 8: Seed admin user ============
  const seedRes = await pool.query(
    `SELECT count(*) as c FROM ${SCHEMA}.team_members`
  );
  const existingCount = Number(seedRes.rows[0].c);
  if (existingCount === 0) {
    await pool.query(`
      INSERT INTO ${SCHEMA}.team_members (username, password, name, role, color, platforms)
      VALUES ('admin', 'admin123', 'admin', 'admin', '#38bdf8',
              '["X (Twitter)","Telegram"]'::jsonb);
    `);
    console.log("✓ Seeded default admin (username: admin, password: admin123)");
  } else {
    console.log(`✓ Skip seed (already ada ${existingCount} team_members)`);
  }

  console.log("\n✅ Database init selesai!\n");
  console.log("Default login:");
  console.log("  Username: admin");
  console.log("  Password: admin123");
  console.log("  ⚠ GANTI password setelah login pertama!\n");

  await pool.end();
}

main().catch((e) => {
  console.error("\n❌ Error:", e.message);
  process.exit(1);
});
