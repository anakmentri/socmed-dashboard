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

  // Get column info
  const cols = await pool.query(
    `SELECT column_name, data_type FROM information_schema.columns
     WHERE table_schema = $1 AND table_name = 'soc_accounts'
     ORDER BY ordinal_position`,
    [SCHEMA]
  );
  console.log("\n📋 Kolom soc_accounts:");
  cols.rows.forEach((c: { column_name: string; data_type: string }) => {
    console.log(`   ${c.column_name.padEnd(25)} ${c.data_type}`);
  });

  // Sample data
  const sample = await pool.query(
    `SELECT * FROM ${SCHEMA}.soc_accounts LIMIT 3`
  );
  console.log("\n📋 Sample 3 row:");
  sample.rows.forEach((r: Record<string, unknown>, i: number) => {
    console.log(`\n   Row ${i + 1}:`);
    Object.entries(r).forEach(([k, v]) => {
      const val = typeof v === "string" && v.length > 80 ? v.slice(0, 80) + "..." : String(v);
      console.log(`     ${k.padEnd(20)} = ${val}`);
    });
  });

  // Count by anggota field (kalau ada)
  console.log("\n📋 Total per kolom kemungkinan owner:");
  const candidates = ["anggota", "team_member", "owner", "user", "name", "member_name"];
  for (const c of candidates) {
    try {
      const r = await pool.query(
        `SELECT ${c}, count(*) as cnt FROM ${SCHEMA}.soc_accounts
         GROUP BY ${c} ORDER BY cnt DESC LIMIT 10`
      );
      if (r.rows.length > 0) {
        console.log(`\n   Kolom "${c}":`);
        r.rows.forEach((row: Record<string, unknown>) => {
          console.log(`     ${String(row[c] || "(null)").padEnd(20)} ${row.cnt} akun`);
        });
      }
    } catch {
      // column not exist, skip
    }
  }

  console.log("");
  await pool.end();
}

main().catch((e) => {
  console.error("\n❌ Error:", e.message);
  process.exit(1);
});
