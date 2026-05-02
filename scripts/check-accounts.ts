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

  console.log(`\n📊 Cek akun sosmed di "${SCHEMA}"...\n`);

  // Team members
  const team = await pool.query(
    `SELECT id, username, name, role FROM ${SCHEMA}.team_members ORDER BY id`
  );
  console.log(`📌 Team Members: ${team.rows.length} orang`);
  team.rows.forEach((r: { id: number; username: string; name: string; role: string }) => {
    console.log(`   ${r.id}. ${r.username.padEnd(15)} ${r.name.padEnd(15)} ${r.role}`);
  });

  // Soc accounts (data akun sosmed)
  const soc = await pool.query(
    `SELECT count(*) as c FROM ${SCHEMA}.soc_accounts`
  );
  console.log(`\n📌 soc_accounts (data akun sosmed): ${soc.rows[0].c} record`);

  // Per owner
  const socByOwner = await pool.query(
    `SELECT owner_name, count(*) as c FROM ${SCHEMA}.soc_accounts
     GROUP BY owner_name ORDER BY c DESC`
  );
  if (socByOwner.rows.length > 0) {
    console.log(`\n   Detail per anggota:`);
    socByOwner.rows.forEach((r: { owner_name: string; c: string }) => {
      console.log(`   ${(r.owner_name || "(no owner)").padEnd(20)} ${r.c} akun`);
    });
  }

  // Per platform
  const socByPlatform = await pool.query(
    `SELECT platform, count(*) as c FROM ${SCHEMA}.soc_accounts
     GROUP BY platform ORDER BY c DESC`
  );
  if (socByPlatform.rows.length > 0) {
    console.log(`\n   Detail per platform:`);
    socByPlatform.rows.forEach((r: { platform: string; c: string }) => {
      console.log(`   ${(r.platform || "?").padEnd(20)} ${r.c} akun`);
    });
  }

  // Cek juga di public schema (jangan-jangan data lama ada di sini)
  console.log(`\n📌 Cek public schema (legacy):`);
  try {
    const pubSoc = await pool.query(
      `SELECT count(*) as c FROM public.soc_accounts`
    );
    console.log(`   public.soc_accounts: ${pubSoc.rows[0].c} record`);

    const pubSocOwn = await pool.query(
      `SELECT owner_name, count(*) as c FROM public.soc_accounts
       GROUP BY owner_name ORDER BY c DESC LIMIT 10`
    );
    if (pubSocOwn.rows.length > 0) {
      pubSocOwn.rows.forEach((r: { owner_name: string; c: string }) => {
        console.log(`     ${(r.owner_name || "(no owner)").padEnd(20)} ${r.c} akun`);
      });
    }
  } catch (e) {
    console.log(`   public.soc_accounts: tidak ada / error`);
  }

  try {
    const pubTeam = await pool.query(
      `SELECT count(*) as c FROM public.team_members`
    );
    console.log(`   public.team_members: ${pubTeam.rows[0].c} record`);
  } catch (e) {
    console.log(`   public.team_members: tidak ada`);
  }

  console.log("");
  await pool.end();
}

main().catch((e) => {
  console.error("\n❌ Error:", e.message);
  process.exit(1);
});
