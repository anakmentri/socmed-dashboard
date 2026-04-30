import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

async function refreshTokenIfNeeded(conn: {
  id: number;
  access_token: string;
  refresh_token: string | null;
  expires_at: string | null;
}): Promise<string> {
  if (!conn.expires_at) return conn.access_token;
  const expiresAt = new Date(conn.expires_at).getTime();
  // Refresh if expires in < 5 minutes
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
  const j = await res.json();
  if (!res.ok || !j.access_token) return conn.access_token;

  const newExpires = new Date(
    Date.now() + (j.expires_in || 7200) * 1000
  ).toISOString();
  await getSupabase()
    .from("twitter_connections")
    .update({
      access_token: j.access_token,
      refresh_token: j.refresh_token || conn.refresh_token,
      expires_at: newExpires,
      updated_at: new Date().toISOString(),
    })
    .eq("id", conn.id);

  return j.access_token;
}

export async function POST(req: NextRequest) {
  try {
    const { text, owner, posted_by, connection_id, media_base64: rawMediaBase64, media_url, post_group } = await req.json();

    // Resolve media: kalau media_url provided, fetch + convert ke base64 di sini
    // (bypass Vercel body limit — fetch internal gak kena 4.5MB cap).
    let media_base64: string | null = rawMediaBase64 || null;
    if (!media_base64 && media_url) {
      try {
        // Auto-convert Google Drive sharing → direct download
        let url = media_url as string;
        const driveMatch = url.match(/drive\.google\.com\/file\/d\/([\w-]+)/);
        if (driveMatch) url = `https://drive.google.com/uc?export=download&id=${driveMatch[1]}`;
        const driveOpen = url.match(/drive\.google\.com\/open\?id=([\w-]+)/);
        if (driveOpen) url = `https://drive.google.com/uc?export=download&id=${driveOpen[1]}`;
        if (url.includes("dropbox.com") && url.includes("dl=0"))
          url = url.replace("dl=0", "dl=1");

        const fetchRes = await fetch(url, {
          redirect: "follow",
          signal: AbortSignal.timeout(60000),
        });
        if (!fetchRes.ok) {
          return NextResponse.json(
            { error: `Fetch media URL gagal: HTTP ${fetchRes.status}` },
            { status: 400 }
          );
        }
        const ct = fetchRes.headers.get("content-type") || "";
        if (!ct.startsWith("image/") && !ct.startsWith("video/")) {
          return NextResponse.json(
            { error: `URL bukan media (content-type: ${ct.slice(0, 60)}). Pastikan URL adalah direct download link.` },
            { status: 400 }
          );
        }
        const buf = Buffer.from(await fetchRes.arrayBuffer());
        media_base64 = `data:${ct};base64,${buf.toString("base64")}`;
      } catch (e) {
        return NextResponse.json(
          { error: `Fetch media URL error: ${e instanceof Error ? e.message.slice(0, 100) : "unknown"}` },
          { status: 400 }
        );
      }
    }

    if (!text && !media_base64) {
      return NextResponse.json({ error: "Text atau media wajib ada" }, { status: 400 });
    }
    if (text && text.length > 280) {
      return NextResponse.json(
        { error: "Tweet melebihi 280 karakter" },
        { status: 400 }
      );
    }

    const supabase = getSupabase();

    // Cari connection by id (pilihan spesifik user) atau fallback owner_name
    let conn;
    if (connection_id) {
      const { data } = await supabase
        .from("twitter_connections")
        .select("*")
        .eq("id", connection_id)
        .maybeSingle();
      conn = data;
    } else {
      const ownerName = owner || "admin";
      const { data } = await supabase
        .from("twitter_connections")
        .select("*")
        .eq("owner_name", ownerName)
        .order("id", { ascending: true })
        .limit(1)
        .maybeSingle();
      conn = data;
    }

    if (!conn) {
      return NextResponse.json(
        { error: `Akun Twitter belum terhubung. Klik Connect Twitter dulu.` },
        { status: 400 }
      );
    }

    const accessToken = await refreshTokenIfNeeded(conn);

    // Upload media via v2 endpoint (OAuth 2.0 user context).
    // WAJIB scope 'media.write' — kalau akun belum re-auth setelah scope ditambah,
    // bakal error 403 dan user perlu disconnect+reconnect Twitter.
    let mediaId: string | null = null;
    let mediaError: string | null = null;
    if (media_base64) {
      const mimeMatch = media_base64.match(/^data:([^;]+);base64,(.+)$/);
      if (!mimeMatch) {
        mediaError = "Format media tidak valid (bukan base64 data URI)";
      } else {
        try {
          const [, mimeType, b64] = mimeMatch;
          const buf = Buffer.from(b64, "base64");
          const isVideo = mimeType.startsWith("video");
          const ext = mimeType.split("/")[1]?.split(";")[0] || (isVideo ? "mp4" : "jpg");
          const fileName = isVideo ? `video.${ext}` : `photo.${ext}`;

          const form = new FormData();
          // Twitter v2 media upload: butuh field 'media' dengan binary
          form.append(
            "media",
            new Blob([new Uint8Array(buf)], { type: mimeType }),
            fileName
          );
          // media_category membantu Twitter klasifikasikan asset
          form.append("media_category", isVideo ? "tweet_video" : "tweet_image");

          const upRes = await fetch("https://api.x.com/2/media/upload", {
            method: "POST",
            headers: { Authorization: `Bearer ${accessToken}` },
            body: form,
          });

          let upJson: { data?: { id?: string; media_key?: string }; errors?: Array<{ message?: string; title?: string }>; title?: string; detail?: string; media_id_string?: string; reason?: string };
          try {
            upJson = await upRes.json();
          } catch {
            upJson = {};
          }

          if (upRes.ok && (upJson.data?.id || upJson.media_id_string)) {
            mediaId = upJson.data?.id || upJson.media_id_string || null;
          } else {
            const errMsg =
              upJson.errors?.[0]?.message ||
              upJson.errors?.[0]?.title ||
              upJson.title ||
              upJson.detail ||
              upJson.reason ||
              `HTTP ${upRes.status}`;
            mediaError = `Media upload gagal: ${errMsg}`;
            // Hint kalau scope issue
            if (upRes.status === 403 || /scope|permission|forbidden/i.test(errMsg)) {
              mediaError +=
                ". Akun Twitter perlu di-disconnect lalu Connect ulang (scope 'media.write' baru ditambah).";
            }
            // Hint kalau tier issue
            if (upRes.status === 429 || /credit|quota|rate/i.test(errMsg)) {
              mediaError +=
                ". Cek subscription Twitter API kamu (Free tier tidak support media upload, butuh Basic+).";
            }
            console.warn("Twitter media upload failed:", upRes.status, upJson);
          }
        } catch (e) {
          mediaError = e instanceof Error ? e.message : "Media upload error";
          console.warn("Twitter media upload exception:", e);
        }
      }
    }

    // Kalau user upload media tapi gagal, return error (jangan post text-only diam-diam)
    if (media_base64 && !mediaId) {
      return NextResponse.json(
        { error: mediaError || "Media upload gagal — alasan tidak diketahui" },
        { status: 400 }
      );
    }

    const tweetPayload: { text: string; media?: { media_ids: string[] } } = {
      text: text || "",
    };
    if (mediaId) tweetPayload.media = { media_ids: [mediaId] };

    const tweetRes = await fetch("https://api.twitter.com/2/tweets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(tweetPayload),
    });
    const tweetJson = await tweetRes.json();

    if (!tweetRes.ok) {
      await supabase.from("twitter_posts").insert({
        connection_id: conn.id,
        posted_by: posted_by || conn.owner_name,
        text_content: text,
        status: "error",
        error: JSON.stringify(tweetJson).slice(0, 500),
        post_group: post_group || null,
      });
      return NextResponse.json(
        { error: tweetJson.title || tweetJson.error || "Gagal post", detail: tweetJson },
        { status: tweetRes.status }
      );
    }

    const tweetId = tweetJson.data?.id;
    const tweetUrl = `https://x.com/${conn.twitter_username || "i"}/status/${tweetId}`;
    await supabase.from("twitter_posts").insert({
      connection_id: conn.id,
      posted_by: posted_by || conn.owner_name,
      tweet_id: tweetId,
      text_content: text,
      status: "posted",
      post_group: post_group || null,
    });

    return NextResponse.json({
      ok: true,
      tweet_id: tweetId,
      url: tweetUrl,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown error" },
      { status: 500 }
    );
  }
}
