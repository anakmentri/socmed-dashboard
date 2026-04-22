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
type MediaItem = { base64: string; type: "photo" | "video"; name?: string };

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      connection_id,
      text,
      media_base64,
      media_type,
      media_list,
      posted_by,
    } = body;

    if (!connection_id) {
      return NextResponse.json({ error: "connection_id required" }, { status: 400 });
    }
    const hasMedia = media_base64 || (Array.isArray(media_list) && media_list.length > 0);
    if (!text && !hasMedia) {
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

    // Multi-media (album / media group)
    if (Array.isArray(media_list) && media_list.length > 0) {
      const items = media_list as MediaItem[];
      if (items.length === 1) {
        // Cuma 1 item — fallback ke sendPhoto/sendVideo single
        const it = items[0];
        const mimeMatch = it.base64.match(/^data:([^;]+);base64,(.+)$/);
        if (!mimeMatch) {
          return NextResponse.json({ error: "Format base64 tidak valid" }, { status: 400 });
        }
        const [, mime, b64] = mimeMatch;
        const buf = Buffer.from(b64, "base64");
        endpoint = it.type === "video" ? "sendVideo" : "sendPhoto";
        const fieldName = it.type === "video" ? "video" : "photo";
        const formData = new FormData();
        formData.append("chat_id", conn.chat_id);
        if (text) formData.append("caption", text);
        if (text) formData.append("parse_mode", "HTML");
        formData.append(
          fieldName,
          new Blob([new Uint8Array(buf)], { type: mime }),
          it.name || (it.type === "video" ? "video.mp4" : "photo.jpg")
        );
        tgRes = await fetch(`${baseUrl}/${endpoint}`, {
          method: "POST",
          body: formData,
        });
      } else {
        // Media group: multiple items in 1 album
        endpoint = "sendMediaGroup";
        const formData = new FormData();
        formData.append("chat_id", conn.chat_id);

        const mediaArray: Array<{
          type: string;
          media: string;
          caption?: string;
          parse_mode?: string;
        }> = [];
        items.forEach((it, idx) => {
          const mimeMatch = it.base64.match(/^data:([^;]+);base64,(.+)$/);
          if (!mimeMatch) return;
          const [, mime, b64] = mimeMatch;
          const buf = Buffer.from(b64, "base64");
          const attachKey = `file${idx}`;
          const ext = mime.split("/")[1]?.split(";")[0] || (it.type === "video" ? "mp4" : "jpg");
          const fileName = it.name || `file${idx}.${ext}`;
          formData.append(
            attachKey,
            new Blob([new Uint8Array(buf)], { type: mime }),
            fileName
          );
          const item: {
            type: string;
            media: string;
            caption?: string;
            parse_mode?: string;
            supports_streaming?: boolean;
          } = {
            type: it.type,
            media: `attach://${attachKey}`,
          };
          if (it.type === "video") {
            item.supports_streaming = true;
          }
          if (idx === 0 && text) {
            item.caption = text;
            item.parse_mode = "HTML";
          }
          mediaArray.push(item);
        });

        formData.append("media", JSON.stringify(mediaArray));
        tgRes = await fetch(`${baseUrl}/${endpoint}`, {
          method: "POST",
          body: formData,
        });
      }
    } else if (media_base64 && media_type) {
      const mimeMatch = media_base64.match(/^data:([^;]+);base64,(.+)$/);
      if (!mimeMatch) {
        return NextResponse.json({ error: "Format base64 tidak valid" }, { status: 400 });
      }
      const [, mime, b64] = mimeMatch;
      const buf = Buffer.from(b64, "base64");

      endpoint = media_type === "video" ? "sendVideo" : "sendPhoto";
      // Ekstensi dari mime type
      const ext = mime.split("/")[1]?.split(";")[0] || (media_type === "video" ? "mp4" : "jpg");
      const fileName = `${media_type}.${ext}`;
      const fieldName = media_type === "video" ? "video" : "photo";

      const formData = new FormData();
      formData.append("chat_id", conn.chat_id);
      if (text) {
        formData.append("caption", text);
        formData.append("parse_mode", "HTML");
      }
      if (media_type === "video") {
        formData.append("supports_streaming", "true");
      }
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

    // Determine media_type label for log
    const mediaCount = Array.isArray(media_list) ? media_list.length : media_base64 ? 1 : 0;
    const mediaTypeLog =
      mediaCount > 1
        ? `album-${mediaCount}`
        : Array.isArray(media_list) && media_list.length === 1
        ? media_list[0].type
        : media_type || null;

    if (!tgJson.ok) {
      await supabase.from("social_posts").insert({
        platform: "Telegram",
        posted_by: posted_by || conn.owner_name,
        target_owner: conn.owner_name,
        content: text || "",
        media_type: mediaTypeLog,
        status: "error",
        error: (tgJson.description || "Unknown error").slice(0, 500),
      });
      return NextResponse.json(
        { error: tgJson.description || "Gagal kirim", detail: tgJson },
        { status: 400 }
      );
    }

    // sendMediaGroup return array of messages, ambil id pertama
    const msgId = Array.isArray(tgJson.result)
      ? tgJson.result[0]?.message_id?.toString()
      : tgJson.result?.message_id?.toString();

    await supabase.from("social_posts").insert({
      platform: "Telegram",
      posted_by: posted_by || conn.owner_name,
      target_owner: conn.owner_name,
      content: text || "",
      media_type: mediaTypeLog,
      external_id: msgId,
      status: "posted",
    });

    return NextResponse.json({
      ok: true,
      message_id: msgId,
      chat_title: conn.chat_title,
      media_count: mediaCount,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown error" },
      { status: 500 }
    );
  }
}
