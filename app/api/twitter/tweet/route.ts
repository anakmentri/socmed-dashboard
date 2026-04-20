import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

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
  await supabase
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
    const { text, owner, posted_by } = await req.json();

    if (!text || !text.trim()) {
      return NextResponse.json({ error: "Text tweet kosong" }, { status: 400 });
    }
    if (text.length > 280) {
      return NextResponse.json(
        { error: "Tweet melebihi 280 karakter" },
        { status: 400 }
      );
    }

    const ownerName = owner || "admin";
    const { data: conn } = await supabase
      .from("twitter_connections")
      .select("*")
      .eq("owner_name", ownerName)
      .maybeSingle();

    if (!conn) {
      return NextResponse.json(
        { error: `Akun Twitter untuk "${ownerName}" belum terhubung. Klik Connect Twitter dulu.` },
        { status: 400 }
      );
    }

    const accessToken = await refreshTokenIfNeeded(conn);

    const tweetRes = await fetch("https://api.twitter.com/2/tweets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
    });
    const tweetJson = await tweetRes.json();

    if (!tweetRes.ok) {
      await supabase.from("twitter_posts").insert({
        connection_id: conn.id,
        posted_by: posted_by || ownerName,
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
      posted_by: posted_by || ownerName,
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
