// Daily snapshot Twitter metrics: followers/following/tweet count + recent post engagement.
// Manual trigger: GET /api/cron/twitter-metrics?key=<CRON_SECRET>
//
// Twitter API budget (Free tier ~1500 reads/month):
// - 1 user lookup per akun per hari = 26 × 30 = 780/bulan ✓
// - 1 recent tweets call per akun per hari (max 5 tweets each) = 26 × 30 = 780/bulan ✗ (kena cap)
// → Untuk safety, recent tweets dibatasi 1× per minggu (26 × 4 = 104/bulan)

import { NextRequest, NextResponse } from "next/server";
import { getPool, SCHEMA } from "@/lib/pg";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

type TwitterConn = {
  id: number;
  owner_name: string;
  twitter_user_id: string | null;
  twitter_username: string | null;
  access_token: string;
  refresh_token: string | null;
  expires_at: string | null;
};

async function refreshTokenIfNeeded(
  pool: ReturnType<typeof getPool>,
  conn: TwitterConn
): Promise<string> {
  if (!conn.expires_at) return conn.access_token;
  const expiresAt = new Date(conn.expires_at).getTime();
  if (expiresAt - Date.now() > 5 * 60 * 1000) return conn.access_token;
  if (!conn.refresh_token) return conn.access_token;

  const clientId = process.env.TWITTER_CLIENT_ID!;
  const clientSecret = process.env.TWITTER_CLIENT_SECRET!;
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const res = await fetch("https://api.twitter.com/2/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: conn.refresh_token,
      client_id: clientId,
    }).toString(),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.access_token) return conn.access_token;

  const newExpires = new Date(Date.now() + (j.expires_in || 7200) * 1000).toISOString();
  await pool.query(
    `UPDATE ${SCHEMA}.twitter_connections
     SET access_token = $1, refresh_token = $2, expires_at = $3, updated_at = now()
     WHERE id = $4`,
    [j.access_token, j.refresh_token || conn.refresh_token, newExpires, conn.id]
  );
  return j.access_token;
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

  // Mode: optional connection_id query param untuk refresh 1 akun saja (manual)
  // Mode: optional include_posts=1 untuk tarik recent post metrics juga
  const onlyConnId = req.nextUrl.searchParams.get("connection_id");
  const includePosts = req.nextUrl.searchParams.get("include_posts") === "1";

  const pool = getPool();
  const today = new Date().toISOString().slice(0, 10);

  // Fetch connections
  let conns: TwitterConn[];
  if (onlyConnId) {
    const r = await pool.query<TwitterConn>(
      `SELECT id, owner_name, twitter_user_id, twitter_username, access_token, refresh_token, expires_at
       FROM ${SCHEMA}.twitter_connections WHERE id = $1`,
      [Number(onlyConnId)]
    );
    conns = r.rows;
  } else {
    const r = await pool.query<TwitterConn>(
      `SELECT id, owner_name, twitter_user_id, twitter_username, access_token, refresh_token, expires_at
       FROM ${SCHEMA}.twitter_connections ORDER BY id`
    );
    conns = r.rows;
  }

  const results: Array<{
    connection_id: number;
    twitter_username: string | null;
    ok: boolean;
    error?: string;
    followers?: number;
    posts_fetched?: number;
  }> = [];

  for (const conn of conns) {
    try {
      const accessToken = await refreshTokenIfNeeded(pool, conn);

      // Fetch user metrics
      const userRes = await fetch(
        `https://api.twitter.com/2/users/me?user.fields=public_metrics`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!userRes.ok) {
        const txt = await userRes.text().catch(() => "");
        results.push({
          connection_id: conn.id,
          twitter_username: conn.twitter_username,
          ok: false,
          error: `users/me HTTP ${userRes.status}: ${txt.slice(0, 100)}`,
        });
        continue;
      }
      const userJson = await userRes.json();
      const m = userJson.data?.public_metrics;
      const userId = userJson.data?.id;
      const username = userJson.data?.username || conn.twitter_username;

      if (!m) {
        results.push({
          connection_id: conn.id,
          twitter_username: conn.twitter_username,
          ok: false,
          error: "no public_metrics in response",
        });
        continue;
      }

      // Upsert snapshot for today
      await pool.query(
        `INSERT INTO ${SCHEMA}.twitter_metrics
           (connection_id, owner_name, twitter_username, snapshot_date,
            followers_count, following_count, tweet_count, listed_count)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (connection_id, snapshot_date)
         DO UPDATE SET followers_count = EXCLUDED.followers_count,
                       following_count = EXCLUDED.following_count,
                       tweet_count = EXCLUDED.tweet_count,
                       listed_count = EXCLUDED.listed_count`,
        [
          conn.id,
          conn.owner_name,
          username,
          today,
          m.followers_count || 0,
          m.following_count || 0,
          m.tweet_count || 0,
          m.listed_count || 0,
        ]
      );

      // Optional: fetch recent post metrics
      let postsCount = 0;
      if (includePosts && userId) {
        try {
          const tweetsRes = await fetch(
            `https://api.twitter.com/2/users/${userId}/tweets?max_results=5&tweet.fields=public_metrics,created_at`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );
          if (tweetsRes.ok) {
            const tweetsJson = await tweetsRes.json();
            const tweets = tweetsJson.data || [];
            for (const tw of tweets) {
              const pm = tw.public_metrics || {};
              await pool.query(
                `INSERT INTO ${SCHEMA}.twitter_post_metrics
                   (connection_id, tweet_id, owner_name, twitter_username,
                    like_count, retweet_count, reply_count, quote_count,
                    impression_count, bookmark_count, tweet_created_at, fetched_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
                 ON CONFLICT (tweet_id)
                 DO UPDATE SET like_count = EXCLUDED.like_count,
                               retweet_count = EXCLUDED.retweet_count,
                               reply_count = EXCLUDED.reply_count,
                               quote_count = EXCLUDED.quote_count,
                               impression_count = EXCLUDED.impression_count,
                               bookmark_count = EXCLUDED.bookmark_count,
                               fetched_at = now()`,
                [
                  conn.id,
                  tw.id,
                  conn.owner_name,
                  username,
                  pm.like_count || 0,
                  pm.retweet_count || 0,
                  pm.reply_count || 0,
                  pm.quote_count || 0,
                  pm.impression_count || 0,
                  pm.bookmark_count || 0,
                  tw.created_at || null,
                ]
              );
              postsCount++;
            }
          }
        } catch {
          // silent fail untuk posts metrics — user metrics sudah tersimpan
        }
      }

      results.push({
        connection_id: conn.id,
        twitter_username: username,
        ok: true,
        followers: m.followers_count,
        posts_fetched: postsCount,
      });

      // Rate limit safety: 1s delay antar akun
      await new Promise((r) => setTimeout(r, 1000));
    } catch (e) {
      results.push({
        connection_id: conn.id,
        twitter_username: conn.twitter_username,
        ok: false,
        error: e instanceof Error ? e.message : "exception",
      });
    }
  }

  return NextResponse.json({
    ok: true,
    snapshot_date: today,
    total: conns.length,
    success: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  });
}
