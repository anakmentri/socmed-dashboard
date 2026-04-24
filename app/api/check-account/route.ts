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
 * Cek X (Twitter) via Twitter's oembed endpoint.
 * RELIABLE: returns HTTP 200 untuk akun aktif, HTTP 404 untuk akun
 * suspended/dihapus/tidak ada. Tidak butuh auth.
 */
async function checkTwitter(username: string): Promise<CheckResult> {
  const u = username.replace(/^@/, "").trim();
  if (!u) return { active: null, reason: "Username kosong", status: 0 };

  const oembedUrl = `https://publish.twitter.com/oembed?url=https%3A%2F%2Ftwitter.com%2F${encodeURIComponent(u)}`;
  try {
    const res = await fetch(oembedUrl, {
      method: "GET",
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });
    const status = res.status;
    if (status === 200) {
      return { active: true, reason: "Akun aktif (oembed OK)", status };
    }
    if (status === 404) {
      // 404 di oembed = akun suspended ATAU tidak ada ATAU protected
      // Cek lebih lanjut: fetch profile page untuk konfirmasi
      const r2 = await fetch(`https://x.com/${encodeURIComponent(u)}`, {
        method: "GET",
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(8000),
      });
      // X selalu return 200 untuk SPA, tapi kalau redirect bisa kasih hint
      if (r2.status === 404) {
        return { active: false, reason: "Akun tidak ada / suspended", status };
      }
      // Default: assume suspended berdasarkan oembed 404
      return { active: false, reason: "Akun tidak ditemukan / suspended", status };
    }
    if (status === 403) {
      return { active: null, reason: "403 — protected/private", status };
    }
    return { active: null, reason: `HTTP ${status} — tidak pasti`, status };
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

    // Limit per request: 30 (concurrent fetch)
    const limited = checks.slice(0, 30);

    // Concurrency: 5 parallel via batching
    const CONCURRENCY = 5;
    const results: Array<{ id: number } & CheckResult> = [];

    for (let i = 0; i < limited.length; i += CONCURRENCY) {
      const slice = limited.slice(i, i + CONCURRENCY);
      const settled = await Promise.all(
        slice.map(async (c) => {
          if (!c.url && !c.username) {
            return { id: c.id, active: null, reason: "URL/username kosong", status: 0 };
          }
          // Extract username dari url kalau ada (fallback)
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
        })
      );
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
