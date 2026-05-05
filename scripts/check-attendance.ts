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
  console.log(`\n📅 Cek attendance data\n`);

  // Schema
  const cols = await pool.query(
    `SELECT column_name, data_type FROM information_schema.columns
     WHERE table_schema = $1 AND table_name = 'attendance'
     ORDER BY ordinal_position`,
    [SCHEMA]
  );
  console.log("📋 Kolom attendance:");
  cols.rows.forEach((c: { column_name: string; data_type: string }) => {
    console.log(`   ${c.column_name.padEnd(20)} ${c.data_type}`);
  });

  // Total
  const total = await pool.query(`SELECT count(*) as c FROM ${SCHEMA}.attendance`);
  console.log(`\n📊 Total record: ${total.rows[0].c}`);

  // Per status (libur/kerja/offday)
  const byStatus = await pool.query(
    `SELECT status, count(*) as c FROM ${SCHEMA}.attendance
     GROUP BY status ORDER BY c DESC`
  );
  console.log(`\n📊 Per status:`);
  byStatus.rows.forEach((r: { status: string; c: string }) => {
    console.log(`   ${(r.status || "(null)").padEnd(15)} ${r.c} record`);
  });

  // 10 record terbaru (sort by updated_at)
  const recent = await pool.query(
    `SELECT date, name, status, note, updated_at FROM ${SCHEMA}.attendance
     ORDER BY updated_at DESC LIMIT 15`
  );
  console.log(`\n📊 15 record terbaru (by updated_at):`);
  recent.rows.forEach((r: { date: string; name: string; status: string; note: string; updated_at: string }) => {
    console.log(`   ${r.date} | ${r.name.padEnd(10)} | ${r.status.padEnd(10)} | ${(r.note || "").padEnd(20)} | ${r.updated_at}`);
  });

  // Per tanggal (recent dates)
  const byDate = await pool.query(
    `SELECT date, count(*) as c, array_agg(name) as names FROM ${SCHEMA}.attendance
     GROUP BY date ORDER BY date DESC LIMIT 10`
  );
  console.log(`\n📊 Per tanggal (10 terbaru):`);
  byDate.rows.forEach((r: { date: string; c: string; names: string[] }) => {
    console.log(`   ${r.date}: ${r.c} record [${r.names.join(", ")}]`);
  });

  console.log("");
  await pool.end();
}

main().catch((e) => {
  console.error("\n❌ Error:", e.message);
  process.exit(1);
});
