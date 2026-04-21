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

/**
 * Send message to Telegram via Bot API.
 * Body: { connection_id, text, media_base64?, media_type? ('photo' | 'video'), posted_by }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { connection_id, text, media_base64, media_type, posted_by } = body;

    if (!connection_id) {
      return NextResponse.json({ error: "connection_id required" }, { status: 400 });
    }
    if (!text && !media_base64) {
      return NextResponse.json({ error: "text atau media wajib ada" }, { status: 400 });
    }

    const supabase = getSupabase();
    const { data: conn } = await supabase
      .from("telegram_connections")
      .select("*")
      .eq("id", connection_id)
      .maybeSingle();

    if (!conn) {
      return NextResponse.json({ error: "Koneksi Telegram tidak ditemukan" }, { status: 404 });
    }

    const baseUrl = `https://api.telegram.org/bot${conn.bot_token}`;
    let tgRes;
    let endpoint;

    if (media_base64 && media_type) {
      // Upload media (photo/video) sebagai multipart
      const mimeMatch = media_base64.match(/^data:([^;]+);base64,(.+)$/);
      if (!mimeMatch) {
        return NextResponse.json({ error: "Format base64 tidak valid" }, { status: 400 });
      }
      const [, mime, b64] = mimeMatch;
      const buf = Buffer.from(b64, "base64");

      endpoint = media_type === "video" ? "sendVideo" : "sendPhoto";
      const fileName = media_type === "video" ? "video.mp4" : "photo.jpg";
      const fieldName = media_type === "video" ? "video" : "photo";

      const formData = new FormData();
      formData.append("chat_id", conn.chat_id);
      if (text) formData.append("caption", text);
      formData.append(
        fieldName,
        new Blob([new Uint8Array(buf)], { type: mime }),
        fileName
      );

      tgRes = await fetch(`${baseUrl}/${endpoint}`, {
        method: "POST",
        body: formData,
      });
    } else {
      // Text only
      endpoint = "sendMessage";
      tgRes = await fetch(`${baseUrl}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: conn.chat_id,
          text,
          parse_mode: "HTML",
          disable_web_page_preview: false,
        }),
      });
    }

    const tgJson = await tgRes.json();

    if (!tgJson.ok) {
      await supabase.from("social_posts").insert({
        platform: "Telegram",
        posted_by: posted_by || conn.owner_name,
        target_owner: conn.owner_name,
        content: text || "",
        media_type: media_type || null,
        status: "error",
        error: (tgJson.description || "Unknown error").slice(0, 500),
      });
      return NextResponse.json(
        { error: tgJson.description || "Gagal kirim", detail: tgJson },
        { status: 400 }
      );
    }

    const msgId = tgJson.result?.message_id?.toString();
    await supabase.from("social_posts").insert({
      platform: "Telegram",
      posted_by: posted_by || conn.owner_name,
      target_owner: conn.owner_name,
      content: text || "",
      media_type: media_type || null,
      external_id: msgId,
      status: "posted",
    });

    return NextResponse.json({
      ok: true,
      message_id: msgId,
      chat_title: conn.chat_title,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown error" },
      { status: 500 }
    );
  }
}
