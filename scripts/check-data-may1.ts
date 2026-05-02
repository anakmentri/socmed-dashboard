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
  console.log(`\n📊 Cek data per tanggal (schema "${SCHEMA}")...\n`);

  // Daily work per tanggal
  const dwByDate = await pool.query(
    `SELECT date, count(*) as cnt FROM ${SCHEMA}.daily_work
     GROUP BY date ORDER BY date DESC LIMIT 10`
  );
  console.log("📌 Daily Work (kerjaan harian) per tanggal:");
  if (dwByDate.rows.length === 0) {
    console.log("   ❌ KOSONG — tabel daily_work tidak ada data sama sekali");
  } else {
    dwByDate.rows.forEach((r: { date: string; cnt: string }) => {
      console.log(`   ${r.date}: ${r.cnt} record`);
    });
  }

  // IR data per tanggal
  console.log("\n📌 IR Data per tanggal:");
  const irByDate = await pool.query(
    `SELECT date, count(*) as cnt FROM ${SCHEMA}.ir_data
     GROUP BY date ORDER BY date DESC LIMIT 10`
  );
  if (irByDate.rows.length === 0) {
    console.log("   ❌ KOSONG");
  } else {
    irByDate.rows.forEach((r: { date: string; cnt: string }) => {
      console.log(`   ${r.date}: ${r.cnt} record`);
    });
  }

  // Report items per tanggal
  console.log("\n📌 Report Items per tanggal:");
  const riByDate = await pool.query(
    `SELECT date, count(*) as cnt FROM ${SCHEMA}.report_items
     GROUP BY date ORDER BY date DESC LIMIT 10`
  );
  if (riByDate.rows.length === 0) {
    console.log("   ❌ KOSONG");
  } else {
    riByDate.rows.forEach((r: { date: string; cnt: string }) => {
      console.log(`   ${r.date}: ${r.cnt} record`);
    });
  }

  // Activity log per tanggal
  console.log("\n📌 Activity Log per tanggal (10 terakhir):");
  const alByDate = await pool.query(
    `SELECT DATE(created_at) as date, count(*) as cnt
     FROM ${SCHEMA}.activity_log
     GROUP BY DATE(created_at) ORDER BY date DESC LIMIT 10`
  );
  if (alByDate.rows.length === 0) {
    console.log("   ❌ KOSONG");
  } else {
    alByDate.rows.forEach((r: { date: string; cnt: string }) => {
      console.log(`   ${r.date}: ${r.cnt} aktivitas`);
    });
  }

  // Twitter posts per tanggal
  console.log("\n📌 Twitter Posts per tanggal:");
  const tpByDate = await pool.query(
    `SELECT DATE(created_at) as date, count(*) as cnt
     FROM ${SCHEMA}.twitter_posts
     GROUP BY DATE(created_at) ORDER BY date DESC LIMIT 10`
  );
  if (tpByDate.rows.length === 0) {
    console.log("   ❌ KOSONG");
  } else {
    tpByDate.rows.forEach((r: { date: string; cnt: string }) => {
      console.log(`   ${r.date}: ${r.cnt} post`);
    });
  }

  // Team members
  console.log("\n📌 Team Members aktif:");
  const team = await pool.query(
    `SELECT username, name, role FROM ${SCHEMA}.team_members ORDER BY id`
  );
  team.rows.forEach((r: { username: string; name: string; role: string }) => {
    console.log(`   ${r.username.padEnd(15)} ${r.name.padEnd(15)} ${r.role || ""}`);
  });

  console.log("");
  await pool.end();
}

main().catch((e) => {
  console.error("\n❌ Error:", e.message);
  process.exit(1);
});
