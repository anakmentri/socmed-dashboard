// Vercel Cron Job: cek apakah project lama (fireqxxqxxkxbcemcpmj) sudah
// accessible (egress quota reset). Kalau ya, fetch semua data sejak 24 April
// dan import ke twitterdood.
//
// Schedule: setiap hari jam 02:00 UTC (09:00 WIB)
// Configured di vercel.json
//
// Manual trigger:
// curl -X GET "https://socmedanalytics.com/api/cron/recover-old-data?key=<CRON_SECRET>"

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getPool, SCHEMA } from "@/lib/pg";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300; // 5 menit max (Vercel Pro default)

const OLD_URL = "https://fireqxxqxxkxbcemcpmj.supabase.co";
const OLD_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZpcmVxeHhxeHhreGJjZW1jcG1qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MDAyMjUsImV4cCI6MjA5MTM3NjIyNX0.NNTcqbgbDRy6m95hu1K7pQi10jH52n3HUkSubUlK7sM";

const SINCE = "2026-04-24"; // cutoff: data sejak migrasi pertama

type TableConfig = {
  name: string;
  dateCol: string;
  pk: string;
  pageSize: number;
};

const TABLES: TableConfig[] = [
  { name: "activity_log", dateCol: "created_at", pk: "id", pageSize: 200 },
  { name: "report_items", dateCol: "created_at", pk: "id", pageSize: 30 },
  { name: "attendance", dateCol: "date", pk: "id", pageSize: 500 },
  { name: "daily_work", dateCol: "date", pk: "id", pageSize: 500 },
  { name: "ir_data", dateCol: "date", pk: "id", pageSize: 500 },
  { name: "banned_accounts", dateCol: "banned_at", pk: "account_id", pageSize: 500 },
  { name: "twitter_connections", dateCol: "created_at", pk: "id", pageSize: 500 },
  { name: "twitter_posts", dateCol: "created_at", pk: "id", pageSize: 500 },
  { name: "social_posts", dateCol: "created_at", pk: "id", pageSize: 500 },
  { name: "telegram_connections", dateCol: "created_at", pk: "id", pageSize: 500 },
  { name: "assets", dateCol: "created_at", pk: "id", pageSize: 5 },
];

const SERIAL_TABLES = [
  "team_members", "attendance", "daily_work", "ir_data", "report_items",
  "soc_accounts", "platforms", "assets", "twitter_connections", "twitter_posts",
  "telegram_connections", "social_posts", "activity_log",
];

export async function GET(req: NextRequest) {
  // Auth: Vercel Cron sends specific header. Manual trigger needs query secret.
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  const queryKey = req.nextUrl.searchParams.get("key");
  const isVercelCron = authHeader === `Bearer ${cronSecret}`;
  const isManualWithSecret = cronSecret && queryKey === cronSecret;

  if (cronSecret && !isVercelCron && !isManualWithSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const oldSb = createClient(OLD_URL, OLD_KEY);

  // Step 1: Cek apakah old project accessible
  const { error: checkErr } = await oldSb
    .from("team_members")
    .select("id")
    .limit(1);

  if (checkErr) {
    return NextResponse.json({
      ok: false,
      status: "old_project_blocked",
      reason: checkErr.message,
      message: "Old project masih restricted. Akan retry di run berikutnya.",
      next_run: "tomorrow",
    });
  }

  // Step 2: Quota reset! Fetch + import semua tabel
  const pool = getPool();
  const summary: Record<string, { fetched: number; inserted: number; error?: string }> = {};

  for (const t of TABLES) {
    try {
      // Fetch dengan pagination
      let allRows: Record<string, unknown>[] = [];
      let from = 0;
      while (true) {
        const { data, error } = await oldSb
          .from(t.name)
          .select("*")
          .gte(t.dateCol, SINCE)
          .order(t.dateCol, { ascending: true })
          .range(from, from + t.pageSize - 1);
        if (error) throw new Error(error.message);
        if (!data || data.length === 0) break;
        allRows = allRows.concat(data as Record<string, unknown>[]);
        if (data.length < t.pageSize) break;
        from += t.pageSize;
      }

      if (allRows.length === 0) {
        summary[t.name] = { fetched: 0, inserted: 0 };
        continue;
      }

      // Import dengan ON CONFLICT DO NOTHING
      let inserted = 0;
      const BATCH = ["assets", "report_items"].includes(t.name) ? 5 : 50;
      for (let i = 0; i < allRows.length; i += BATCH) {
        const slice = allRows.slice(i, i + BATCH);
        const cols = Object.keys(slice[0]);
        const placeholders = slice
          .map(
            (_, ri) =>
              "(" +
              cols.map((__, ci) => `$${ri * cols.length + ci + 1}`).join(",") +
              ")"
          )
          .join(",");
        const values: unknown[] = [];
        for (const row of slice) {
          for (const c of cols) {
            let v = row[c];
            if (v !== null && typeof v === "object" && !(v instanceof Date)) {
              v = JSON.stringify(v);
            }
            values.push(v);
          }
        }
        const colList = cols.map((c) => `"${c}"`).join(",");
        const sql = `INSERT INTO ${SCHEMA}."${t.name}" (${colList}) VALUES ${placeholders} ON CONFLICT ("${t.pk}") DO NOTHING`;
        try {
          const r = await pool.query(sql, values);
          inserted += r.rowCount || 0;
        } catch (e) {
          // Per-row fallback
          for (const row of slice) {
            try {
              const cols = Object.keys(row);
              const vals = cols.map((c) => {
                const v = row[c];
                return v !== null && typeof v === "object" && !(v instanceof Date)
                  ? JSON.stringify(v)
                  : v;
              });
              const ph = cols.map((_, i) => `$${i + 1}`).join(",");
              const colList = cols.map((c) => `"${c}"`).join(",");
              const sql = `INSERT INTO ${SCHEMA}."${t.name}" (${colList}) VALUES (${ph}) ON CONFLICT ("${t.pk}") DO NOTHING`;
              const r = await pool.query(sql, vals);
              inserted += r.rowCount || 0;
            } catch {
              // skip individual bad row
              void e;
            }
          }
        }
      }

      summary[t.name] = { fetched: allRows.length, inserted };
    } catch (e) {
      summary[t.name] = {
        fetched: 0,
        inserted: 0,
        error: e instanceof Error ? e.message : "unknown",
      };
    }
  }

  // Reset sequences
  for (const t of SERIAL_TABLES) {
    try {
      await pool.query(
        `SELECT setval(pg_get_serial_sequence('${SCHEMA}.${t}', 'id'), COALESCE((SELECT MAX(id) FROM ${SCHEMA}.${t}), 1), true)`
      );
    } catch {
      // ignore
    }
  }

  const totalInserted = Object.values(summary).reduce((a, s) => a + s.inserted, 0);

  return NextResponse.json({
    ok: true,
    status: "imported",
    message: `Recovery sukses: ${totalInserted} new rows imported`,
    summary,
  });
}
