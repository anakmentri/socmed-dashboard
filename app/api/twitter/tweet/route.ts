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
 * Upload video ke Twitter via chunked upload (INIT/APPEND/FINALIZE/STATUS).
 * Pakai endpoint v2 /2/media/upload dengan command query param + OAuth 2.0
 * Bearer token user context (scope media.write). Support video sampai 512MB.
 */
async function uploadVideoChunked(
  accessToken: string,
  buf: Buffer,
  mimeType: string
): Promise<{ media_id: string | null; error?: string }> {
  const totalBytes = buf.length;
  const baseUrl = "https://api.x.com/2/media/upload";
  const authHeader = { Authorization: `Bearer ${accessToken}` };

  // ============ INIT ============
  const initForm = new FormData();
  initForm.append("total_bytes", String(totalBytes));
  initForm.append("media_type", mimeType);
  initForm.append("media_category", "tweet_video");
  const initRes = await fetch(`${baseUrl}?command=INIT`, {
    method: "POST",
    headers: authHeader,
    body: initForm,
  });
  if (!initRes.ok) {
    const txt = await initRes.text().catch(() => "");
    return { media_id: null, error: `INIT HTTP ${initRes.status}: ${txt.slice(0, 200)}` };
  }
  const initJson = await initRes.json().catch(() => ({}));
  const mediaId =
    initJson.data?.id ||
    initJson.media_id_string ||
    (initJson.media_id ? String(initJson.media_id) : "");
  if (!mediaId) {
    return { media_id: null, error: `INIT no media_id: ${JSON.stringify(initJson).slice(0, 200)}` };
  }

  // ============ APPEND chunks (4MB each, safe under Twitter 5MB chunk limit) ============
  const CHUNK_SIZE = 4 * 1024 * 1024;
  let segmentIndex = 0;
  for (let offset = 0; offset < totalBytes; offset += CHUNK_SIZE) {
    const chunk = buf.subarray(offset, Math.min(offset + CHUNK_SIZE, totalBytes));
    const form = new FormData();
    form.append("media_id", mediaId);
    form.append("segment_index", String(segmentIndex));
    form.append(
      "media",
      new Blob([new Uint8Array(chunk)], { type: "application/octet-stream" })
    );
    const appendRes = await fetch(`${baseUrl}?command=APPEND`, {
      method: "POST",
      headers: authHeader,
      body: form,
    });
    if (!appendRes.ok) {
      const txt = await appendRes.text().catch(() => "");
      return {
        media_id: null,
        error: `APPEND seg ${segmentIndex} HTTP ${appendRes.status}: ${txt.slice(0, 200)}`,
      };
    }
    segmentIndex++;
  }

  // ============ FINALIZE ============
  const finalForm = new FormData();
  finalForm.append("media_id", mediaId);
  const finalRes = await fetch(`${baseUrl}?command=FINALIZE`, {
    method: "POST",
    headers: authHeader,
    body: finalForm,
  });
  if (!finalRes.ok) {
    const txt = await finalRes.text().catch(() => "");
    return { media_id: null, error: `FINALIZE HTTP ${finalRes.status}: ${txt.slice(0, 200)}` };
  }
  const finalJson = await finalRes.json().catch(() => ({}));

  // ============ STATUS poll (video processing) ============
  let processingInfo = finalJson.data?.processing_info || finalJson.processing_info;
  let attempts = 0;
  const maxAttempts = 30; // ~90s max wait untuk video besar
  while (processingInfo && processingInfo.state !== "succeeded" && attempts < maxAttempts) {
    if (processingInfo.state === "failed") {
      return {
        media_id: null,
        error: `Processing failed: ${processingInfo.error?.message || "unknown"}`,
      };
    }
    const checkAfterSec = processingInfo.check_after_secs || 3;
    await new Promise((r) => setTimeout(r, checkAfterSec * 1000));
    const statusUrl = `${baseUrl}?command=STATUS&media_id=${mediaId}`;
    const statusRes = await fetch(statusUrl, {
      method: "GET",
      headers: authHeader,
    });
    if (!statusRes.ok) break;
    const statusJson = await statusRes.json().catch(() => ({}));
    processingInfo =
      statusJson.data?.processing_info || statusJson.processing_info;
    attempts++;
  }

  return { media_id: mediaId };
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
        let ct = fetchRes.headers.get("content-type") || "";
        // Telegram & beberapa CDN serve generic content-type. Infer dari ekstensi URL.
        if (!ct.startsWith("image/") && !ct.startsWith("video/")) {
          const lower = url.toLowerCase().split("?")[0];
          if (/\.(jpe?g)$/i.test(lower)) ct = "image/jpeg";
          else if (/\.png$/i.test(lower)) ct = "image/png";
          else if (/\.gif$/i.test(lower)) ct = "image/gif";
          else if (/\.webp$/i.test(lower)) ct = "image/webp";
          else if (/\.mp4$/i.test(lower)) ct = "video/mp4";
          else if (/\.mov$/i.test(lower)) ct = "video/quicktime";
          else if (/\.webm$/i.test(lower)) ct = "video/webm";
          else {
            return NextResponse.json(
              { error: `URL bukan media (content-type: ${ct.slice(0, 60)}, tidak ada ekstensi file). Pastikan URL adalah direct download link.` },
              { status: 400 }
            );
          }
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
    // - Photo: single-shot upload (max 5MB)
    // - Video: chunked upload INIT/APPEND/FINALIZE/STATUS (max 512MB)
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

          if (isVideo && buf.length > 512 * 1024 * 1024) {
            // Twitter hard cap untuk video adalah 512MB
            const sizeMB = (buf.length / 1024 / 1024).toFixed(1);
            mediaError = `Video ${sizeMB}MB melebihi batas Twitter (512MB). Compress dulu.`;
          } else if (isVideo && buf.length > 5 * 1024 * 1024) {
            // Video > 5MB: chunked upload (INIT/APPEND/FINALIZE/STATUS) via v2 endpoint
            const chunkRes = await uploadVideoChunked(accessToken, buf, mimeType);
            if (chunkRes.media_id) {
              mediaId = chunkRes.media_id;
            } else {
              const sizeMB = (buf.length / 1024 / 1024).toFixed(1);
              mediaError = `Video chunked upload (${sizeMB}MB) gagal: ${chunkRes.error || "unknown"}. Coba compress ke <5MB.`;
            }
          } else if (isVideo) {
            // Video <= 5MB: single-shot
            const form = new FormData();
            form.append(
              "media",
              new Blob([new Uint8Array(buf)], { type: mimeType }),
              fileName
            );
            form.append("media_category", "tweet_video");

            const upRes = await fetch("https://api.x.com/2/media/upload", {
              method: "POST",
              headers: { Authorization: `Bearer ${accessToken}` },
              body: form,
            });
            const upJson = await upRes.json().catch(() => ({}));
            if (upRes.ok && (upJson.data?.id || upJson.media_id_string)) {
              mediaId = upJson.data?.id || upJson.media_id_string || null;
            } else {
              mediaError = `Video upload gagal: HTTP ${upRes.status}`;
            }
          } else {
            // ============ SINGLE-SHOT untuk photo ============
            const form = new FormData();
            form.append(
              "media",
              new Blob([new Uint8Array(buf)], { type: mimeType }),
              fileName
            );
            form.append("media_category", "tweet_image");

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
              if (upRes.status === 403 || /scope|permission|forbidden/i.test(errMsg)) {
                mediaError +=
                  ". Akun Twitter perlu di-disconnect lalu Connect ulang (scope 'media.write' baru ditambah).";
              }
              if (upRes.status === 429 || /credit|quota|rate/i.test(errMsg)) {
                mediaError +=
                  ". Cek subscription Twitter API kamu (butuh Basic+).";
              }
              console.warn("Twitter media upload failed:", upRes.status, upJson);
            }
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
