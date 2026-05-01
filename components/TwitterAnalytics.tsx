"use client";
import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";

type Metric = {
  id: number;
  connection_id: number;
  owner_name: string;
  twitter_username: string;
  snapshot_date: string;
  followers_count: number;
  following_count: number;
  tweet_count: number;
};

type PostMetric = {
  id: number;
  connection_id: number;
  owner_name: string;
  twitter_username: string;
  tweet_id: string;
  like_count: number;
  retweet_count: number;
  reply_count: number;
  impression_count: number;
  fetched_at: string;
};

const fmt = (n: number) => {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString("id-ID");
};

// Simple SVG line chart untuk followers growth
function MiniChart({ data, color = "#1DA1F2" }: { data: number[]; color?: string }) {
  if (data.length < 2) {
    return <div className="text-[10px] text-fg-500">Butuh ≥ 2 data point</div>;
  }
  const w = 200;
  const h = 50;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((v - min) / range) * (h - 4) - 2;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg width={w} height={h} className="w-full">
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={points}
      />
      <polyline
        fill={color}
        fillOpacity="0.1"
        stroke="none"
        points={`0,${h} ${points} ${w},${h}`}
      />
    </svg>
  );
}

export function TwitterAnalytics({ ownerFilter }: { ownerFilter?: string | null }) {
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [postMetrics, setPostMetrics] = useState<PostMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState("");

  const load = async () => {
    setLoading(true);
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    let mq = supabase
      .from("twitter_metrics")
      .select("*")
      .gte("snapshot_date", since)
      .order("snapshot_date", { ascending: true });
    if (ownerFilter) mq = mq.eq("owner_name", ownerFilter);
    const { data: mData } = await mq;

    let pq = supabase
      .from("twitter_post_metrics")
      .select("*")
      .order("fetched_at", { ascending: false })
      .limit(200);
    if (ownerFilter) pq = pq.eq("owner_name", ownerFilter);
    const { data: pData } = await pq;

    setMetrics((mData as Metric[]) || []);
    setPostMetrics((pData as PostMetric[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerFilter]);

  // Group metrics per akun, ambil snapshot terakhir
  const perAccount = useMemo(() => {
    const byConn: Record<number, Metric[]> = {};
    metrics.forEach((m) => {
      byConn[m.connection_id] = byConn[m.connection_id] || [];
      byConn[m.connection_id].push(m);
    });
    const arr = Object.values(byConn).map((rows) => {
      rows.sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date));
      const latest = rows[rows.length - 1];
      const yday = rows[rows.length - 2];
      const weekAgo = rows.find((r) => {
        const d = new Date(r.snapshot_date).getTime();
        const target = Date.now() - 7 * 24 * 60 * 60 * 1000;
        return d >= target - 24 * 60 * 60 * 1000 && d <= target + 24 * 60 * 60 * 1000;
      });
      return {
        connection_id: latest.connection_id,
        owner_name: latest.owner_name,
        username: latest.twitter_username,
        followers: latest.followers_count,
        following: latest.following_count,
        tweets: latest.tweet_count,
        deltaDay: yday ? latest.followers_count - yday.followers_count : 0,
        deltaWeek: weekAgo ? latest.followers_count - weekAgo.followers_count : 0,
        history: rows.map((r) => r.followers_count),
      };
    });
    arr.sort((a, b) => b.followers - a.followers);
    return arr;
  }, [metrics]);

  // Engagement stats per akun (avg dari recent posts)
  const engagementByAccount = useMemo(() => {
    const byConn: Record<number, PostMetric[]> = {};
    postMetrics.forEach((p) => {
      byConn[p.connection_id] = byConn[p.connection_id] || [];
      byConn[p.connection_id].push(p);
    });
    const out: Record<
      number,
      { avgLikes: number; avgRT: number; avgReply: number; engagementRate: number; sampleCount: number }
    > = {};
    for (const [connId, posts] of Object.entries(byConn)) {
      const cid = Number(connId);
      const acc = perAccount.find((a) => a.connection_id === cid);
      const followers = acc?.followers || 1;
      const sample = posts.slice(0, 10);
      const sumL = sample.reduce((s, p) => s + p.like_count, 0);
      const sumR = sample.reduce((s, p) => s + p.retweet_count, 0);
      const sumRp = sample.reduce((s, p) => s + p.reply_count, 0);
      const avgEng = (sumL + sumR + sumRp) / sample.length;
      out[cid] = {
        avgLikes: Math.round(sumL / sample.length),
        avgRT: Math.round(sumR / sample.length),
        avgReply: Math.round(sumRp / sample.length),
        engagementRate: followers > 0 ? (avgEng / followers) * 100 : 0,
        sampleCount: sample.length,
      };
    }
    return out;
  }, [postMetrics, perAccount]);

  // Aggregate totals
  const totals = useMemo(() => {
    const totalFollowers = perAccount.reduce((s, a) => s + a.followers, 0);
    const totalTweets = perAccount.reduce((s, a) => s + a.tweets, 0);
    const dayGrowth = perAccount.reduce((s, a) => s + a.deltaDay, 0);
    const weekGrowth = perAccount.reduce((s, a) => s + a.deltaWeek, 0);
    return { totalFollowers, totalTweets, dayGrowth, weekGrowth };
  }, [perAccount]);

  const refresh = async () => {
    setRefreshing(true);
    setRefreshMsg("");
    try {
      const secret = process.env.NEXT_PUBLIC_CRON_SECRET;
      if (!secret) {
        setRefreshMsg("⚠ NEXT_PUBLIC_CRON_SECRET tidak terset");
        setRefreshing(false);
        return;
      }
      const url = `/api/cron/twitter-metrics?key=${encodeURIComponent(secret)}&include_posts=1`;
      const res = await fetch(url);
      const j = await res.json();
      if (res.ok) {
        setRefreshMsg(`✅ ${j.success}/${j.total} akun ter-update`);
        await load();
      } else {
        setRefreshMsg(`❌ Error: ${j.error || res.status}`);
      }
    } catch (e) {
      setRefreshMsg(`❌ ${e instanceof Error ? e.message : "exception"}`);
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) {
    return (
      <div className="mb-6 rounded-xl border border-bg-700 bg-bg-800 p-5">
        <div className="text-sm text-fg-500">Loading Twitter analytics...</div>
      </div>
    );
  }

  if (perAccount.length === 0) {
    return (
      <div className="mb-6 rounded-xl border border-bg-700 bg-bg-800 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h4 className="text-sm font-bold text-brand-sky">📊 Twitter Analytics</h4>
          <button
            onClick={refresh}
            disabled={refreshing}
            className="rounded-lg border border-bg-700 bg-bg-900 px-3 py-1.5 text-xs text-fg-300 hover:border-brand-sky disabled:opacity-50"
          >
            {refreshing ? "⏳ Mengambil..." : "🔄 Tarik Metrics Sekarang"}
          </button>
        </div>
        <div className="text-sm text-fg-500">
          Belum ada data metrics. Klik &quot;Tarik Metrics Sekarang&quot; untuk pertama kali.
        </div>
        {refreshMsg && (
          <div className="mt-2 text-xs text-fg-400">{refreshMsg}</div>
        )}
      </div>
    );
  }

  const top10 = perAccount.slice(0, 10);

  return (
    <div className="mb-6 space-y-4">
      {/* Header + refresh */}
      <div className="flex items-center justify-between">
        <h4 className="text-base font-bold text-brand-sky">📊 Twitter Analytics</h4>
        <div className="flex items-center gap-2">
          {refreshMsg && (
            <span className="text-[11px] text-fg-400">{refreshMsg}</span>
          )}
          <button
            onClick={refresh}
            disabled={refreshing}
            className="rounded-lg border border-bg-700 bg-bg-800 px-3 py-1.5 text-xs text-fg-300 hover:border-brand-sky disabled:opacity-50"
          >
            {refreshing ? "⏳ Refresh..." : "🔄 Refresh"}
          </button>
        </div>
      </div>

      {/* Aggregate stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Total Followers"
          value={fmt(totals.totalFollowers)}
          accent="text-brand-sky"
        />
        <StatCard
          label="Followers +24h"
          value={(totals.dayGrowth >= 0 ? "+" : "") + fmt(totals.dayGrowth)}
          accent={totals.dayGrowth >= 0 ? "text-brand-emerald" : "text-brand-rose"}
        />
        <StatCard
          label="Followers +7d"
          value={(totals.weekGrowth >= 0 ? "+" : "") + fmt(totals.weekGrowth)}
          accent={totals.weekGrowth >= 0 ? "text-brand-emerald" : "text-brand-rose"}
        />
        <StatCard
          label="Total Tweets"
          value={fmt(totals.totalTweets)}
          accent="text-brand-amber"
        />
      </div>

      {/* Per-account leaderboard */}
      <div className="rounded-xl border border-bg-700 bg-bg-800">
        <div className="flex items-center justify-between border-b border-bg-700 px-5 py-3">
          <h4 className="text-sm font-bold text-fg-100">
            🏆 Top {top10.length} Akun by Followers
          </h4>
          <span className="text-[10px] text-fg-500">{perAccount.length} akun total</span>
        </div>
        <div className="divide-y divide-bg-700">
          {top10.map((a, i) => {
            const eng = engagementByAccount[a.connection_id];
            return (
              <div key={a.connection_id} className="flex items-center gap-3 px-5 py-3">
                <span className="w-6 text-right text-xs font-bold text-fg-500">
                  #{i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <a
                      href={`https://x.com/${a.username}`}
                      target="_blank"
                      rel="noreferrer"
                      className="truncate text-sm font-bold text-brand-sky hover:underline"
                    >
                      @{a.username}
                    </a>
                    <span className="shrink-0 text-[10px] text-fg-500">
                      {a.owner_name}
                    </span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-fg-400">
                    <span>👥 {fmt(a.followers)}</span>
                    <span
                      className={
                        a.deltaDay > 0
                          ? "text-brand-emerald"
                          : a.deltaDay < 0
                          ? "text-brand-rose"
                          : ""
                      }
                    >
                      {a.deltaDay > 0 ? "+" : ""}
                      {fmt(a.deltaDay)} (24h)
                    </span>
                    <span>📝 {fmt(a.tweets)} tweets</span>
                    {eng && (
                      <span className="text-brand-amber">
                        ❤ {fmt(eng.avgLikes)} avg · 🔥 {eng.engagementRate.toFixed(2)}% ER
                      </span>
                    )}
                  </div>
                </div>
                <div className="hidden w-32 shrink-0 sm:block">
                  <MiniChart data={a.history} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent top posts (engagement) */}
      {postMetrics.length > 0 && (
        <div className="rounded-xl border border-bg-700 bg-bg-800">
          <div className="flex items-center justify-between border-b border-bg-700 px-5 py-3">
            <h4 className="text-sm font-bold text-fg-100">🔥 Top 5 Tweet by Engagement</h4>
            <span className="text-[10px] text-fg-500">{postMetrics.length} tweets tracked</span>
          </div>
          <div className="divide-y divide-bg-700">
            {postMetrics
              .slice()
              .sort(
                (a, b) =>
                  b.like_count + b.retweet_count + b.reply_count -
                  (a.like_count + a.retweet_count + a.reply_count)
              )
              .slice(0, 5)
              .map((p) => {
                const totalEng = p.like_count + p.retweet_count + p.reply_count;
                return (
                  <div key={p.id} className="flex items-center gap-3 px-5 py-2 text-xs">
                    <a
                      href={`https://x.com/${p.twitter_username}/status/${p.tweet_id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-bold text-brand-sky hover:underline"
                    >
                      @{p.twitter_username}
                    </a>
                    <div className="flex flex-1 flex-wrap gap-2 text-fg-400">
                      <span>❤ {fmt(p.like_count)}</span>
                      <span>🔁 {fmt(p.retweet_count)}</span>
                      <span>💬 {fmt(p.reply_count)}</span>
                      {p.impression_count > 0 && <span>👁 {fmt(p.impression_count)}</span>}
                    </div>
                    <span className="font-bold text-brand-amber">{fmt(totalEng)} eng</span>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-xl border border-bg-700 bg-bg-800 p-3">
      <div className="text-[10px] font-bold uppercase tracking-wider text-fg-500">
        {label}
      </div>
      <div className={`mt-1 text-xl font-extrabold ${accent}`}>{value}</div>
    </div>
  );
}
