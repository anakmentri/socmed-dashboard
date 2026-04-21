import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Cek status akun sosmed via HTTP request ke profile URL.
 * Return: { active: boolean, reason: string }
 */
async function checkUrl(url: string, platform: string): Promise<{
  active: boolean;
  reason: string;
  status: number;
}> {
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
    });

    const status = res.status;
    if (status === 404) {
      return { active: false, reason: "Akun tidak ditemukan (404)", status };
    }
    if (status === 410) {
      return { active: false, reason: "Akun sudah dihapus (410 Gone)", status };
    }
    if (status === 403) {
      return { active: false, reason: "Akses ditolak (403) — mungkin suspended", status };
    }
    if (status === 451) {
      return { active: false, reason: "Dibatasi alasan legal (451)", status };
    }

    // Kalau response 200, cek body untuk keyword suspension platform-specific
    let body = "";
    try {
      body = await res.text();
    } catch {
      body = "";
    }
    const bodyLower = body.toLowerCase();

    const platformSpecific: Record<string, string[]> = {
      Instagram: [
        "sorry, this page isn't available",
        "page not found",
        "link you followed may be broken",
        "page isn't available",
      ],
      "X (Twitter)": [
        "account suspended",
        "this account doesn't exist",
        "account has been suspended",
      ],
      TikTok: [
        "couldn't find this account",
        "account not found",
        "this account is private",
      ],
      Facebook: [
        "this content isn't available",
        "the link you followed may have expired",
        "page not found",
      ],
      YouTube: ["this channel has been terminated", "channel not found", "account has been terminated"],
      LinkedIn: ["this profile is not available", "profile not found"],
      Telegram: ["nothing found", "user not found"],
    };

    const keywords = platformSpecific[platform] || ["not found", "suspended", "terminated"];
    for (const kw of keywords) {
      if (bodyLower.includes(kw)) {
        return { active: false, reason: `Terdeteksi: "${kw}"`, status };
      }
    }

    if (status >= 200 && status < 300) {
      return { active: true, reason: "Profile dapat diakses", status };
    }

    return { active: false, reason: `HTTP ${status}`, status };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("timeout") || msg.includes("abort")) {
      return { active: false, reason: "Timeout — tidak bisa diakses", status: 0 };
    }
    return { active: false, reason: `Error: ${msg.slice(0, 80)}`, status: 0 };
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const checks: Array<{ id: number; url: string; platform: string }> =
      body.checks || [];

    if (!Array.isArray(checks) || checks.length === 0) {
      return NextResponse.json({ error: "checks[] required" }, { status: 400 });
    }

    // Batas 20 akun per request untuk hindari timeout
    const limited = checks.slice(0, 20);
    const results = await Promise.all(
      limited.map(async (c) => {
        if (!c.url) {
          return { id: c.id, active: null, reason: "URL kosong", status: 0 };
        }
        const r = await checkUrl(c.url, c.platform);
        return { id: c.id, ...r };
      })
    );

    return NextResponse.json({ results, checkedAt: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown error" },
      { status: 500 }
    );
  }
}
