// Vercel Cron: gradual recheck banned accounts via Twitter syndication.
// Run setiap jam, cek 25 akun (sesuai rate limit ~30/min Twitter syndication).
// Auto-unban yang ternyata aktif (false positive).
//
// Schedule: setiap jam (0 * * * *)
// Total ~169 banned accounts, target selesai dalam 7 jam.
//
// Manual trigger:
// curl "https://socmedanalytics.com/api/cron/recheck-banned?key=<CRON_SECRET>"

import { NextRequest, NextResponse } from "next/server";
import { getPool, SCHEMA } from "@/lib/pg";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300; // 5 menit max

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// Berapa akun di-cek per run. Sesuai rate limit ~30/min, kita pakai 25 untuk safety.
const ACCOUNTS_PER_RUN = 25;
const DELAY_MS = 2500; // 2.5s between requests = ~24/min

type CheckResult = {
  active: boolean | null;
  reason: string;
};

async function checkTwitter(username: string): Promise<CheckResult> {
  const u = username.replace(/^@/, "").trim();
  if (!u) return { active: null, reason: "empty username" };
  try {
    const res = await fetch(
      `https://syndication.twitter.com/srv/timeline-profile/screen-name/${encodeURIComponent(u)}`,
      {
        headers: {
          "User-Agent": UA,
          Accept: "text/html,application/xhtml+xml",
          Referer: "https://platform.twitter.com/",
        },
        signal: AbortSignal.timeout(10000),
      }
    );
    if (res.status === 429) return { active: null, reason: "rate limited" };
    if (res.status !== 200)
      return { active: null, reason: `HTTP ${res.status}` };
    const body = await res.text();
    if (
      body.includes("profile_image_url_https") ||
      body.includes('"followers_count"')
    )
      return { active: true, reason: "profile data found" };
    if (
      body.includes('"hasResults":false') &&
      body.includes('"entries":[]') &&
      body.length < 5000
    )
      return { active: false, reason: "suspended (no timeline)" };
    if (body.length < 3000)
      return { active: false, reason: "suspended (no data)" };
    return { active: null, reason: "inconclusive" };
  } catch (e) {
    return {
      active: null,
      reason: e instanceof Error ? e.message.slice(0, 50) : "error",
    };
  }
}

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  const queryKey = req.nextUrl.searchParams.get("key");
  const isVercelCron = authHeader === `Bearer ${cronSecret}`;
  const isManualWithSecret = cronSecret && queryKey === cronSecret;

  if (cronSecret && !isVercelCron && !isManualWithSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const pool = getPool();

  // Ambil banned X (Twitter) accounts yang BELUM dicek baru-baru ini.
  // Pakai LIMIT untuk batch processing.
  // Kita random ORDER biar setiap run cek subset berbeda.
  const r = await pool.query(
    `SELECT s.id, s.owner, s.username
     FROM ${SCHEMA}.soc_accounts s
     JOIN ${SCHEMA}.banned_accounts b ON s.id = b.account_id
     WHERE s.platform = 'X (Twitter)' AND s.username IS NOT NULL
     ORDER BY RANDOM()
     LIMIT $1`,
    [ACCOUNTS_PER_RUN]
  );

  if (r.rows.length === 0) {
    return NextResponse.json({
      ok: true,
      message: "Tidak ada banned X (Twitter) accounts. Selesai!",
      checked: 0,
    });
  }

  const counts = { active: 0, suspended: 0, rateLimited: 0, unknown: 0 };
  const toUnban: number[] = [];
  const details: Array<{
    id: number;
    owner: string;
    username: string;
    result: string;
  }> = [];

  for (let i = 0; i < r.rows.length; i++) {
    const row = r.rows[i];
    const result = await checkTwitter(row.username);

    let label = "";
    if (result.active === true) {
      counts.active++;
      toUnban.push(row.id);
      label = "active";
    } else if (result.active === false) {
      counts.suspended++;
      label = "suspended";
    } else if (result.reason.includes("rate")) {
      counts.rateLimited++;
      label = "rate-limited";
    } else {
      counts.unknown++;
      label = "unknown";
    }
    details.push({
      id: row.id,
      owner: row.owner,
      username: row.username,
      result: label,
    });

    // Delay antar request (skip kalau last item)
    if (i < r.rows.length - 1) {
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }

  // Auto-unban yang terverifikasi aktif
  if (toUnban.length > 0) {
    const placeholders = toUnban.map((_, i) => `$${i + 1}`).join(",");
    await pool.query(
      `DELETE FROM ${SCHEMA}.banned_accounts WHERE account_id IN (${placeholders})`,
      toUnban
    );
    await pool.query(
      `INSERT INTO ${SCHEMA}.activity_log (who, role, action, source, detail) VALUES ('admin', 'Administrator', 'Auto-Unban (Cron)', 'Akun Sosmed', $1)`,
      [
        `${toUnban.length} akun terverifikasi aktif via syndication API (cron run)`,
      ]
    );
  }

  // Cek total banned tersisa
  const remaining = await pool.query(
    `SELECT COUNT(*) AS c FROM ${SCHEMA}.banned_accounts b
     JOIN ${SCHEMA}.soc_accounts s ON s.id = b.account_id
     WHERE s.platform = 'X (Twitter)'`
  );

  return NextResponse.json({
    ok: true,
    checked: r.rows.length,
    counts,
    unbanned: toUnban.length,
    remaining_banned_x: parseInt(remaining.rows[0].c, 10),
    details,
  });
}
