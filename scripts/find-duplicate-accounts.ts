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
  console.log(`\n🔍 Cek duplicate akun (owner + platform + email sama)...\n`);

  // Find duplicates: same owner + platform + email
  const dupGroups = await pool.query(`
    SELECT owner, platform, LOWER(email) as email_lc, count(*) as dup_count,
           array_agg(id ORDER BY id) as ids
    FROM ${SCHEMA}.soc_accounts
    WHERE email IS NOT NULL AND TRIM(email) <> ''
    GROUP BY owner, platform, LOWER(email)
    HAVING count(*) > 1
    ORDER BY dup_count DESC, owner
  `);

  if (dupGroups.rows.length === 0) {
    console.log("✅ Tidak ada duplicate. Database bersih.\n");
    await pool.end();
    return;
  }

  console.log(`⚠ Ditemukan ${dupGroups.rows.length} grup duplicate:\n`);

  let totalDupExtra = 0;
  for (const r of dupGroups.rows.slice(0, 30)) {
    const extra = Number(r.dup_count) - 1;
    totalDupExtra += extra;
    console.log(`   ${r.owner.padEnd(12)} ${r.platform.padEnd(12)} ${r.email_lc.padEnd(35)} → ${r.dup_count} entries (${extra} extra), IDs: [${r.ids.join(", ")}]`);
  }
  if (dupGroups.rows.length > 30) {
    console.log(`   ... + ${dupGroups.rows.length - 30} grup lagi`);
  }

  console.log(`\n📊 Summary:`);
  console.log(`   Total grup duplicate: ${dupGroups.rows.length}`);
  console.log(`   Total extra rows yang bisa dihapus: ${totalDupExtra}`);
  console.log(`\n💡 Untuk hapus duplicate (keep ID terkecil aja):`);
  console.log(`   npx tsx scripts/clean-duplicate-accounts.ts`);
  console.log("");

  await pool.end();
}

main().catch((e) => {
  console.error("\n❌ Error:", e.message);
  process.exit(1);
});
