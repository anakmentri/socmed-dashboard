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

// Default 9 anggota dari lib/auth.ts (hardcoded master list)
const DEFAULT_MEMBERS = [
  { username: "tlegu", password: "tlegu123", name: "Tlegu", role: "Team Leader", color: "#38bdf8", platforms: ["Instagram", "X (Twitter)", "TikTok"] },
  { username: "rully", password: "rully123", name: "Rully", role: "Editor Video", color: "#ec4899", platforms: ["YouTube", "TikTok"] },
  { username: "aprianto", password: "aprianto123", name: "Aprianto", role: "Video Editor", color: "#a78bfa", platforms: ["YouTube", "TikTok"] },
  { username: "meyji", password: "meyji123", name: "Meyji", role: "Social Media Specialist", color: "#34d399", platforms: ["Instagram", "Facebook"] },
  { username: "yanto", password: "yanto123", name: "Yanto", role: "Graphic Designer", color: "#fb923c", platforms: ["Instagram"] },
  { username: "savanda", password: "savanda123", name: "Savanda", role: "Graphic Designer", color: "#fbbf24", platforms: ["Instagram"] },
  { username: "faisol", password: "faisol123", name: "Faisol", role: "Content Creator", color: "#f87171", platforms: ["X (Twitter)", "Telegram"] },
  { username: "wahyudi", password: "wahyudi123", name: "Wahyudi", role: "Social Media Specialist", color: "#06b6d4", platforms: ["Instagram", "Facebook", "X (Twitter)"] },
  { username: "soir", password: "soir123", name: "Soir", role: "Content Creator", color: "#10b981", platforms: ["TikTok", "Telegram"] },
];

async function main() {
  const pool = getPool();

  console.log(`\n🔧 Restore anggota ke team_members...\n`);

  // Existing members
  const existing = await pool.query(
    `SELECT username FROM ${SCHEMA}.team_members`
  );
  const existingUsernames = new Set(existing.rows.map((r: { username: string }) => r.username));
  console.log(`📌 Sudah ada di DB: ${existing.rows.length} anggota`);
  existing.rows.forEach((r: { username: string }) => console.log(`   - ${r.username}`));

  // Restore missing members
  console.log(`\n📌 Restore yang hilang:`);
  let restored = 0;
  for (const m of DEFAULT_MEMBERS) {
    if (existingUsernames.has(m.username)) continue;
    await pool.query(
      `INSERT INTO ${SCHEMA}.team_members (username, password, name, role, color, platforms)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [m.username, m.password, m.name, m.role, m.color, JSON.stringify(m.platforms)]
    );
    console.log(`   ✓ Restored ${m.username} (${m.name}) — ${m.role}`);
    restored++;
  }

  if (restored === 0) {
    console.log(`   (semua anggota sudah ada, tidak ada yang perlu di-restore)`);
  }

  // Final state
  const final = await pool.query(
    `SELECT username, name, role FROM ${SCHEMA}.team_members ORDER BY id`
  );
  console.log(`\n✅ Total anggota sekarang: ${final.rows.length}`);
  final.rows.forEach((r: { username: string; name: string; role: string }) => {
    console.log(`   ${r.username.padEnd(15)} ${r.name.padEnd(15)} ${r.role}`);
  });

  console.log("");
  await pool.end();
}

main().catch((e) => {
  console.error("\n❌ Error:", e.message);
  process.exit(1);
});
