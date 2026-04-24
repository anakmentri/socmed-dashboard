import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type CheckResult = {
  active: boolean | null; // null = unknown
  reason: string;
  status: number;
};

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/**
 * Cek X (Twitter) — pakai 2 layer untuk akurasi maksimal:
 *
 * Layer 1: publish.twitter.com/oembed
 *   - HTTP 404 = pasti tidak ada (suspended/deleted/wrong username)
 *   - HTTP 200 = NAMA URL valid, TAPI bukan jaminan akun aktif
 *     (suspended account tetap return 200 di sini — kelemahan oembed)
 *
 * Layer 2: syndication.twitter.com/srv/timeline-profile/screen-name/USERNAME
 *   - Body kecil (~2KB) + "hasResults":false → suspended/empty
 *   - Body besar (>10KB) + ada screen_name → active dengan tweets
 *   - Edge case: account active tanpa tweet → bisa kelihatan "kosong"
 *     → fallback ke unknown
 */
async function checkTwitter(username: string): Promise<CheckResult> {
  const u = username.replace(/^@/, "").trim();
  if (!u) return { active: null, reason: "Username kosong", status: 0 };

  // Layer 1: oembed cepat untuk catch yang clearly missing (404)
  try {
    const oembedRes = await fetch(
      `https://publish.twitter.com/oembed?url=https%3A%2F%2Ftwitter.com%2F${encodeURIComponent(u)}`,
      { method: "GET", headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8000) }
    );
    if (oembedRes.status === 404) {
      return { active: false, reason: "Akun tidak ada (404)", status: 404 };
    }
    if (oembedRes.status !== 200) {
      // 403/5xx → fallback ke layer 2
    }
  } catch {
    // continue to layer 2
  }

  // Layer 2: syndication timeline — signal kuat: user_id_str hanya muncul kalau akun aktif
  try {
    const synUrl = `https://syndication.twitter.com/srv/timeline-profile/screen-name/${encodeURIComponent(u)}`;
    const res = await fetch(synUrl, {
      method: "GET",
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        Referer: "https://platform.twitter.com/",
      },
      signal: AbortSignal.timeout(12000),
    });
    if (res.status === 429) {
      // Rate limited — caller harus retry dengan delay
      return { active: null, reason: "Rate limited (retry nanti)", status: 429 };
    }
    if (res.status !== 200) {
      return { active: null, reason: `Syndication HTTP ${res.status}`, status: res.status };
    }
    const body = await res.text();

    // Signal paling kuat untuk ACTIVE: profile_image_url_https (real user profile data)
    // Active body always punya followers_count, profile_image, screen_name + verified, dll
    // Suspended body cuma punya hasResults & entries (no user data sama sekali)
    const hasProfileImage = body.includes('profile_image_url_https');
    const hasFollowers = body.includes('"followers_count"');
    const hasResultsFalse = body.includes('"hasResults":false');
    const hasEntriesEmpty = body.includes('"entries":[]');

    if (hasProfileImage || hasFollowers) {
      return { active: true, reason: "Akun aktif (profile data ada)", status: 200 };
    }

    if (hasResultsFalse && hasEntriesEmpty && body.length < 5000) {
      return { active: false, reason: "Akun suspended/dihapus", status: 200 };
    }
    if (body.length < 3000) {
      return { active: false, reason: "Akun suspended (no profile data)", status: 200 };
    }

    return { active: null, reason: "Tidak pasti (cek manual)", status: 200 };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("timeout") || msg.includes("abort"))
      return { active: null, reason: "Timeout", status: 0 };
    return { active: null, reason: "Error koneksi", status: 0 };
  }
}

/**
 * Cek YouTube channel — HTTP 200 vs 404 untuk @handle.
 */
async function checkYoutube(username: string): Promise<CheckResult> {
  const u = username.replace(/^@/, "").trim();
  if (!u) return { active: null, reason: "Username kosong", status: 0 };
  try {
    const res = await fetch(`https://www.youtube.com/@${encodeURIComponent(u)}`, {
      method: "GET",
      headers: { "User-Agent": UA },
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
    });
    if (res.status === 404) return { active: false, reason: "Channel tidak ada", status: 404 };
    if (res.status === 200) {
      const body = await res.text();
      const lower = body.toLowerCase();
      if (lower.includes("this account has been terminated"))
        return { active: false, reason: "Channel terminated", status: 200 };
      if (lower.includes("this channel does not exist"))
        return { active: false, reason: "Channel does not exist", status: 200 };
      return { active: true, reason: "Channel aktif", status: 200 };
    }
    return { active: null, reason: `HTTP ${res.status}`, status: res.status };
  } catch {
    return { active: null, reason: "Error koneksi", status: 0 };
  }
}

/**
 * Cek TikTok — body inspection.
 */
async function checkTikTok(username: string): Promise<CheckResult> {
  const u = username.replace(/^@/, "").trim();
  if (!u) return { active: null, reason: "Username kosong", status: 0 };
  try {
    const res = await fetch(`https://www.tiktok.com/@${encodeURIComponent(u)}`, {
      method: "GET",
      headers: { "User-Agent": UA },
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
    });
    if (res.status === 404) return { active: false, reason: "Akun tidak ada", status: 404 };
    if (res.status !== 200)
      return { active: null, reason: `HTTP ${res.status}`, status: res.status };
    const body = (await res.text()).toLowerCase();
    if (body.includes("couldn&#39;t find this account") || body.includes("couldn't find this account"))
      return { active: false, reason: "TikTok: akun tidak ada", status: 200 };
    if (body.includes('"statuscode":10221') || body.includes("user not found"))
      return { active: false, reason: "TikTok: user not found", status: 200 };
    if (body.includes("page not available"))
      return { active: false, reason: "TikTok: page not available", status: 200 };
    return { active: true, reason: "Akun aktif", status: 200 };
  } catch {
    return { active: null, reason: "Error koneksi", status: 0 };
  }
}

/**
 * Cek Telegram — t.me page.
 */
async function checkTelegram(username: string): Promise<CheckResult> {
  const u = username.replace(/^@/, "").trim();
  if (!u) return { active: null, reason: "Username kosong", status: 0 };
  try {
    const res = await fetch(`https://t.me/${encodeURIComponent(u)}`, {
      method: "GET",
      headers: { "User-Agent": UA },
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 404) return { active: false, reason: "Channel/user tidak ada", status: 404 };
    if (res.status !== 200) return { active: null, reason: `HTTP ${res.status}`, status: res.status };
    const body = (await res.text()).toLowerCase();
    if (body.includes("<title>telegram: contact") || body.includes("tgme_page_title"))
      return { active: true, reason: "Telegram aktif", status: 200 };
    if (body.includes("nothing found") || body.includes("user not found"))
      return { active: false, reason: "Telegram: tidak ada", status: 200 };
    return { active: null, reason: "Telegram: tidak pasti", status: 200 };
  } catch {
    return { active: null, reason: "Error koneksi", status: 0 };
  }
}

/**
 * Cek Instagram — sering ke-rate-limit (429), jadi return UNKNOWN saja
 * untuk hindari false-positive. Manual cek perlu.
 */
async function checkInstagram(username: string): Promise<CheckResult> {
  const u = username.replace(/^@/, "").trim();
  if (!u) return { active: null, reason: "Username kosong", status: 0 };
  try {
    const res = await fetch(`https://www.instagram.com/${encodeURIComponent(u)}/`, {
      method: "GET",
      headers: { "User-Agent": UA },
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
    });
    if (res.status === 404) return { active: false, reason: "IG: akun tidak ada", status: 404 };
    if (res.status === 429)
      return { active: null, reason: "IG: rate-limited (cek manual)", status: 429 };
    if (res.status !== 200) return { active: null, reason: `HTTP ${res.status}`, status: res.status };
    const body = (await res.text()).toLowerCase();
    if (body.includes("page not found") || body.includes("sorry, this page isn&#39;t available"))
      return { active: false, reason: "IG: page not found", status: 200 };
    if (body.includes('"is_deleted":true'))
      return { active: false, reason: "IG: account deleted", status: 200 };
    return { active: true, reason: "IG: aktif", status: 200 };
  } catch {
    return { active: null, reason: "Error koneksi", status: 0 };
  }
}

/**
 * Generic page check (fallback untuk Facebook, LinkedIn, Semprot, dll).
 */
async function checkGeneric(url: string, platform: string): Promise<CheckResult> {
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { "User-Agent": UA },
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
    });
    if (res.status === 404) return { active: false, reason: `${platform}: 404`, status: 404 };
    if (res.status === 410) return { active: false, reason: `${platform}: 410 deleted`, status: 410 };
    if (res.status !== 200) return { active: null, reason: `HTTP ${res.status}`, status: res.status };
    const body = (await res.text()).toLowerCase();
    const deadSignals = [
      "<title>page not found",
      "this content isn't available",
      "content isn&#39;t available",
      "profile not available",
      "this profile is not available",
      "profile not found",
    ];
    for (const s of deadSignals) {
      if (body.includes(s)) return { active: false, reason: `${platform}: ${s}`, status: 200 };
    }
    return { active: true, reason: `${platform}: aktif`, status: 200 };
  } catch {
    return { active: null, reason: "Error koneksi", status: 0 };
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const checks: Array<{ id: number; url: string; platform: string; username?: string }> =
      body.checks || [];

    if (!Array.isArray(checks) || checks.length === 0) {
      return NextResponse.json({ error: "checks[] required" }, { status: 400 });
    }

    // Limit per request: 15 (avoid Vercel timeout 60s + Twitter rate-limit 30/min)
    const limited = checks.slice(0, 15);

    // Concurrency adaptif: Twitter pakai 2 parallel (rate-limit ketat),
    // platform lain pakai 5 parallel (lebih lenient)
    const twitterChecks = limited.filter((c) => c.platform === "X (Twitter)");
    const otherChecks = limited.filter((c) => c.platform !== "X (Twitter)");

    const runCheck = async (c: typeof limited[number]): Promise<{ id: number } & CheckResult> => {
      if (!c.url && !c.username) {
        return { id: c.id, active: null, reason: "URL/username kosong", status: 0 };
      }
      let username = c.username || "";
      if (!username && c.url) {
        const m = c.url.match(/\/@?([\w._-]+)\/?$/);
        username = m?.[1] || "";
      }
      let r: CheckResult;
      if (c.platform === "X (Twitter)") r = await checkTwitter(username);
      else if (c.platform === "YouTube") r = await checkYoutube(username);
      else if (c.platform === "TikTok") r = await checkTikTok(username);
      else if (c.platform === "Telegram") r = await checkTelegram(username);
      else if (c.platform === "Instagram") r = await checkInstagram(username);
      else r = await checkGeneric(c.url, c.platform);
      return { id: c.id, ...r };
    };

    const results: Array<{ id: number } & CheckResult> = [];

    // Twitter: 2 parallel max, dengan delay 200ms antar batch (untuk rate-limit ~30/min)
    for (let i = 0; i < twitterChecks.length; i += 2) {
      const slice = twitterChecks.slice(i, i + 2);
      const settled = await Promise.all(slice.map(runCheck));
      results.push(...settled);
      if (i + 2 < twitterChecks.length) {
        await new Promise((r) => setTimeout(r, 300));
      }
    }

    // Platform lain: 5 parallel
    for (let i = 0; i < otherChecks.length; i += 5) {
      const slice = otherChecks.slice(i, i + 5);
      const settled = await Promise.all(slice.map(runCheck));
      results.push(...settled);
    }

    return NextResponse.json({
      results,
      checkedAt: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown error" },
      { status: 500 }
    );
  }
}
