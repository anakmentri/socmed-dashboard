"use client";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { useToast } from "@/components/Toast";
import { useSession } from "@/hooks/useSession";
import { supabase } from "@/lib/supabase";
import { logAs, initials } from "@/lib/utils";
import { useTeamMembers } from "@/hooks/useTeamMembers";

type TwitterConn = {
  id: number;
  owner_name: string;
  twitter_username: string;
};
type TelegramConn = {
  id: number;
  owner_name: string;
  chat_title: string;
  chat_id: string;
  bot_token: string;
};
type SocialPost = {
  id: number;
  platform: string;
  posted_by: string;
  target_owner: string | null;
  content: string;
  media_type: string | null;
  status: string;
  error: string | null;
  external_id: string | null;
  post_group?: string | null;
  created_at: string;
};
type TwitterPost = {
  id: number;
  connection_id: number | null;
  tweet_id: string;
  text_content: string;
  status: string;
  error?: string;
  posted_by: string;
  post_group?: string | null;
  created_at: string;
};

type TabKey = "twitter" | "telegram";

const PLATFORMS: Array<{ key: TabKey; name: string; color: string; icon: string }> = [
  { key: "twitter", name: "X (Twitter)", color: "#1DA1F2", icon: "𝕏" },
  { key: "telegram", name: "Telegram", color: "#229ED9", icon: "✈" },
];

function AutoPostInner() {
  const { session } = useSession();
  const { toast } = useToast();
  const sp = useSearchParams();
  const { team } = useTeamMembers();

  const [tab, setTab] = useState<TabKey>("twitter");
  const [twConns, setTwConns] = useState<TwitterConn[]>([]);
  const [tgConns, setTgConns] = useState<TelegramConn[]>([]);
  const [twPosts, setTwPosts] = useState<TwitterPost[]>([]);
  const [tgPosts, setTgPosts] = useState<SocialPost[]>([]);

  const [text, setText] = useState("");
  const [owner, setOwner] = useState("admin");
  const [connSearch, setConnSearch] = useState("");

  // Bulk post state
  const [bulkPosting, setBulkPosting] = useState<{
    group: string;
    done: number;
    total: number;
    success: number;
    failed: number;
    currentAccount: string;
    errors: string[];
    successLinks: Array<{ account: string; url: string }>;
  } | null>(null);

  // Schedule mode
  const [scheduleMode, setScheduleMode] = useState(false);
  const [scheduleDateTime, setScheduleDateTime] = useState(""); // local datetime-local string
  const [scheduleGroup, setScheduleGroup] = useState<string>("Post 1");
  const [scheduleMediaUrl, setScheduleMediaUrl] = useState(""); // alternatif untuk file > 4MB
  const [scheduling, setScheduling] = useState(false);
  const [posting, setPosting] = useState(false);
  const [selectedConnId, setSelectedConnId] = useState<number | null>(null);
  const [mediaBase64, setMediaBase64] = useState<string>(""); // legacy: 1 file (Twitter)
  const [mediaType, setMediaType] = useState<"photo" | "video" | null>(null);
  const [mediaList, setMediaList] = useState<Array<{ base64: string; type: "photo" | "video"; name: string }>>([]); // multi-file (Telegram)

  // Telegram setup form
  const [showTgSetup, setShowTgSetup] = useState(false);
  const [tgForm, setTgForm] = useState({
    owner: "",
    bot_token: "",
    chat_id: "",
    chat_title: "",
  });

  const isAdmin = session?.role === "admin";
  const isMember = session?.role === "member";
  const myName = session?.memberName || (isAdmin ? "admin" : "");

  const load = async () => {
    const [twC, tgC, twP, tgP] = await Promise.all([
      isMember && myName
        ? supabase.from("twitter_connections").select("*").eq("owner_name", myName).order("id")
        : supabase.from("twitter_connections").select("*").order("id"),
      isMember && myName
        ? supabase.from("telegram_connections").select("*").eq("owner_name", myName).order("id")
        : supabase.from("telegram_connections").select("*").order("id"),
      supabase
        .from("twitter_posts")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(30),
      supabase
        .from("social_posts")
        .select("*")
        .eq("platform", "Telegram")
        .order("created_at", { ascending: false })
        .limit(30),
    ]);
    setTwConns((twC.data as TwitterConn[]) || []);
    setTgConns((tgC.data as TelegramConn[]) || []);
    setTwPosts((twP.data as TwitterPost[]) || []);
    setTgPosts((tgP.data as SocialPost[]) || []);

  };

  // Toast handlers for OAuth callback (only run once on mount)
  useEffect(() => {
    if (sp.get("connected")) {
      toast(`Twitter @${sp.get("connected")} terhubung!`);
      window.history.replaceState({}, "", "/dashboard/autopost");
    }
    if (sp.get("error")) toast(`Error: ${sp.get("error")}`, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load connections — wait for session to be ready (session?.role exists),
  // otherwise first call runs as admin (isMember=false) and fetches ALL accounts
  useEffect(() => {
    if (!session?.role) return; // session belum siap, jangan fetch dulu
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.role, myName]);

  useEffect(() => {
    if (myName) {
      setOwner(myName);
      setTgForm((f) => ({ ...f, owner: myName }));
    }
  }, [myName]);

  // Media upload — Twitter pakai single, Telegram pakai multi (max 10)
  const onMediaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    // Limit client-side: 20MB foto, 200MB video (sesuai request user).
    // ⚠ Telegram standard bot API hanya terima video sampai 50MB — di atas itu
    // bakal direject oleh Telegram dengan error "Request entity too large".
    const maxSize = (file: File) =>
      file.type.startsWith("video") ? 200 * 1024 * 1024 : 20 * 1024 * 1024;
    const maxLabel = (file: File) =>
      file.type.startsWith("video") ? "200MB" : "20MB";

    if (tab === "twitter") {
      const file = files[0];
      if (file.size > maxSize(file)) return toast(`Maks ${maxLabel(file)}`, true);
      const reader = new FileReader();
      reader.onload = () => {
        setMediaBase64(String(reader.result || ""));
        setMediaType(file.type.startsWith("video") ? "video" : "photo");
      };
      reader.readAsDataURL(file);
      return;
    }

    // Telegram: multi-upload (max 10 total)
    const remaining = 10 - mediaList.length;
    if (remaining <= 0) return toast("Maksimal 10 media per post Telegram", true);

    const toAdd = files.slice(0, remaining);
    let processed = 0;
    const newItems: typeof mediaList = [];

    toAdd.forEach((file) => {
      if (file.size > maxSize(file)) {
        toast(`${file.name}: lebih dari ${maxLabel(file)}, di-skip`, true);
        processed++;
        if (processed === toAdd.length && newItems.length > 0) {
          setMediaList((prev) => [...prev, ...newItems]);
        }
        return;
      }
      // Warning: video > 50MB akan ditolak Telegram Bot API
      if (file.type.startsWith("video") && file.size > 50 * 1024 * 1024) {
        const mb = Math.round(file.size / 1024 / 1024);
        toast(
          `⚠ ${file.name} (${mb}MB) > 50MB. Telegram bot mungkin tolak. Compress dulu kalau gagal.`,
          false
        );
      }
      const reader = new FileReader();
      reader.onload = () => {
        newItems.push({
          base64: String(reader.result || ""),
          type: file.type.startsWith("video") ? "video" : "photo",
          name: file.name,
        });
        processed++;
        if (processed === toAdd.length) {
          setMediaList((prev) => [...prev, ...newItems]);
          if (files.length > remaining) {
            toast(`${remaining} file diupload, ${files.length - remaining} di-skip (max 10)`, false);
          }
        }
      };
      reader.readAsDataURL(file);
    });
    // Clear input agar bisa pilih file yg sama lagi
    e.target.value = "";
  };

  const clearMedia = () => {
    setMediaBase64("");
    setMediaType(null);
    setMediaList([]);
  };

  const removeMediaAt = (idx: number) => {
    setMediaList((prev) => prev.filter((_, i) => i !== idx));
  };

  // Convert dataURL ke Blob (untuk direct upload tanpa lewat server)
  const dataURLtoBlob = (dataURL: string): { blob: Blob; mime: string; ext: string } | null => {
    const m = dataURL.match(/^data:([^;]+);base64,(.+)$/);
    if (!m) return null;
    const [, mime, b64] = m;
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return {
      blob: new Blob([arr], { type: mime }),
      mime,
      ext: mime.split("/")[1]?.split(";")[0] || "bin",
    };
  };

  // Direct upload ke Telegram (bypass Vercel — bisa file gede sampai 50MB)
  const sendDirectToTelegram = async (
    conn: TelegramConn,
    msgText: string,
    list: typeof mediaList,
    singleB64: string,
    singleType: "photo" | "video" | null
  ): Promise<{
    ok: boolean;
    error?: string;
    chat_title?: string;
    media_count?: number;
    message_id?: string;
  }> => {
    const baseUrl = `https://api.telegram.org/bot${conn.bot_token}`;

    // Pilih item utk upload
    const items: Array<{ base64: string; type: "photo" | "video"; name: string }> =
      list.length > 0
        ? list
        : singleB64
        ? [{ base64: singleB64, type: singleType || "photo", name: "media" }]
        : [];

    let endpoint: string;
    const formData = new FormData();
    formData.append("chat_id", conn.chat_id);

    if (items.length === 0) {
      endpoint = "sendMessage";
      formData.append("text", msgText);
      formData.append("parse_mode", "HTML");
    } else if (items.length === 1) {
      const it = items[0];
      const file = dataURLtoBlob(it.base64);
      if (!file) return { ok: false, error: "Format media tidak valid" };
      endpoint = it.type === "video" ? "sendVideo" : "sendPhoto";
      const fieldName = it.type === "video" ? "video" : "photo";
      formData.append(fieldName, file.blob, `${it.name}.${file.ext}`);
      if (msgText) {
        formData.append("caption", msgText);
        formData.append("parse_mode", "HTML");
      }
      if (it.type === "video") formData.append("supports_streaming", "true");
    } else {
      endpoint = "sendMediaGroup";
      const mediaArray: Array<{
        type: string;
        media: string;
        caption?: string;
        parse_mode?: string;
        supports_streaming?: boolean;
      }> = [];
      items.forEach((it, idx) => {
        const file = dataURLtoBlob(it.base64);
        if (!file) return;
        const attachKey = `file${idx}`;
        formData.append(attachKey, file.blob, `${it.name}.${file.ext}`);
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
        if (it.type === "video") item.supports_streaming = true;
        if (idx === 0 && msgText) {
          item.caption = msgText;
          item.parse_mode = "HTML";
        }
        mediaArray.push(item);
      });
      formData.append("media", JSON.stringify(mediaArray));
    }

    try {
      const res = await fetch(`${baseUrl}/${endpoint}`, {
        method: "POST",
        body: formData,
      });
      const j = await res.json();
      if (!j.ok) {
        return { ok: false, error: j.description || "Telegram error" };
      }
      const msgId = Array.isArray(j.result)
        ? j.result[0]?.message_id?.toString()
        : j.result?.message_id?.toString();

      // Log ke social_posts (small JSON, gak kena limit Vercel)
      const mediaCount = items.length;
      const mediaTypeLog =
        mediaCount > 1
          ? `album-${mediaCount}`
          : mediaCount === 1
          ? items[0].type
          : null;
      try {
        await supabase.from("social_posts").insert({
          platform: "Telegram",
          posted_by: myName,
          target_owner: conn.owner_name,
          content: msgText || "",
          media_type: mediaTypeLog,
          external_id: msgId,
          status: "posted",
        });
      } catch {}

      return {
        ok: true,
        chat_title: conn.chat_title,
        media_count: mediaCount,
        message_id: msgId,
      };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "network error",
      };
    }
  };

  // Twitter actions
  const connectTwitter = () => {
    window.location.href = `/api/twitter/auth?owner=${encodeURIComponent(owner)}`;
  };
  const disconnectTw = async (conn: TwitterConn) => {
    if (!confirm(`Putuskan Twitter @${conn.twitter_username}?`)) return;
    await supabase.from("twitter_connections").delete().eq("id", conn.id);
    logAs(session, "Disconnect Twitter", "Auto Post", `@${conn.twitter_username}`);
    toast("Twitter diputuskan");
    load();
  };

  // Telegram actions
  const saveTelegramConn = async () => {
    if (!tgForm.owner) return toast("Pemegang wajib", true);
    if (!tgForm.chat_id.trim()) return toast("Chat ID / Channel wajib", true);
    if (!tgForm.bot_token.trim()) return toast("Bot Token wajib untuk grup ini", true);

    const tokenToUse = tgForm.bot_token.trim();

    // Validasi bot token dengan getMe + cek apakah bot udah member di chat
    let botUsername = "";
    try {
      const res = await fetch(`https://api.telegram.org/bot${tokenToUse}/getMe`);
      const j = await res.json();
      if (!j.ok) return toast(`Bot Token invalid: ${j.description}`, true);
      botUsername = j.result?.username || "";
    } catch {
      return toast("Tidak bisa verifikasi Bot Token", true);
    }

    // Validasi chat_id + cek apakah bot udah member di chat
    try {
      const chatTest = await fetch(
        `https://api.telegram.org/bot${tokenToUse}/getChat?chat_id=${encodeURIComponent(
          tgForm.chat_id.trim()
        )}`
      );
      const j = await chatTest.json();
      if (!j.ok) {
        return toast(
          `Bot ${botUsername ? `@${botUsername}` : ""} tidak bisa akses chat: ${
            j.description
          }. Invite dulu @${botUsername} ke grup/channel ini.`,
          true
        );
      }
      // Sekalian test send untuk pastikan bot bener-bener bisa kirim
      const sendTest = await fetch(
        `https://api.telegram.org/bot${tokenToUse}/sendChatAction`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: tgForm.chat_id.trim(),
            action: "typing",
          }),
        }
      );
      const sendJson = await sendTest.json();
      if (!sendJson.ok) {
        return toast(
          `Bot @${botUsername} belum jadi member chat ini. Invite dulu sebagai admin/member, lalu coba lagi.`,
          true
        );
      }
    } catch {
      toast("Warning: tidak bisa validate chat_id, tetap disimpan", false);
    }

    const { error } = await supabase.from("telegram_connections").insert({
      owner_name: tgForm.owner,
      bot_token: tokenToUse,
      chat_id: tgForm.chat_id.trim(),
      chat_title: tgForm.chat_title.trim() || tgForm.chat_id.trim(),
    });
    if (error) return toast(error.message, true);

    logAs(session, "Connect Telegram", "Auto Post", tgForm.chat_title || tgForm.chat_id);
    toast("Channel Telegram ditambahkan!");
    setShowTgSetup(false);
    setTgForm({ owner: myName, bot_token: "", chat_id: "", chat_title: "" });
    load();
  };

  const disconnectTg = async (conn: TelegramConn) => {
    if (!confirm(`Putuskan Telegram ${conn.chat_title}?`)) return;
    await supabase.from("telegram_connections").delete().eq("id", conn.id);
    logAs(session, "Disconnect Telegram", "Auto Post", conn.chat_title);
    toast("Telegram diputuskan");
    load();
  };

  // Post
  const postNow = async () => {
    const hasMedia = mediaBase64 || mediaList.length > 0;
    if (!text.trim() && !hasMedia) return toast("Text atau media wajib", true);

    setPosting(true);
    try {
      if (tab === "twitter") {
        if (text.length > 280) return toast("Melebihi 280 karakter", true);
        const availConns = isMember ? twConns : twConns.filter((c) => c.owner_name === owner);
        if (availConns.length === 0) {
          return toast("Akun Twitter belum terhubung", true);
        }
        const chosen =
          availConns.find((c) => c.id === selectedConnId) || availConns[0];
        const res = await fetch("/api/twitter/tweet", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text,
            owner,
            posted_by: myName,
            connection_id: chosen.id,
            media_base64: mediaBase64 || undefined,
          }),
        });
        const j = await res.json();
        if (!res.ok) {
          toast(`Gagal: ${j.error || "error"}`, true);
        } else {
          logAs(session, "Post Tweet", "Auto Post", text.slice(0, 80));
          toast("Tweet terkirim!");
          setText("");
          clearMedia();
          load();
        }
      } else if (tab === "telegram") {
        const availConns = isMember ? tgConns : tgConns.filter((c) => c.owner_name === owner);
        if (availConns.length === 0) {
          return toast("Akun Telegram belum terhubung", true);
        }
        const chosen =
          availConns.find((c) => c.id === selectedConnId) || availConns[0];

        // Hitung total ukuran media (rough estimate dari base64)
        const totalSize = mediaList.reduce((s, m) => s + m.base64.length * 0.75, 0) +
          (mediaBase64 ? mediaBase64.length * 0.75 : 0);
        const useDirectUpload = totalSize > 3 * 1024 * 1024; // > 3MB → bypass Vercel

        let result;
        if (useDirectUpload) {
          // === DIRECT upload ke Telegram (bypass Vercel) ===
          result = await sendDirectToTelegram(chosen, text, mediaList, mediaBase64, mediaType);
        } else {
          // === Via API route (untuk text/foto kecil — log otomatis) ===
          const res = await fetch("/api/telegram/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              connection_id: chosen.id,
              text,
              media_list: mediaList.length > 0 ? mediaList : undefined,
              media_base64: mediaList.length === 0 && mediaBase64 ? mediaBase64 : undefined,
              media_type: mediaList.length === 0 ? mediaType : undefined,
              posted_by: myName,
            }),
          });
          const txt = await res.text();
          let j: { error?: string; chat_title?: string; media_count?: number } = {};
          try { j = JSON.parse(txt); } catch { j = { error: txt.slice(0, 100) }; }
          result = { ok: res.ok, error: j.error, chat_title: j.chat_title, media_count: j.media_count };
        }

        if (!result.ok) {
          toast(`Gagal: ${result.error || "error"}`, true);
        } else {
          logAs(session, "Post Telegram", "Auto Post", text.slice(0, 80));
          toast(
            `Terkirim ke ${result.chat_title || "Telegram"}!${
              (result.media_count || 0) > 1 ? ` (${result.media_count} media)` : ""
            }`
          );
          setText("");
          clearMedia();
          load();
        }
      }
    } catch (e) {
      toast(`Error: ${e instanceof Error ? e.message : "unknown"}`, true);
    } finally {
      setPosting(false);
    }
  };

  // ============ BULK POST ============
  // Group available connections menjadi 4 bucket: Post 1 (45), Post 2 (45), Post 3 (45), Short (15)
  type PostGroup = { name: string; size: number; accounts: (TwitterConn | TelegramConn)[] };
  const buildGroups = (conns: (TwitterConn | TelegramConn)[]): PostGroup[] => {
    const groups: PostGroup[] = [
      { name: "Post 1", size: 45, accounts: [] },
      { name: "Post 2", size: 45, accounts: [] },
      { name: "Post 3", size: 45, accounts: [] },
      { name: "Post Short", size: 15, accounts: [] },
    ];
    let idx = 0;
    for (const g of groups) {
      g.accounts = conns.slice(idx, idx + g.size);
      idx += g.size;
    }
    return groups;
  };

  // Fire bulk post: post text/media yang sudah di-compose ke semua akun di grup,
  // sequential dengan delay untuk hindari rate limit.
  const bulkPost = async (group: PostGroup) => {
    const hasMedia = mediaBase64 || mediaList.length > 0;
    if (!text.trim() && !hasMedia) return toast("Text atau media wajib", true);
    if (group.accounts.length === 0)
      return toast(`${group.name} belum ada akun terhubung`, true);
    if (
      !confirm(
        `Yakin kirim ke ${group.accounts.length} akun di "${group.name}"?\nTeks akan di-post ke semua akun secara berurutan.`
      )
    )
      return;

    setBulkPosting({
      group: group.name,
      done: 0,
      total: group.accounts.length,
      success: 0,
      failed: 0,
      currentAccount: "",
      errors: [],
      successLinks: [],
    });

    let done = 0,
      success = 0,
      failed = 0;
    const errors: string[] = [];
    const successLinks: Array<{ account: string; url: string }> = [];

    for (const conn of group.accounts) {
      const username =
        tab === "twitter"
          ? `@${(conn as TwitterConn).twitter_username}`
          : (conn as TelegramConn).chat_title;

      setBulkPosting((p) =>
        p ? { ...p, currentAccount: username, done } : null
      );

      try {
        if (tab === "twitter") {
          const res = await fetch("/api/twitter/tweet", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text,
              owner: (conn as TwitterConn).owner_name,
              posted_by: myName,
              connection_id: conn.id,
              media_base64: mediaBase64 || undefined,
              post_group: group.name,
            }),
          });
          const j = await res.json();
          if (res.ok) {
            success++;
            if (j.url) successLinks.push({ account: username, url: j.url });
          } else {
            failed++;
            errors.push(`${username}: ${j.error || "error"}`);
          }
        } else {
          // Telegram
          const tgConn = conn as TelegramConn;
          const totalSize =
            mediaList.reduce((s, m) => s + m.base64.length * 0.75, 0) +
            (mediaBase64 ? mediaBase64.length * 0.75 : 0);
          const useDirectUpload = totalSize > 3 * 1024 * 1024;
          let result: { ok: boolean; error?: string };
          if (useDirectUpload) {
            const r = await sendDirectToTelegram(
              tgConn,
              text,
              mediaList,
              mediaBase64,
              mediaType
            );
            result = { ok: r.ok, error: r.error };
          } else {
            const res = await fetch("/api/telegram/send", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                connection_id: tgConn.id,
                text,
                media_list: mediaList.length > 0 ? mediaList : undefined,
                media_base64:
                  mediaList.length === 0 && mediaBase64 ? mediaBase64 : undefined,
                media_type: mediaList.length === 0 ? mediaType : undefined,
                posted_by: myName,
                post_group: group.name,
              }),
            });
            const j = await res.json().catch(() => ({}));
            result = { ok: res.ok, error: j.error };
          }
          if (result.ok) {
            success++;
            // Build link for Telegram
            const chatId = tgConn.chat_id.startsWith("-100")
              ? tgConn.chat_id.slice(4)
              : tgConn.chat_id.startsWith("@")
              ? tgConn.chat_id.slice(1)
              : tgConn.chat_id;
            // Note: external_id (message_id) gak return langsung dari direct upload, skip URL untuk telegram bulk
            successLinks.push({
              account: username,
              url: chatId.match(/^\d+$/)
                ? `https://t.me/c/${chatId}`
                : `https://t.me/${chatId}`,
            });
          } else {
            failed++;
            errors.push(`${username}: ${result.error || "error"}`);
          }
        }
      } catch (e) {
        failed++;
        errors.push(`${username}: ${e instanceof Error ? e.message : "exception"}`);
      }

      done++;
      setBulkPosting((p) =>
        p ? { ...p, done, success, failed, errors, successLinks: [...successLinks] } : null
      );

      // Delay antar request — hindari rate limit
      // Twitter Basic: 100/24h per akun, 200/15min per app
      // Telegram: 30 msg/sec ke channel berbeda
      await new Promise((r) => setTimeout(r, tab === "twitter" ? 800 : 200));
    }

    logAs(
      session,
      `Bulk Post ${group.name}`,
      "Auto Post",
      `${success}/${group.accounts.length} sukses · ${failed} gagal`
    );
    toast(
      failed === 0
        ? `✅ ${group.name}: ${success} akun sukses`
        : `⚠ ${group.name}: ${success} sukses, ${failed} gagal`
    );

    if (success > 0) {
      setText("");
      clearMedia();
      load();
    }
    // Keep bulkPosting state visible so user can review errors before close
  };

  // Save scheduled post (akan fire pas waktu yg di-set)
  const saveScheduledPost = async () => {
    const hasMedia =
      mediaBase64 || mediaList.length > 0 || scheduleMediaUrl.trim();
    if (!text.trim() && !hasMedia) return toast("Text atau media wajib", true);
    if (!scheduleDateTime) return toast("Pilih tanggal & jam dulu", true);

    // Convert datetime-local (browser local TZ = WIB user) ke ISO timestamp
    const scheduledAt = new Date(scheduleDateTime);
    if (isNaN(scheduledAt.getTime())) return toast("Tanggal/jam invalid", true);
    if (scheduledAt.getTime() < Date.now())
      return toast("Tanggal/jam sudah lewat — pilih waktu yang akan datang", true);

    // Decide media: prioritize URL (no body limit), else base64 (must < 3MB safe)
    const mediaUrl = scheduleMediaUrl.trim() || null;
    let mediaB64: string | null = null;
    if (!mediaUrl) {
      // Pakai base64 dari compose attachment, kalau ada
      const candidate = mediaBase64 || mediaList[0]?.base64 || null;
      if (candidate) {
        // Estimate base64 size in bytes (rough)
        const sizeBytes = candidate.length * 0.75;
        if (sizeBytes > 3 * 1024 * 1024) {
          return toast(
            `Media attachment (${(sizeBytes / 1024 / 1024).toFixed(1)}MB) terlalu besar untuk schedule. Max 3MB. Untuk file lebih besar, paste URL di field 'Media URL' di bawah.`,
            true
          );
        }
        mediaB64 = candidate;
      }
    }

    if (!confirm(
      `Schedule post ke ${scheduleGroup} (${owner}) pada\n${scheduledAt.toLocaleString("id-ID")}?`
    )) return;

    setScheduling(true);
    try {
      const payload = {
        platform: tab,
        owner_name: owner,
        target_group: scheduleGroup,
        text_content: text,
        media_base64: mediaB64,
        media_url: mediaUrl,
        scheduled_at: scheduledAt.toISOString(),
        status: "pending",
        created_by: myName,
      };
      const { error } = await supabase.from("scheduled_posts").insert(payload);
      if (error) {
        toast("Gagal: " + error.message, true);
      } else {
        logAs(
          session,
          "Schedule Bulk Post",
          "Auto Post",
          `${scheduleGroup} (${owner}) untuk ${scheduledAt.toLocaleString("id-ID")}`
        );
        toast(`✅ Scheduled untuk ${scheduledAt.toLocaleString("id-ID")}`);
        setText("");
        clearMedia();
        setScheduleDateTime("");
        setScheduleMediaUrl("");
        setScheduleMode(false);
        loadScheduledPosts();
      }
    } catch (e) {
      toast(`Error: ${e instanceof Error ? e.message : "unknown"}`, true);
    } finally {
      setScheduling(false);
    }
  };

  // Pending scheduled posts list
  const [pendingSchedules, setPendingSchedules] = useState<
    Array<{
      id: number;
      target_group: string;
      text_content: string;
      scheduled_at: string;
      owner_name: string;
      platform: string;
    }>
  >([]);
  const loadScheduledPosts = async () => {
    const { data } = await supabase
      .from("scheduled_posts")
      .select("id,target_group,text_content,scheduled_at,owner_name,platform")
      .eq("status", "pending")
      .order("scheduled_at", { ascending: true });
    setPendingSchedules(data || []);
  };
  const cancelScheduled = async (id: number) => {
    if (!confirm("Batalkan scheduled post ini?")) return;
    await supabase
      .from("scheduled_posts")
      .update({ status: "cancelled" })
      .eq("id", id);
    toast("Scheduled post dibatalkan");
    loadScheduledPosts();
  };

  // Load on mount
  useEffect(() => {
    if (session?.role) loadScheduledPosts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.role]);

  const availConns =
    tab === "twitter"
      ? isMember
        ? twConns
        : twConns.filter((c) => c.owner_name === owner)
      : isMember
      ? tgConns
      : tgConns.filter((c) => c.owner_name === owner);

  useEffect(() => {
    if (availConns.length > 0 && !availConns.find((c) => c.id === selectedConnId)) {
      setSelectedConnId(availConns[0].id);
    } else if (availConns.length === 0) {
      setSelectedConnId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, twConns.length, tgConns.length, owner]);

  const charLimit = tab === "twitter" ? 280 : tab === "telegram" ? 4096 : 0;
  const charCount = text.length;
  const charColor =
    charCount > charLimit
      ? "text-brand-rose"
      : charCount > charLimit * 0.9
      ? "text-brand-amber"
      : "text-fg-500";

  const currentPlatform = PLATFORMS.find((p) => p.key === tab)!;
  const history = tab === "twitter" ? twPosts : tgPosts;

  return (
    <PageShell title="Auto Post" desc="Post otomatis ke sosial media — multi-platform">
      {/* Platform Tabs */}
      <div className="mb-5 flex gap-2 border-b border-bg-700">
        {PLATFORMS.map((p) => (
          <button
            key={p.key}
            onClick={() => setTab(p.key)}
            className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
              tab === p.key
                ? "border-current"
                : "border-transparent text-fg-500 hover:text-fg-100"
            }`}
            style={{ color: tab === p.key ? p.color : undefined }}
          >
            <span className="text-lg">{p.icon}</span>
            {p.name}
          </button>
        ))}
        <div className="ml-auto flex items-center text-[10px] text-fg-500">
          💡 FB/IG/TikTok butuh setup Meta App terpisah
        </div>
      </div>

      {/* Admin-only: Overview akun per anggota (Twitter + Telegram) */}
      {!isMember && (twConns.length > 0 || tgConns.length > 0) && (
        <div className="mb-5 rounded-xl border border-bg-700 bg-bg-800 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold text-fg-100">📱 Akun Sosmed per Anggota</h3>
            <span className="text-[10px] text-fg-500">
              {twConns.length} Twitter · {tgConns.length} Telegram total
            </span>
          </div>
          {(() => {
            // Group connections by owner_name
            const byOwner: Record<
              string,
              { twitter: TwitterConn[]; telegram: TelegramConn[] }
            > = {};
            twConns.forEach((c) => {
              byOwner[c.owner_name] = byOwner[c.owner_name] || { twitter: [], telegram: [] };
              byOwner[c.owner_name].twitter.push(c);
            });
            tgConns.forEach((c) => {
              byOwner[c.owner_name] = byOwner[c.owner_name] || { twitter: [], telegram: [] };
              byOwner[c.owner_name].telegram.push(c);
            });
            const owners = Object.keys(byOwner).sort((a, b) => {
              // Admin first, then alphabetic
              if (a === "admin") return -1;
              if (b === "admin") return 1;
              return a.localeCompare(b);
            });
            if (owners.length === 0) {
              return (
                <div className="py-3 text-center text-xs text-fg-500">
                  Belum ada anggota yang connect akun
                </div>
              );
            }
            const memberInfo = (name: string) => team.find((t) => t.name === name);
            return (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {owners.map((name) => {
                  const data = byOwner[name];
                  const m = memberInfo(name);
                  const color = m?.color || (name === "admin" ? "#38bdf8" : "#64748b");
                  const isSelected = owner === name;
                  return (
                    <button
                      key={name}
                      onClick={() => setOwner(name)}
                      className={`group rounded-lg border p-2.5 text-left transition ${
                        isSelected
                          ? "border-brand-sky bg-brand-sky/5"
                          : "border-bg-700 bg-bg-900 hover:border-bg-600"
                      }`}
                      title={`Klik untuk filter ke ${name}`}
                    >
                      <div className="mb-2 flex items-center gap-2">
                        <span
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-[10px] font-bold text-white"
                          style={{ backgroundColor: color }}
                        >
                          {name === "admin" ? "A" : (m ? initials(name) : name[0]?.toUpperCase() || "?")}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="truncate text-xs font-bold text-fg-100">{name}</div>
                          <div className="truncate text-[10px] text-fg-500">
                            {m?.role || (name === "admin" ? "Administrator" : "Anggota")}
                          </div>
                        </div>
                        {isSelected && (
                          <span className="text-[10px] font-bold text-brand-sky">✓</span>
                        )}
                      </div>

                      {/* Twitter accounts */}
                      {data.twitter.length > 0 && (
                        <div className="mb-1.5">
                          <div className="mb-1 flex items-center gap-1 text-[10px] text-fg-500">
                            <span style={{ color: "#1DA1F2" }}>𝕏</span>
                            <span className="font-semibold">
                              Twitter ({data.twitter.length})
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {data.twitter.slice(0, 5).map((c) => (
                              <span
                                key={c.id}
                                className="rounded bg-bg-700 px-1.5 py-0.5 text-[10px] text-fg-300"
                              >
                                @{c.twitter_username}
                              </span>
                            ))}
                            {data.twitter.length > 5 && (
                              <span className="text-[10px] text-fg-500">
                                +{data.twitter.length - 5} lainnya
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Telegram channels */}
                      {data.telegram.length > 0 && (
                        <div>
                          <div className="mb-1 flex items-center gap-1 text-[10px] text-fg-500">
                            <span style={{ color: "#229ED9" }}>✈</span>
                            <span className="font-semibold">
                              Telegram ({data.telegram.length})
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {data.telegram.slice(0, 3).map((c) => (
                              <span
                                key={c.id}
                                className="rounded bg-bg-700 px-1.5 py-0.5 text-[10px] text-fg-300"
                              >
                                {c.chat_title || c.chat_id}
                              </span>
                            ))}
                            {data.telegram.length > 3 && (
                              <span className="text-[10px] text-fg-500">
                                +{data.telegram.length - 3} lainnya
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                      {data.twitter.length === 0 && data.telegram.length === 0 && (
                        <div className="py-1 text-[10px] italic text-fg-600">
                          Belum ada akun
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })()}

          {/* Anggota yang BELUM punya akun apapun (admin perlu tau) */}
          {(() => {
            const ownersWithAccounts = new Set([
              ...twConns.map((c) => c.owner_name),
              ...tgConns.map((c) => c.owner_name),
            ]);
            const membersWithoutAny = team.filter(
              (t) => !ownersWithAccounts.has(t.name)
            );
            if (membersWithoutAny.length === 0) return null;
            return (
              <div className="mt-3 border-t border-bg-700 pt-3">
                <div className="mb-1.5 text-[10px] text-fg-500">
                  ⚠ Anggota belum connect akun ({membersWithoutAny.length}):
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {membersWithoutAny.map((m) => (
                    <span
                      key={m.username}
                      className="flex items-center gap-1 rounded bg-bg-900 px-2 py-0.5 text-[10px] text-fg-400"
                    >
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: m.color }}
                      />
                      {m.name}
                    </span>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Connected Accounts Section */}
      <div className="mb-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-bold text-fg-100">
            {tab === "twitter" ? "Akun Twitter Terhubung" : "Channel Telegram Terhubung"} (
            {availConns.length})
          </h3>
          {tab === "twitter" ? (
            <button
              onClick={connectTwitter}
              className="rounded-lg px-4 py-2 text-sm font-bold text-white hover:opacity-90"
              style={{ backgroundColor: currentPlatform.color }}
            >
              🐦 {isMember ? "Connect Twitter Kamu" : `Connect Twitter untuk ${owner}`}
            </button>
          ) : (
            <button
              onClick={() => setShowTgSetup(!showTgSetup)}
              className="rounded-lg px-4 py-2 text-sm font-bold text-white hover:opacity-90"
              style={{ backgroundColor: currentPlatform.color }}
            >
              ✈ Tambah Channel Telegram
            </button>
          )}
        </div>

        {/* Telegram setup form */}
        {tab === "telegram" && showTgSetup && (
          <div className="mb-3 rounded-xl border border-sky-500/40 bg-sky-500/5 p-4">
            <div className="mb-3 rounded-lg border border-sky-500/30 bg-sky-500/5 p-3 text-xs text-fg-300">
              <strong className="text-brand-sky">📌 Setiap grup pakai bot sendiri (1 bot = 1 grup)</strong>
              <ol className="ml-5 mt-1 list-decimal text-[11px] text-fg-400">
                <li>
                  Buat bot baru di{" "}
                  <a
                    href="https://t.me/BotFather"
                    target="_blank"
                    rel="noreferrer"
                    className="text-brand-sky hover:underline"
                  >
                    @BotFather
                  </a>{" "}
                  → /newbot → dapat <strong>Bot Token</strong> baru
                </li>
                <li>
                  <strong>Invite bot itu ke grup/channel target</strong> (member kalau grup, admin
                  kalau channel)
                </li>
                <li>
                  Cari Chat ID grup: pakai <code>@channelusername</code> kalau public, atau{" "}
                  <code className="rounded bg-bg-800 px-1">getUpdates</code> untuk private group
                </li>
                <li>Paste Bot Token + Chat ID di form bawah → Save</li>
              </ol>
              <div className="mt-2 rounded bg-amber-500/10 px-2 py-1 text-[10px] text-brand-amber">
                ⚠ Sistem akan auto-validate: bot harus sudah jadi member grup, kalau belum →
                error jelas dengan instruksi
              </div>
            </div>

            <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-2">
              <input
                className="rounded-lg border border-bg-700 bg-bg-900 px-3 py-2 text-sm text-fg-100 outline-none focus:border-brand-sky"
                placeholder="Pemegang (anggota)"
                value={tgForm.owner}
                disabled={isMember}
                onChange={(e) => setTgForm({ ...tgForm, owner: e.target.value })}
              />
              <input
                className="rounded-lg border border-bg-700 bg-bg-900 px-3 py-2 text-sm text-fg-100 outline-none focus:border-brand-sky"
                placeholder="Nama channel (bebas, buat label)"
                value={tgForm.chat_title}
                onChange={(e) => setTgForm({ ...tgForm, chat_title: e.target.value })}
              />
              <input
                className="rounded-lg border border-brand-sky bg-bg-900 px-3 py-2 text-sm text-fg-100 outline-none focus:border-brand-sky md:col-span-2"
                placeholder="🤖 Bot Token (wajib) — 123456:ABC-DEF..."
                value={tgForm.bot_token}
                onChange={(e) => setTgForm({ ...tgForm, bot_token: e.target.value })}
              />
              <input
                className="rounded-lg border border-bg-700 bg-bg-900 px-3 py-2 text-sm text-fg-100 outline-none focus:border-brand-sky md:col-span-2"
                placeholder="Chat ID (mis: -1001234567890) atau @channelusername"
                value={tgForm.chat_id}
                onChange={(e) => setTgForm({ ...tgForm, chat_id: e.target.value })}
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowTgSetup(false)}
                className="rounded-lg border border-bg-700 px-4 py-2 text-xs text-fg-400"
              >
                Batal
              </button>
              <button
                onClick={saveTelegramConn}
                className="rounded-lg bg-[#229ED9] px-6 py-2 text-xs font-bold text-white"
              >
                Simpan Koneksi
              </button>
            </div>
          </div>
        )}

        {availConns.length === 0 ? (
          <div className="rounded-xl border border-bg-700 bg-bg-800 p-6 text-center">
            <div className="mb-2 text-4xl opacity-50">{currentPlatform.icon}</div>
            <div className="text-sm text-fg-500">
              Belum ada {currentPlatform.name} terhubung
            </div>
          </div>
        ) : (
          <>
            {/* Search bar — selalu tampil kalau >5 akun untuk hindari scroll panjang */}
            {availConns.length > 5 && (
              <div className="mb-2 flex items-center gap-2">
                <div className="relative flex-1">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-500">
                    🔍
                  </span>
                  <input
                    type="text"
                    value={connSearch}
                    onChange={(e) => setConnSearch(e.target.value)}
                    placeholder={
                      tab === "twitter"
                        ? "Cari @username..."
                        : "Cari channel/chat..."
                    }
                    className="w-full rounded-lg border border-bg-700 bg-bg-900 py-1.5 pl-9 pr-8 text-xs text-fg-100 outline-none focus:border-brand-sky"
                  />
                  {connSearch && (
                    <button
                      onClick={() => setConnSearch("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-fg-500 hover:text-fg-100"
                      title="Bersihkan"
                    >
                      ✕
                    </button>
                  )}
                </div>
                {(() => {
                  const q = connSearch.trim().toLowerCase();
                  const filteredCount =
                    tab === "twitter"
                      ? (availConns as TwitterConn[]).filter(
                          (c) =>
                            !q ||
                            (c.twitter_username || "").toLowerCase().includes(q) ||
                            (c.owner_name || "").toLowerCase().includes(q)
                        ).length
                      : (availConns as TelegramConn[]).filter(
                          (c) =>
                            !q ||
                            (c.chat_title || "").toLowerCase().includes(q) ||
                            (c.chat_id || "").toLowerCase().includes(q) ||
                            (c.owner_name || "").toLowerCase().includes(q)
                        ).length;
                  return (
                    <span className="rounded bg-bg-900 border border-bg-700 px-2 py-1 text-[10px] text-fg-400">
                      {connSearch ? `${filteredCount}/${availConns.length}` : availConns.length}
                    </span>
                  );
                })()}
              </div>
            )}

            {/* Grid compact dengan internal scroll — page tidak ikut panjang */}
            <div
              className="overflow-y-auto rounded-lg border border-bg-700 bg-bg-900/40 p-2"
              style={{ maxHeight: "50vh" }}
            >
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {tab === "twitter" &&
                  (availConns as TwitterConn[])
                    .filter((c) => {
                      const q = connSearch.trim().toLowerCase();
                      if (!q) return true;
                      return (
                        (c.twitter_username || "").toLowerCase().includes(q) ||
                        (c.owner_name || "").toLowerCase().includes(q)
                      );
                    })
                    .map((c) => (
                      <div
                        key={c.id}
                        className={`group flex items-center gap-2 rounded-lg border p-2 transition ${
                          selectedConnId === c.id
                            ? "border-brand-sky bg-brand-sky/5"
                            : "border-bg-700 bg-bg-800 hover:border-bg-600"
                        }`}
                      >
                        <button
                          onClick={() => setSelectedConnId(c.id)}
                          className="flex flex-1 items-center gap-2 text-left min-w-0"
                          title={`Pilih @${c.twitter_username}`}
                        >
                          <div
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                            style={{ backgroundColor: currentPlatform.color }}
                          >
                            𝕏
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-xs font-bold text-fg-100">
                              @{c.twitter_username || "unknown"}
                            </div>
                            <div className="truncate text-[9px] uppercase tracking-wide text-fg-500">
                              {c.owner_name}
                            </div>
                          </div>
                        </button>
                        <button
                          onClick={() => disconnectTw(c)}
                          className="rounded bg-red-950/50 px-2 py-1 text-[10px] font-semibold text-brand-rose opacity-60 hover:opacity-100"
                          title="Disconnect"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                {tab === "telegram" &&
                  (availConns as TelegramConn[])
                    .filter((c) => {
                      const q = connSearch.trim().toLowerCase();
                      if (!q) return true;
                      return (
                        (c.chat_title || "").toLowerCase().includes(q) ||
                        (c.chat_id || "").toLowerCase().includes(q) ||
                        (c.owner_name || "").toLowerCase().includes(q)
                      );
                    })
                    .map((c) => (
                      <div
                        key={c.id}
                        className={`group flex items-center gap-2 rounded-lg border p-2 transition ${
                          selectedConnId === c.id
                            ? "border-brand-sky bg-brand-sky/5"
                            : "border-bg-700 bg-bg-800 hover:border-bg-600"
                        }`}
                      >
                        <button
                          onClick={() => setSelectedConnId(c.id)}
                          className="flex flex-1 items-center gap-2 text-left min-w-0"
                          title={`Pilih ${c.chat_title}`}
                        >
                          <div
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-base text-white"
                            style={{ backgroundColor: currentPlatform.color }}
                          >
                            ✈
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-xs font-bold text-fg-100">
                              {c.chat_title}
                            </div>
                            <div className="truncate text-[9px] text-fg-500">
                              {c.owner_name} · {c.chat_id}
                            </div>
                          </div>
                        </button>
                        <button
                          onClick={() => disconnectTg(c)}
                          className="rounded bg-red-950/50 px-2 py-1 text-[10px] font-semibold text-brand-rose opacity-60 hover:opacity-100"
                          title="Disconnect"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Compose */}
      <div className="mb-6 rounded-xl border border-bg-700 bg-bg-800 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-bold text-fg-100">
            ✍ Compose {currentPlatform.name}
          </h3>
          {!isMember && availConns.length > 0 && (
            <select
              className="rounded-lg border border-bg-700 bg-bg-900 px-3 py-1.5 text-xs"
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
            >
              <option value="admin">admin</option>
              {Array.from(new Set(availConns.map((c) => c.owner_name))).map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Bulk Post Groups: Post 1 (45) · Post 2 (45) · Post 3 (45) · Short (15) */}
        {availConns.length > 0 && (
          <div className="mb-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-fg-500">
                📢 Bulk Post — kirim sekaligus ke banyak akun
              </span>
              <span className="text-[10px] text-fg-500">
                {availConns.length} akun terhubung
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {buildGroups(availConns).map((g) => {
                const filled = g.accounts.length;
                const isShort = g.name === "Post Short";
                const disabled = filled === 0 || posting || !!bulkPosting;
                return (
                  <button
                    key={g.name}
                    onClick={() => bulkPost(g)}
                    disabled={disabled}
                    className={`flex flex-col items-center justify-center rounded-lg border-2 px-3 py-3 transition ${
                      disabled
                        ? "border-bg-700 bg-bg-900 text-fg-600 opacity-50 cursor-not-allowed"
                        : isShort
                        ? "border-amber-500/40 bg-amber-500/5 text-brand-amber hover:bg-amber-500/15"
                        : "border-bg-700 bg-bg-800 text-fg-200 hover:border-current hover:text-fg-100"
                    }`}
                    style={{
                      color: !disabled && !isShort ? currentPlatform.color : undefined,
                    }}
                    title={
                      filled > 0
                        ? `Kirim ke ${filled} akun di ${g.name}`
                        : `${g.name} belum ada akun terhubung (slot 0/${g.size})`
                    }
                  >
                    <span className="text-sm font-bold">
                      {isShort && "⚡ "}
                      {g.name}
                    </span>
                    <span className="text-[10px] opacity-80">
                      {filled}/{g.size} akun
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Bulk progress modal */}
        {bulkPosting && (
          <div className="mb-3 rounded-lg border-2 border-brand-sky bg-brand-sky/5 p-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {bulkPosting.done < bulkPosting.total && (
                  <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-brand-sky border-t-transparent" />
                )}
                <span className="text-sm font-bold text-brand-sky">
                  {bulkPosting.group}: {bulkPosting.done}/{bulkPosting.total}
                </span>
              </div>
              {bulkPosting.done === bulkPosting.total && (
                <button
                  onClick={() => setBulkPosting(null)}
                  className="rounded bg-bg-700 px-2 py-0.5 text-[10px] hover:bg-bg-600"
                >
                  ✕ Tutup
                </button>
              )}
            </div>

            <div className="mb-2 h-2 overflow-hidden rounded-full bg-bg-700">
              <div
                className="h-full bg-brand-sky transition-all"
                style={{
                  width: `${(bulkPosting.done / bulkPosting.total) * 100}%`,
                }}
              />
            </div>

            <div className="flex flex-wrap gap-3 text-xs">
              <span className="text-brand-emerald">✅ {bulkPosting.success} sukses</span>
              {bulkPosting.failed > 0 && (
                <span className="text-brand-rose">❌ {bulkPosting.failed} gagal</span>
              )}
              {bulkPosting.currentAccount && bulkPosting.done < bulkPosting.total && (
                <span className="text-fg-400">
                  → {bulkPosting.currentAccount}
                </span>
              )}
            </div>

            {/* Success links — copy all + per-link copy */}
            {bulkPosting.done === bulkPosting.total && bulkPosting.successLinks.length > 0 && (
              <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-2">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[11px] font-bold text-brand-emerald">
                    🔗 {bulkPosting.successLinks.length} Link Hasil Post
                  </span>
                  <div className="flex gap-1">
                    <button
                      onClick={() => {
                        const text = bulkPosting.successLinks.map((l) => l.url).join("\n");
                        navigator.clipboard.writeText(text);
                        toast(`✅ ${bulkPosting.successLinks.length} link di-copy ke clipboard`);
                      }}
                      className="rounded bg-brand-emerald px-2 py-1 text-[10px] font-bold text-bg-900 hover:opacity-90"
                    >
                      📋 Copy Semua URL
                    </button>
                    <button
                      onClick={() => {
                        const text = bulkPosting.successLinks
                          .map((l) => `${l.account}: ${l.url}`)
                          .join("\n");
                        navigator.clipboard.writeText(text);
                        toast(`✅ ${bulkPosting.successLinks.length} link + akun di-copy`);
                      }}
                      className="rounded bg-bg-700 px-2 py-1 text-[10px] font-bold text-fg-200 hover:bg-bg-600"
                    >
                      📋 Copy + Akun
                    </button>
                  </div>
                </div>
                <div className="max-h-48 overflow-y-auto rounded bg-bg-900 p-2 font-mono text-[10px]">
                  {bulkPosting.successLinks.map((l, i) => (
                    <div key={i} className="flex items-center gap-2 py-0.5">
                      <span className="text-fg-500 w-32 shrink-0 truncate">{l.account}</span>
                      <a
                        href={l.url}
                        target="_blank"
                        rel="noreferrer"
                        className="truncate text-brand-sky hover:underline flex-1"
                      >
                        {l.url}
                      </a>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(l.url);
                          toast("Link di-copy");
                        }}
                        className="text-fg-400 hover:text-fg-100"
                        title="Copy link ini"
                      >
                        📋
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {bulkPosting.errors.length > 0 && bulkPosting.done === bulkPosting.total && (
              <details className="mt-2 text-[11px]">
                <summary className="cursor-pointer text-brand-rose">
                  Lihat {bulkPosting.errors.length} error
                </summary>
                <div className="mt-1 max-h-32 overflow-y-auto rounded bg-bg-900 p-2 font-mono text-[10px] text-fg-400">
                  {bulkPosting.errors.map((e, i) => (
                    <div key={i} className="truncate">
                      {e}
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}

        {/* Single account select (untuk single post — backup mode) */}
        {availConns.length > 1 && (
          <div className="mb-3">
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-fg-500">
              Atau pilih satu akun untuk single post:
            </div>
            <div className="flex flex-wrap gap-1.5">
              {availConns.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedConnId(c.id)}
                  className={`rounded-md border px-2 py-1 text-[10px] transition ${
                    selectedConnId === c.id
                      ? "border-current"
                      : "border-bg-700 bg-bg-900 text-fg-500"
                  }`}
                  style={{
                    color: selectedConnId === c.id ? currentPlatform.color : undefined,
                  }}
                >
                  {tab === "twitter"
                    ? `@${(c as TwitterConn).twitter_username}`
                    : (c as TelegramConn).chat_title}
                </button>
              ))}
            </div>
          </div>
        )}

        <textarea
          className="w-full rounded-lg border border-bg-700 bg-bg-900 p-4 text-sm text-fg-100 outline-none focus:border-brand-sky"
          rows={5}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={
            tab === "twitter"
              ? "Apa yang kamu pikirkan? (max 280)..."
              : "Tulis pesan Telegram... (HTML tags diizinkan: <b>, <i>, <a href>)"
          }
        />

        {/* Media upload */}
        <div className="mt-3 flex items-center gap-2">
          <label className="cursor-pointer rounded-lg border border-bg-700 bg-bg-900 px-3 py-1.5 text-xs text-fg-400 hover:border-brand-sky hover:text-fg-100">
            📎 Attach Media{tab === "telegram" ? " (multi)" : ""}
            <input
              type="file"
              accept="image/*,video/*"
              className="hidden"
              multiple={tab === "telegram"}
              onChange={onMediaChange}
            />
          </label>
          {tab === "telegram" && mediaList.length > 0 && (
            <>
              <span className="text-[11px] text-brand-emerald">
                ✓ {mediaList.length} media siap dikirim
                {mediaList.length >= 10 && " (max)"}
              </span>
              <button
                onClick={clearMedia}
                className="text-[11px] text-brand-rose hover:underline"
              >
                Hapus semua
              </button>
            </>
          )}
          {tab === "twitter" && mediaBase64 && (
            <>
              <span className="text-[11px] text-brand-emerald">
                ✓ {mediaType === "video" ? "Video" : "Gambar"} siap dikirim
              </span>
              <button
                onClick={clearMedia}
                className="text-[11px] text-brand-rose hover:underline"
              >
                Hapus
              </button>
            </>
          )}
        </div>

        {/* Multi-media preview grid (Telegram) */}
        {tab === "telegram" && mediaList.length > 0 && (
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {mediaList.map((m, idx) => (
              <div
                key={idx}
                className="group relative overflow-hidden rounded-lg border border-bg-700 bg-bg-900"
              >
                {m.type === "photo" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={m.base64}
                    alt={m.name}
                    className="h-24 w-full object-cover"
                  />
                ) : (
                  <video
                    src={m.base64}
                    className="h-24 w-full object-cover"
                  />
                )}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-1">
                  <div className="truncate text-[9px] text-white">
                    {m.type === "video" ? "🎬" : "🖼"} {m.name}
                  </div>
                </div>
                <button
                  onClick={() => removeMediaAt(idx)}
                  className="absolute right-1 top-1 rounded-full bg-red-600/90 px-1.5 py-0.5 text-[9px] font-bold text-white opacity-0 transition group-hover:opacity-100"
                  title="Hapus media"
                >
                  ✕
                </button>
                <div className="absolute left-1 top-1 rounded bg-black/60 px-1 text-[9px] font-bold text-white">
                  {idx + 1}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Single media preview (Twitter) */}
        {tab === "twitter" && mediaBase64 && mediaType === "photo" && (
          <div className="mt-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={mediaBase64}
              alt="preview"
              className="max-h-48 rounded-lg border border-bg-700"
            />
          </div>
        )}
        {tab === "twitter" && mediaBase64 && mediaType === "video" && (
          <div className="mt-2">
            <video
              src={mediaBase64}
              controls
              className="max-h-48 rounded-lg border border-bg-700"
            />
          </div>
        )}

        <div className="mt-3 flex items-center justify-between">
          <span className={`text-xs font-semibold ${charColor}`}>
            {charCount}/{charLimit} karakter
          </span>
          <div className="flex items-center gap-2">
            {/* Toggle Schedule mode */}
            <button
              onClick={() => setScheduleMode(!scheduleMode)}
              className={`rounded-full px-3 py-2 text-xs font-semibold transition ${
                scheduleMode
                  ? "bg-brand-amber text-bg-900"
                  : "border border-bg-700 bg-bg-900 text-fg-300 hover:border-brand-amber"
              }`}
              title="Jadwalkan post untuk fire otomatis pada waktu tertentu"
            >
              📅 Jadwalkan
            </button>
            <button
              onClick={postNow}
              disabled={
                posting ||
                scheduleMode ||
                (!text.trim() && !mediaBase64 && mediaList.length === 0) ||
                (tab === "twitter" && text.length > 280) ||
                availConns.length === 0
              }
              className="rounded-full px-6 py-2 text-sm font-bold text-white hover:opacity-90 disabled:opacity-40"
              style={{ backgroundColor: currentPlatform.color }}
            >
              {posting ? "Posting..." : `🚀 Post ke ${currentPlatform.name}`}
            </button>
          </div>
        </div>

        {/* Schedule form (toggle ON) */}
        {scheduleMode && (
          <div className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-sm font-bold text-brand-amber">
                📅 Jadwalkan Bulk Post
              </span>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-fg-400">
                  Target Group
                </label>
                <select
                  className="w-full rounded-lg border border-bg-700 bg-bg-900 px-3 py-2 text-sm text-fg-100 outline-none"
                  value={scheduleGroup}
                  onChange={(e) => setScheduleGroup(e.target.value)}
                >
                  <option value="Post 1">Post 1 (45 akun)</option>
                  <option value="Post 2">Post 2 (45 akun)</option>
                  <option value="Post 3">Post 3 (45 akun)</option>
                  <option value="Post Short">Post Short (15 akun)</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-fg-400">
                  Tanggal & Jam (WIB)
                </label>
                <input
                  type="datetime-local"
                  className="w-full rounded-lg border border-bg-700 bg-bg-900 px-3 py-2 text-sm text-fg-100 outline-none"
                  value={scheduleDateTime}
                  min={new Date(Date.now() + 5 * 60_000)
                    .toISOString()
                    .slice(0, 16)}
                  onChange={(e) => setScheduleDateTime(e.target.value)}
                />
              </div>
            </div>

            {/* Media URL (alternatif untuk file > 4MB) */}
            <div className="mt-3">
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-fg-400">
                Media URL (untuk video/foto besar &gt; 4MB)
              </label>
              <input
                type="url"
                className="w-full rounded-lg border border-bg-700 bg-bg-900 px-3 py-2 text-sm text-fg-100 outline-none"
                placeholder="https://files.catbox.moe/abc.mp4 atau https://i.ibb.co/xxx/foto.jpg"
                value={scheduleMediaUrl}
                onChange={(e) => setScheduleMediaUrl(e.target.value)}
              />
              <div className="mt-1 text-[10px] text-fg-500">
                💡 Upload file besar ke{" "}
                <a
                  href="https://catbox.moe"
                  target="_blank"
                  rel="noreferrer"
                  className="text-brand-sky hover:underline"
                >
                  catbox.moe
                </a>{" "}
                (max 200MB, no signup) atau{" "}
                <a
                  href="https://imgbb.com"
                  target="_blank"
                  rel="noreferrer"
                  className="text-brand-sky hover:underline"
                >
                  imgbb.com
                </a>{" "}
                → paste direct URL di sini.{" "}
                {mediaBase64 || mediaList.length > 0 ? (
                  <span className="text-brand-amber">
                    ⚠ Kalau ini diisi, attachment di atas (Attach Media) di-skip.
                  </span>
                ) : null}
              </div>
              {scheduleMediaUrl && (
                <div className="mt-2 rounded border border-bg-700 bg-bg-900 p-2">
                  {scheduleMediaUrl.match(/\.(mp4|mov|webm)$/i) ? (
                    <video
                      src={scheduleMediaUrl}
                      controls
                      className="max-h-32 rounded"
                    />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={scheduleMediaUrl}
                      alt="preview"
                      className="max-h-32 rounded"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.opacity = "0.3";
                      }}
                    />
                  )}
                </div>
              )}
            </div>
            <div className="mt-3 flex items-center justify-end gap-2 border-t border-bg-700 pt-3">
              <button
                onClick={() => {
                  setScheduleMode(false);
                  setScheduleDateTime("");
                }}
                className="rounded-lg border border-bg-700 px-3 py-1.5 text-xs text-fg-300"
              >
                Batal
              </button>
              <button
                onClick={saveScheduledPost}
                disabled={
                  scheduling ||
                  !text.trim() ||
                  !scheduleDateTime
                }
                className="rounded-lg bg-brand-amber px-4 py-1.5 text-xs font-bold text-bg-900 hover:opacity-90 disabled:opacity-40"
              >
                {scheduling ? "Menjadwalkan..." : "📅 Simpan Schedule"}
              </button>
            </div>
            <div className="mt-2 text-[10px] text-fg-500">
              💡 Cron jalan tiap jam (kalau cron-job.org aktif). Schedule fire pada
              jam terdekat setelah waktu yang ditentukan. Pastikan cron-job.org running.
            </div>
          </div>
        )}

        {/* Pending Scheduled Posts */}
        {pendingSchedules.length > 0 && (
          <div className="mt-4 rounded-xl border border-bg-700 bg-bg-900/40 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-bold text-fg-100">
                ⏳ Pending Scheduled Posts ({pendingSchedules.length})
              </span>
            </div>
            <div className="space-y-1.5">
              {pendingSchedules.map((s) => (
                <div
                  key={s.id}
                  className="flex items-start gap-2 rounded-lg border border-bg-700 bg-bg-800 p-2"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                      <span className="rounded bg-brand-amber/20 px-1.5 py-0.5 font-bold text-brand-amber">
                        {s.target_group}
                      </span>
                      <span className="rounded bg-bg-700 px-1.5 py-0.5 uppercase text-fg-400">
                        {s.platform}
                      </span>
                      <span className="text-fg-500">→ {s.owner_name}</span>
                      <span className="text-brand-emerald font-mono">
                        🕐 {new Date(s.scheduled_at).toLocaleString("id-ID")}
                      </span>
                    </div>
                    <div className="mt-1 truncate text-xs text-fg-300">
                      {s.text_content.slice(0, 100)}
                      {s.text_content.length > 100 ? "…" : ""}
                    </div>
                  </div>
                  <button
                    onClick={() => cancelScheduled(s.id)}
                    className="shrink-0 rounded bg-red-950/50 px-2 py-1 text-[10px] text-brand-rose hover:bg-red-950"
                  >
                    ✕ Batal
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Grouped Bulk History — per post_group untuk copy semua link sekaligus */}
      {(() => {
        // Group history yang punya post_group, sorted by created_at desc
        const grouped: Record<string, Array<TwitterPost | SocialPost>> = {};
        history
          .filter((p) => p.status === "posted" && "post_group" in p && p.post_group)
          .forEach((p) => {
            const k = p.post_group!;
            grouped[k] = grouped[k] || [];
            grouped[k].push(p);
          });
        // Order: Post 1, Post 2, Post 3, Post Short
        const order = ["Post 1", "Post 2", "Post 3", "Post Short"];
        const sortedKeys = Object.keys(grouped).sort(
          (a, b) => order.indexOf(a) - order.indexOf(b)
        );

        if (sortedKeys.length === 0) return null;

        return (
          <div className="mb-6">
            <h3 className="mb-3 text-base font-bold text-fg-100">
              📊 Hasil Bulk Post per Group
            </h3>
            <div className="space-y-3">
              {sortedKeys.map((groupName) => {
                const items = grouped[groupName];
                const isShort = groupName === "Post Short";
                // Build URLs untuk group ini
                const links = items
                  .map((p) => {
                    if (tab === "twitter" && "tweet_id" in p && p.tweet_id) {
                      const tw = p as TwitterPost;
                      const conn = twConns.find((c) => c.id === tw.connection_id);
                      const username = conn?.twitter_username || "i";
                      return {
                        account: `@${conn?.twitter_username || "?"}`,
                        url: `https://x.com/${username}/status/${tw.tweet_id}`,
                      };
                    }
                    if (tab === "telegram" && "external_id" in p && p.external_id) {
                      const sp = p as SocialPost;
                      const conn = tgConns.find(
                        (tg) => tg.owner_name === (sp.target_owner || "")
                      );
                      if (!conn) return null;
                      const chatId = conn.chat_id.startsWith("-100")
                        ? conn.chat_id.slice(4)
                        : conn.chat_id.startsWith("@")
                        ? conn.chat_id.slice(1)
                        : conn.chat_id;
                      return {
                        account: conn.chat_title,
                        url: chatId.match(/^\d+$/)
                          ? `https://t.me/c/${chatId}/${sp.external_id}`
                          : `https://t.me/${chatId}/${sp.external_id}`,
                      };
                    }
                    return null;
                  })
                  .filter((x): x is { account: string; url: string } => x !== null);

                return (
                  <div
                    key={groupName}
                    className={`rounded-xl border p-3 ${
                      isShort
                        ? "border-amber-500/40 bg-amber-500/5"
                        : "border-bg-700 bg-bg-800"
                    }`}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-sm font-bold ${
                            isShort ? "text-brand-amber" : "text-brand-sky"
                          }`}
                        >
                          {isShort && "⚡ "}
                          {groupName}
                        </span>
                        <span className="text-[10px] text-fg-500">
                          {items.length} post · {links.length} link
                        </span>
                      </div>
                      {links.length > 0 && (
                        <div className="flex gap-1">
                          <button
                            onClick={() => {
                              const text = links.map((l) => l.url).join("\n");
                              navigator.clipboard.writeText(text);
                              toast(`✅ ${links.length} link ${groupName} di-copy`);
                            }}
                            className="rounded bg-brand-emerald px-2 py-1 text-[10px] font-bold text-bg-900 hover:opacity-90"
                            title="Copy semua URL ke clipboard"
                          >
                            📋 Copy Semua
                          </button>
                          <button
                            onClick={() => {
                              const text = links
                                .map((l) => `${l.account}: ${l.url}`)
                                .join("\n");
                              navigator.clipboard.writeText(text);
                              toast(`✅ ${links.length} link + akun di-copy`);
                            }}
                            className="rounded bg-bg-700 px-2 py-1 text-[10px] font-bold text-fg-200 hover:bg-bg-600"
                            title="Copy URL + nama akun"
                          >
                            📋 Copy + Akun
                          </button>
                        </div>
                      )}
                    </div>
                    {links.length > 0 && (
                      <div className="max-h-64 overflow-y-auto rounded bg-bg-900 p-2 font-mono text-[10px]">
                        {links.map((l, i) => (
                          <div key={i} className="flex items-center gap-2 py-0.5">
                            <span className="w-32 shrink-0 truncate text-fg-500">
                              {l.account}
                            </span>
                            <a
                              href={l.url}
                              target="_blank"
                              rel="noreferrer"
                              className="flex-1 truncate text-brand-sky hover:underline"
                            >
                              {l.url}
                            </a>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(l.url);
                                toast("Link di-copy");
                              }}
                              className="text-fg-400 hover:text-fg-100"
                              title="Copy link ini"
                            >
                              📋
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* History */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-bold text-fg-100">
            Riwayat {currentPlatform.name} ({history.length})
          </h3>
          {(() => {
            // Build all URLs from history (sukses only)
            const allLinks = history
              .filter((p) => p.status === "posted")
              .map((p) => {
                if (tab === "twitter" && "tweet_id" in p && p.tweet_id) {
                  const tw = p as TwitterPost;
                  const conn = twConns.find((c) => c.id === tw.connection_id);
                  const username = conn?.twitter_username || "i";
                  return {
                    account: `@${conn?.twitter_username || "?"}`,
                    url: `https://x.com/${username}/status/${tw.tweet_id}`,
                  };
                }
                if (tab === "telegram" && "external_id" in p && p.external_id) {
                  const sp = p as SocialPost;
                  const conn = tgConns.find(
                    (tg) => tg.owner_name === (sp.target_owner || "")
                  );
                  if (!conn) return null;
                  const chatId = conn.chat_id.startsWith("-100")
                    ? conn.chat_id.slice(4)
                    : conn.chat_id.startsWith("@")
                    ? conn.chat_id.slice(1)
                    : conn.chat_id;
                  return {
                    account: conn.chat_title,
                    url: chatId.match(/^\d+$/)
                      ? `https://t.me/c/${chatId}/${sp.external_id}`
                      : `https://t.me/${chatId}/${sp.external_id}`,
                  };
                }
                return null;
              })
              .filter((x): x is { account: string; url: string } => x !== null);

            if (allLinks.length === 0) return null;

            return (
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const text = allLinks.map((l) => l.url).join("\n");
                    navigator.clipboard.writeText(text);
                    toast(`✅ ${allLinks.length} link riwayat di-copy`);
                  }}
                  className="rounded-lg bg-brand-emerald px-3 py-1.5 text-xs font-bold text-bg-900 hover:opacity-90"
                  title="Copy semua URL hasil post di riwayat (sukses saja)"
                >
                  📋 Copy Semua URL ({allLinks.length})
                </button>
                <button
                  onClick={() => {
                    const text = allLinks
                      .map((l) => `${l.account}: ${l.url}`)
                      .join("\n");
                    navigator.clipboard.writeText(text);
                    toast(`✅ ${allLinks.length} link + akun di-copy`);
                  }}
                  className="rounded-lg bg-bg-700 px-3 py-1.5 text-xs font-bold text-fg-200 hover:bg-bg-600"
                  title="Copy URL + nama akun"
                >
                  📋 + Akun
                </button>
              </div>
            );
          })()}
        </div>
        {history.length === 0 ? (
          <div className="rounded-xl border border-bg-700 bg-bg-800 p-6 text-center text-sm text-fg-500">
            Belum ada post
          </div>
        ) : (
          <div className="space-y-2">
            {history.map((p) => {
              const isError = p.status === "error";
              const content =
                "text_content" in p
                  ? (p as TwitterPost).text_content
                  : (p as SocialPost).content;

              // Build link to actual post on platform
              let postUrl: string | null = null;
              let accountLabel: string | null = null;
              if (tab === "twitter" && "tweet_id" in p && p.tweet_id) {
                const tw = p as TwitterPost;
                // Lookup username dari twConns via connection_id
                const conn = twConns.find((c) => c.id === tw.connection_id);
                const username = conn?.twitter_username || "i";
                postUrl = `https://x.com/${username}/status/${tw.tweet_id}`;
                if (conn) accountLabel = `@${conn.twitter_username}`;
              } else if (tab === "telegram" && "external_id" in p && p.external_id) {
                const sp = p as SocialPost;
                // Telegram: t.me/c/{chat_id_no_minus}/{message_id} — works untuk private groups
                // Atau t.me/{username}/{message_id} — untuk public channels
                // Lookup chat info dari tgConns
                const conn = tgConns.find((tg) => tg.owner_name === (sp.target_owner || "") || tg.chat_title === sp.target_owner);
                if (conn) {
                  accountLabel = conn.chat_title;
                  // Convert -100xxxx → xxxx untuk t.me/c/ link (private group)
                  const chatId = conn.chat_id.startsWith("-100")
                    ? conn.chat_id.slice(4)
                    : conn.chat_id.startsWith("@")
                    ? conn.chat_id.slice(1)
                    : conn.chat_id;
                  postUrl = chatId.match(/^\d+$/)
                    ? `https://t.me/c/${chatId}/${sp.external_id}`
                    : `https://t.me/${chatId}/${sp.external_id}`;
                }
              }

              return (
                <div
                  key={p.id}
                  className={`rounded-lg border p-3 ${
                    isError
                      ? "border-red-500/40 bg-red-950/20"
                      : "border-bg-700 bg-bg-800"
                  }`}
                >
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                        isError
                          ? "bg-red-500/20 text-brand-rose"
                          : "bg-emerald-500/20 text-brand-emerald"
                      }`}
                    >
                      {isError ? "❌ GAGAL" : "✅ TERKIRIM"}
                    </span>
                    <span className="text-[10px] text-fg-500">
                      {new Date(p.created_at).toLocaleString("id-ID")}
                    </span>
                    {p.posted_by && (
                      <span className="text-[10px] text-fg-400">· {p.posted_by}</span>
                    )}
                    {accountLabel && (
                      <span className="text-[10px] text-fg-400">→ {accountLabel}</span>
                    )}
                    {"media_type" in p && p.media_type && (
                      <span className="text-[10px] text-brand-sky">
                        · {p.media_type === "video" ? "🎬" : "🖼"} {p.media_type}
                      </span>
                    )}
                    {postUrl && !isError && (
                      <a
                        href={postUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="ml-auto rounded bg-brand-sky/10 px-2 py-0.5 text-[10px] font-bold text-brand-sky hover:bg-brand-sky/20"
                        title="Buka post di Twitter"
                      >
                        🔗 Lihat di {tab === "twitter" ? "X" : "Telegram"}
                      </a>
                    )}
                  </div>
                  <div className="text-sm text-fg-200 whitespace-pre-wrap">{content}</div>
                  {postUrl && !isError && (
                    <div className="mt-2 truncate font-mono text-[10px] text-brand-sky">
                      {postUrl}
                    </div>
                  )}
                  {isError && "error" in p && p.error && (
                    <div className="mt-1 text-[10px] text-brand-rose">{p.error}</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </PageShell>
  );
}

export default function AutoPostPage() {
  return (
    <Suspense fallback={<div className="p-6 text-fg-500">Memuat...</div>}>
      <AutoPostInner />
    </Suspense>
  );
}
