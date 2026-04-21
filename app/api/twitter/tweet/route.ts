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
    const { text, owner, posted_by, connection_id, media_base64 } = await req.json();

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

    // Upload media via v1.1 endpoint kalau ada image attachment (OAuth 2.0 tidak support media upload v1.1,
    // jadi kita coba pakai v2 /2/media/upload yang baru — still beta, fallback text-only kalau gagal)
    let mediaId: string | null = null;
    if (media_base64) {
      try {
        const mimeMatch = media_base64.match(/^data:([^;]+);base64,(.+)$/);
        if (mimeMatch) {
          const [, , b64] = mimeMatch;
          const buf = Buffer.from(b64, "base64");
          const form = new FormData();
          form.append(
            "media",
            new Blob([new Uint8Array(buf)]),
            mimeMatch[1].startsWith("video") ? "video.mp4" : "photo.jpg"
          );
          const upRes = await fetch("https://api.twitter.com/2/media/upload", {
            method: "POST",
            headers: { Authorization: `Bearer ${accessToken}` },
            body: form,
          });
          const upJson = await upRes.json();
          if (upRes.ok && (upJson.data?.id || upJson.media_id_string)) {
            mediaId = upJson.data?.id || upJson.media_id_string;
          } else {
            // Log error but continue with text-only
            console.warn("Twitter media upload failed:", upJson);
          }
        }
      } catch (e) {
        console.warn("Twitter media upload error:", e);
      }
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
      });
      return NextResponse.json(
        { error: tweetJson.title || tweetJson.error || "Gagal post", detail: tweetJson },
        { status: tweetRes.status }
      );
    }

    const tweetId = tweetJson.data?.id;
    await supabase.from("twitter_posts").insert({
      connection_id: conn.id,
      posted_by: posted_by || conn.owner_name,
      tweet_id: tweetId,
      text_content: text,
      status: "posted",
    });

    return NextResponse.json({
      ok: true,
      tweet_id: tweetId,
      url: `https://twitter.com/${conn.twitter_username || "i"}/status/${tweetId}`,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown error" },
      { status: 500 }
    );
  }
}
