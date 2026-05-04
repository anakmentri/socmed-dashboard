// Hapus duplicate akun (owner + platform + email sama).
// Strategi: keep ID terkecil per grup (= entry asli yang pertama insert),
// hapus duplicate berikutnya.
//
// SAFE: dry-run dulu (set DRY_RUN=true di env atau hardcoded).
// Setelah review output, set DRY_RUN=false untuk eksekusi.
//
// Run:
//   npx tsx scripts/clean-duplicate-accounts.ts        (DRY RUN)
//   DRY_RUN=false npx tsx scripts/clean-duplicate-accounts.ts  (LIVE)

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

const DRY_RUN = process.env.DRY_RUN !== "false"; // default safe = dry run

async function main() {
  const pool = getPool();
  console.log(`\n🧹 Clean duplicate akun (DRY_RUN=${DRY_RUN})\n`);

  // Find all duplicate groups
  const dupGroups = await pool.query(`
    SELECT owner, platform, LOWER(email) as email_lc,
           array_agg(id ORDER BY id) as ids
    FROM ${SCHEMA}.soc_accounts
    WHERE email IS NOT NULL AND TRIM(email) <> ''
    GROUP BY owner, platform, LOWER(email)
    HAVING count(*) > 1
  `);

  if (dupGroups.rows.length === 0) {
    console.log("✅ Tidak ada duplicate. Database bersih.\n");
    await pool.end();
    return;
  }

  // Collect IDs to delete (semua kecuali yang pertama)
  const toDelete: number[] = [];
  for (const r of dupGroups.rows) {
    const ids = r.ids as number[];
    // Keep ids[0] (terkecil), hapus sisanya
    for (let i = 1; i < ids.length; i++) {
      toDelete.push(ids[i]);
    }
  }

  console.log(`📊 Akan hapus ${toDelete.length} duplicate dari ${dupGroups.rows.length} grup`);
  console.log(`   IDs (sample 20 pertama): [${toDelete.slice(0, 20).join(", ")}]`);

  if (DRY_RUN) {
    console.log(`\n⚠ DRY RUN — tidak ada yang dihapus.`);
    console.log(`   Untuk eksekusi: DRY_RUN=false npx tsx scripts/clean-duplicate-accounts.ts\n`);
    await pool.end();
    return;
  }

  // Live execute — batch DELETE 100 IDs per query untuk efficient
  console.log(`\n🔥 Eksekusi DELETE...`);
  let deleted = 0;
  for (let i = 0; i < toDelete.length; i += 100) {
    const batch = toDelete.slice(i, i + 100);
    const placeholders = batch.map((_, idx) => `$${idx + 1}`).join(",");
    const r = await pool.query(
      `DELETE FROM ${SCHEMA}.soc_accounts WHERE id IN (${placeholders})`,
      batch
    );
    deleted += r.rowCount || 0;
    console.log(`   ✓ Batch ${Math.floor(i / 100) + 1}: ${r.rowCount} deleted`);
  }

  console.log(`\n✅ Total ${deleted} duplicate dihapus.\n`);

  // Verify
  const finalCount = await pool.query(
    `SELECT count(*) as c FROM ${SCHEMA}.soc_accounts`
  );
  console.log(`📌 Total akun sosmed sekarang: ${finalCount.rows[0].c}\n`);

  await pool.end();
}

main().catch((e) => {
  console.error("\n❌ Error:", e.message);
  process.exit(1);
});
