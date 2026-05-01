// Auto-post cron: dijalankan tiap jam (Vercel Hobby = daily, atau external
// cron-job.org untuk hourly). Cek schedule yang due, fire bulk post.
//
// Manual trigger: curl "https://socmedanalytics.com/api/cron/auto-post?key=<CRON_SECRET>"

import { NextRequest, NextResponse } from "next/server";
import { getPool, SCHEMA } from "@/lib/pg";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

type ContentItem = {
  id: number;
  name: string;
  text_content: string;
  media_base64: string | null;
  media_url: string | null;
};

type Schedule = {
  id: number;
  name: string;
  platform: string;
  owner_name: string;
  target_group: string;
  hour_utc: number;
  minute: number;
  frequency: string;
  content_mode: string;
  specific_content_id: number | null;
  last_run_at: string | null;
};

type TwitterConn = {
  id: number;
  owner_name: string;
  twitter_username: string;
};

type TelegramConn = {
  id: number;
  owner_name: string;
  chat_id: string;
  chat_title: string;
};

const GROUP_SIZES: Record<string, [number, number]> = {
  // [start_offset, count]
  "Post 1": [0, 45],
  "Post 2": [45, 45],
  "Post 3": [90, 45],
  "Post Short": [135, 15],
};

async function pickContent(
  pool: ReturnType<typeof getPool>,
  schedule: Schedule
): Promise<ContentItem | null> {
  if (schedule.content_mode === "specific" && schedule.specific_content_id) {
    const r = await pool.query(
      `SELECT id, name, text_content, media_base64, media_url FROM ${SCHEMA}.content_library WHERE id = $1 AND active = true`,
      [schedule.specific_content_id]
    );
    return r.rows[0] || null;
  }
  const r = await pool.query(
    `SELECT id, name, text_content, media_base64, media_url FROM ${SCHEMA}.content_library
     WHERE active = true
     ORDER BY used_count ASC, RANDOM()
     LIMIT 1`
  );
  return r.rows[0] || null;
}

async function getTargetAccounts(
  pool: ReturnType<typeof getPool>,
  schedule: Schedule
): Promise<{ twitter: TwitterConn[]; telegram: TelegramConn[] }> {
  const [twR, tgR] = await Promise.all([
    pool.query<TwitterConn>(
      `SELECT id, owner_name, twitter_username FROM ${SCHEMA}.twitter_connections WHERE owner_name = $1 ORDER BY id`,
      [schedule.owner_name]
    ),
    pool.query<TelegramConn>(
      `SELECT id, owner_name, chat_id, chat_title FROM ${SCHEMA}.telegram_connections WHERE owner_name = $1 ORDER BY id`,
      [schedule.owner_name]
    ),
  ]);
  // "All" = semua akun owner (untuk member yang punya 1-2 akun saja)
  if (schedule.target_group === "All") {
    return { twitter: twR.rows, telegram: tgR.rows };
  }
  // Slice by group (admin: Post 1/2/3/Short → 45/45/45/15)
  const [start, count] = GROUP_SIZES[schedule.target_group] || [0, 45];
  return {
    twitter: twR.rows.slice(start, start + count),
    telegram: tgR.rows.slice(start, start + count),
  };
}

// Convert sharing URL ke direct download URL untuk service yang umum
function normalizeMediaUrl(url: string): string {
  // Google Drive: /file/d/{ID} → uc?export=download&id={ID}
  const driveMatch = url.match(/drive\.google\.com\/file\/d\/([\w-]+)/);
  if (driveMatch) {
    return `https://drive.google.com/uc?export=download&id=${driveMatch[1]}`;
  }
  // Google Drive open?id= → uc?id=
  const driveOpen = url.match(/drive\.google\.com\/open\?id=([\w-]+)/);
  if (driveOpen) {
    return `https://drive.google.com/uc?export=download&id=${driveOpen[1]}`;
  }
  // Dropbox: ?dl=0 → ?dl=1
  if (url.includes("dropbox.com") && url.includes("dl=0")) {
    return url.replace("dl=0", "dl=1");
  }
  return url;
}

// Fetch external URL → convert ke base64 data URI
// Return null kalau fetch fail atau content bukan image/video
async function fetchUrlAsBase64(
  rawUrl: string
): Promise<{ base64: string | null; error: string | null }> {
  const url = normalizeMediaUrl(rawUrl);
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(30000),
      redirect: "follow",
    });
    if (!res.ok) {
      return { base64: null, error: `Fetch URL gagal: HTTP ${res.status}` };
    }
    let ct = res.headers.get("content-type") || "";
    // Telegram & some CDNs serve generic content-type. Infer dari ekstensi URL.
    if (!ct.startsWith("image/") && !ct.startsWith("video/")) {
      const lower = url.toLowerCase().split("?")[0];
      if (/\.(jpe?g)$/i.test(lower)) ct = "image/jpeg";
      else if (/\.png$/i.test(lower)) ct = "image/png";
      else if (/\.gif$/i.test(lower)) ct = "image/gif";
      else if (/\.webp$/i.test(lower)) ct = "image/webp";
      else if (/\.mp4$/i.test(lower)) ct = "video/mp4";
      else if (/\.mov$/i.test(lower)) ct = "video/quicktime";
      else if (/\.webm$/i.test(lower)) ct = "video/webm";
      else {
        return {
          base64: null,
          error: `URL bukan file media (content-type: ${ct.slice(0, 50)}, tidak ada ekstensi). Pastikan URL adalah direct download link.`,
        };
      }
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0) {
      return { base64: null, error: "File kosong dari URL" };
    }
    return {
      base64: `data:${ct};base64,${buf.toString("base64")}`,
      error: null,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "fetch error";
    return { base64: null, error: `Fetch error: ${msg.slice(0, 100)}` };
  }
}

async function postToTwitter(
  conn: TwitterConn,
  content: ContentItem,
  postGroup: string,
  postedBy: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    // PASS media_url ke endpoint — endpoint fetch sendiri internal
    // (bypass Vercel body limit dari cron→endpoint HTTP)
    const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://socmedanalytics.com";
    const payload: Record<string, unknown> = {
      text: content.text_content,
      owner: conn.owner_name,
      posted_by: postedBy,
      connection_id: conn.id,
      post_group: postGroup,
    };
    // Prefer URL kalau ada (no body inflation), fallback base64 (kalau kecil)
    if (content.media_url) {
      payload.media_url = content.media_url;
    } else if (content.media_base64) {
      payload.media_base64 = content.media_base64;
    }
    const res = await fetch(`${baseUrl}/api/twitter/tweet`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const txt = await res.text();
    let j: { error?: string } = {};
    try {
      j = JSON.parse(txt);
    } catch {
      j = { error: txt.slice(0, 100) };
    }
    return res.ok ? { ok: true } : { ok: false, error: j.error || `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "exception" };
  }
}

async function postToTelegram(
  conn: TelegramConn,
  content: ContentItem,
  postGroup: string,
  postedBy: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://socmedanalytics.com";
    const body: Record<string, unknown> = {
      connection_id: conn.id,
      text: content.text_content,
      posted_by: postedBy,
      post_group: postGroup,
    };
    // Prefer URL (no body inflation)
    if (content.media_url) {
      body.media_url = content.media_url;
    } else if (content.media_base64) {
      const isVideo = content.media_base64.startsWith("data:video");
      body.media_base64 = content.media_base64;
      body.media_type = isVideo ? "video" : "photo";
    }
    const res = await fetch(`${baseUrl}/api/telegram/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await res.json().catch(() => ({}));
    return res.ok
      ? { ok: true }
      : { ok: false, error: j.error || `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "exception" };
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
  const now = new Date();
  const currentHourUtc = now.getUTCHours();
  const todayDateStr = now.toISOString().slice(0, 10);

  // Cari schedule yang:
  // 1. active = true
  // 2. hour_utc <= current hour (sudah saatnya)
  // 3. last_run_at IS NULL OR last_run_at < today (belum jalan hari ini)
  const sched = await pool.query<Schedule>(
    `SELECT * FROM ${SCHEMA}.post_schedules
     WHERE active = true
       AND hour_utc <= $1
       AND (last_run_at IS NULL OR DATE(last_run_at AT TIME ZONE 'UTC') < $2::date)
     ORDER BY hour_utc ASC, id ASC`,
    [currentHourUtc, todayDateStr]
  );

  // Note: jangan return early kalau recurring kosong — masih ada scheduled_posts
  // (one-time) yang harus di-check di section bawah.

  const results: Array<{
    schedule_id: number;
    schedule_name: string;
    posted: number;
    failed: number;
    content_used?: string;
  }> = [];

  for (const s of sched.rows) {
    // Pick content
    const content = await pickContent(pool, s);
    if (!content) {
      await pool.query(
        `INSERT INTO ${SCHEMA}.scheduled_runs (schedule_id, status, errors)
         VALUES ($1, 'no_content', $2::jsonb)`,
        [s.id, JSON.stringify([{ error: "No active content in library" }])]
      );
      results.push({
        schedule_id: s.id,
        schedule_name: s.name,
        posted: 0,
        failed: 0,
      });
      continue;
    }

    // Get target accounts
    const accounts = await getTargetAccounts(pool, s);
    const targets = s.platform === "twitter" ? accounts.twitter : accounts.telegram;

    if (targets.length === 0) {
      await pool.query(
        `INSERT INTO ${SCHEMA}.scheduled_runs (schedule_id, content_id, status, errors)
         VALUES ($1, $2, 'no_targets', $3::jsonb)`,
        [
          s.id,
          content.id,
          JSON.stringify([
            { error: `No ${s.platform} accounts in group ${s.target_group}` },
          ]),
        ]
      );
      // Mark as run anyway to avoid re-trigger
      await pool.query(
        `UPDATE ${SCHEMA}.post_schedules SET last_run_at = now() WHERE id = $1`,
        [s.id]
      );
      results.push({
        schedule_id: s.id,
        schedule_name: s.name,
        posted: 0,
        failed: 0,
      });
      continue;
    }

    // Fire to all targets sequential
    let posted = 0;
    let failed = 0;
    const errors: Array<{ account: string; error: string }> = [];

    // Recurring schedule: posted_by = owner_name dari schedule (siapa yang setup recurring)
    const recurringPostedBy = s.owner_name || "auto-cron";
    for (const target of targets) {
      const result =
        s.platform === "twitter"
          ? await postToTwitter(target as TwitterConn, content, s.target_group, recurringPostedBy)
          : await postToTelegram(target as TelegramConn, content, s.target_group, recurringPostedBy);
      if (result.ok) {
        posted++;
      } else {
        failed++;
        errors.push({
          account:
            s.platform === "twitter"
              ? `@${(target as TwitterConn).twitter_username}`
              : (target as TelegramConn).chat_title,
          error: result.error || "unknown",
        });
      }
      // Small delay between posts (rate limit) — reduced biar respons < 30s
      // untuk cron-job.org free tier timeout
      await new Promise((r) => setTimeout(r, s.platform === "twitter" ? 250 : 100));
    }

    // Log run
    await pool.query(
      `INSERT INTO ${SCHEMA}.scheduled_runs (schedule_id, content_id, status, posted_count, failed_count, errors)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [
        s.id,
        content.id,
        failed === 0 ? "success" : posted > 0 ? "partial" : "failed",
        posted,
        failed,
        JSON.stringify(errors),
      ]
    );

    // Update schedule last_run + content used
    await pool.query(
      `UPDATE ${SCHEMA}.post_schedules SET last_run_at = now() WHERE id = $1`,
      [s.id]
    );
    await pool.query(
      `UPDATE ${SCHEMA}.content_library SET used_count = used_count + 1, last_used_at = now() WHERE id = $1`,
      [content.id]
    );

    // Log to activity_log
    await pool.query(
      `INSERT INTO ${SCHEMA}.activity_log (who, role, action, source, detail)
       VALUES ('auto-cron', 'System', 'Auto Post (Cron)', 'Auto Post', $1)`,
      [
        `${s.name}: ${posted}/${targets.length} sukses · ${s.target_group} · "${content.name}"`,
      ]
    );

    results.push({
      schedule_id: s.id,
      schedule_name: s.name,
      posted,
      failed,
      content_used: content.name,
    });
  }

  // ============ Process scheduled_posts (one-time bulk) ============
  type ScheduledPost = {
    id: number;
    platform: string;
    owner_name: string;
    target_group: string;
    text_content: string;
    media_base64: string | null;
    media_url: string | null;
    scheduled_at: string;
    created_by: string | null;
  };

  const dueSched = await pool.query<ScheduledPost>(
    `SELECT id, platform, owner_name, target_group, text_content,
            media_base64, media_url, scheduled_at, created_by
     FROM ${SCHEMA}.scheduled_posts
     WHERE status = 'pending' AND scheduled_at <= now()
     ORDER BY scheduled_at ASC
     LIMIT 5`
  );

  const scheduledResults: Array<{
    scheduled_post_id: number;
    posted: number;
    failed: number;
  }> = [];

  for (const sp of dueSched.rows) {
    // Build pseudo-content + pseudo-schedule untuk reuse helper
    const pseudoContent: ContentItem = {
      id: 0,
      name: `(scheduled #${sp.id})`,
      text_content: sp.text_content,
      media_base64: sp.media_base64,
      media_url: sp.media_url,
    };
    const pseudoSchedule: Schedule = {
      id: 0,
      name: `Scheduled #${sp.id}`,
      platform: sp.platform,
      owner_name: sp.owner_name,
      target_group: sp.target_group,
      hour_utc: 0,
      minute: 0,
      frequency: "once",
      content_mode: "specific",
      specific_content_id: null,
      last_run_at: null,
    };

    const accounts = await getTargetAccounts(pool, pseudoSchedule);
    const targets = sp.platform === "twitter" ? accounts.twitter : accounts.telegram;

    let posted = 0;
    let failed = 0;
    const errors: Array<{ account: string; error: string }> = [];

    // One-time scheduled: posted_by = created_by (siapa yang bikin schedule),
    // fallback ke owner_name kalau created_by null
    const onceTimePostedBy = sp.created_by || sp.owner_name || "auto-cron";
    for (const target of targets) {
      const result =
        sp.platform === "twitter"
          ? await postToTwitter(target as TwitterConn, pseudoContent, sp.target_group, onceTimePostedBy)
          : await postToTelegram(target as TelegramConn, pseudoContent, sp.target_group, onceTimePostedBy);
      if (result.ok) posted++;
      else {
        failed++;
        errors.push({
          account:
            sp.platform === "twitter"
              ? `@${(target as TwitterConn).twitter_username}`
              : (target as TelegramConn).chat_title,
          error: result.error || "unknown",
        });
      }
      await new Promise((r) => setTimeout(r, sp.platform === "twitter" ? 250 : 100));
    }

    // Mark as fired (success / partial / failed)
    const newStatus =
      targets.length === 0
        ? "no_targets"
        : failed === 0
        ? "fired"
        : posted > 0
        ? "partial"
        : "failed";
    await pool.query(
      `UPDATE ${SCHEMA}.scheduled_posts
       SET status = $2, fired_at = now(), posted_count = $3, failed_count = $4, errors = $5::jsonb
       WHERE id = $1`,
      [sp.id, newStatus, posted, failed, JSON.stringify(errors)]
    );

    await pool.query(
      `INSERT INTO ${SCHEMA}.activity_log (who, role, action, source, detail)
       VALUES ('auto-cron', 'System', 'Fire Scheduled Post', 'Auto Post', $1)`,
      [`#${sp.id} ${sp.target_group} (${sp.owner_name}): ${posted}/${targets.length} sukses`]
    );

    scheduledResults.push({
      scheduled_post_id: sp.id,
      posted,
      failed,
    });
  }

  return NextResponse.json({
    ok: true,
    processed: results.length,
    scheduled_processed: scheduledResults.length,
    results,
    scheduled_results: scheduledResults,
    timestamp: now.toISOString(),
  });
}
