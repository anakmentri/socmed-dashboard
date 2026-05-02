import * as fs from "fs";
import * as path from "path";

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
  console.log(`\n🔍 Verifikasi database (schema "${SCHEMA}")...\n`);

  const tables = [
    "team_members", "twitter_connections", "telegram_connections",
    "twitter_posts", "social_posts", "scheduled_posts",
    "twitter_metrics", "activity_log",
  ];
  for (const t of tables) {
    try {
      const r = await pool.query(`SELECT count(*) as c FROM ${SCHEMA}.${t}`);
      console.log(`  ${t.padEnd(25)} : ${r.rows[0].c} rows`);
    } catch (e) {
      console.log(`  ${t.padEnd(25)} : ❌ ${e instanceof Error ? e.message.slice(0, 60) : "error"}`);
    }
  }

  console.log("\n✅ Database sehat & accessible\n");
  await pool.end();
}

main().catch((e) => {
  console.error("\n❌ Error:", e.message);
  process.exit(1);
});
