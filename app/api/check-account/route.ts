import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type CheckResult = {
  active: boolean | null; // null = unknown (tidak bisa dipastikan)
  reason: string;
  status: number;
};

/**
 * Cek status akun sosmed via HTTP request.
 * Prinsip: DEFAULT AKTIF kecuali ada bukti KUAT akun suspended/dihapus.
 * Mencegah false-positive di mana akun valid di-flag suspended.
 */
async function checkUrl(url: string, platform: string): Promise<CheckResult> {
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,id;q=0.8",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(12000),
    });

    const status = res.status;

    // HTTP 404 = akun tidak ada → SUSPENDED/DIHAPUS
    if (status === 404) {
      return { active: false, reason: "Akun tidak ditemukan (404)", status };
    }
    // HTTP 410 = dihapus permanen
    if (status === 410) {
      return { active: false, reason: "Akun sudah dihapus (410)", status };
    }

    // HTTP 403, 451, 5xx, dll = BELUM TENTU suspended (bisa block, server error, dll)
    // → return UNKNOWN, bukan suspended
    if (status !== 200 && status !== 301 && status !== 302) {
      return {
        active: null,
        reason: `HTTP ${status} — tidak pasti`,
        status,
      };
    }

    let body = "";
    try {
      body = await res.text();
    } catch {
      return { active: null, reason: "Tidak bisa baca response", status };
    }
    const bodyLower = body.toLowerCase();

    // Deteksi KUAT suspended per platform — harus match frase spesifik
    // Return active:false HANYA kalau salah satu frase ini ditemukan
    const strongSuspendSignals: Record<string, string[]> = {
      "X (Twitter)": [
        // Exact title yang muncul di halaman suspended X (lihat screenshot user)
        "<title>account suspended",
        '"title":"account suspended"',
        "account suspended / x",
        "account suspended — x",
        // X kadang pakai this account doesn't exist
        "<title>this account doesn&#39;t exist",
        'content="account suspended"',
      ],
      Instagram: [
        "<title>page not found",
        "sorry, this page isn't available",
        '"is_deleted":true',
        "the link you followed may be broken",
      ],
      TikTok: [
        "<title>page not available",
        "couldn&#39;t find this account",
        "video currently unavailable",
        '"statusCode":10221', // TikTok user not found
      ],
      Facebook: [
        "<title>page not found",
        "content isn&#39;t available right now",
        "this content isn't available",
      ],
      YouTube: [
        "<title>404 not found",
        "this account has been terminated",
        "channel does not exist",
      ],
      LinkedIn: ["profile not found", "this profile is not available"],
      Telegram: [
        "<title>telegram: contact",
        "nothing found",
      ],
    };

    const signals = strongSuspendSignals[platform] || [];
    // Khusus Telegram: cek reversed — kalau JUSTRU title "telegram: contact" itu artinya AKTIF
    if (platform === "Telegram") {
      // Telegram suspended/not-exist nggak punya page dedicated, jadi cek positif: title
      // kalau tidak ada "contact" berarti aneh → unknown
      if (bodyLower.includes("<title>telegram: contact")) {
        return { active: true, reason: "Profile valid", status };
      }
      return { active: null, reason: "Tidak pasti (Telegram)", status };
    }

    for (const signal of signals) {
      if (bodyLower.includes(signal)) {
        return {
          active: false,
          reason: `Terdeteksi: akun suspended/dihapus`,
          status,
        };
      }
    }

    // HTTP 200 + tidak ada sinyal suspended kuat = aktif
    if (status === 200) {
      return { active: true, reason: "Profile dapat diakses", status };
    }

    return { active: null, reason: `HTTP ${status}`, status };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("timeout") || msg.includes("abort") || msg.includes("AbortError")) {
      return { active: null, reason: "Timeout — tidak bisa dipastikan", status: 0 };
    }
    return { active: null, reason: `Error koneksi`, status: 0 };
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

    // Batch max 20 per request
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
