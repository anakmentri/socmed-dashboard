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
  content: string;
  media_type: string | null;
  status: string;
  error: string | null;
  external_id: string | null;
  created_at: string;
};
type TwitterPost = {
  id: number;
  tweet_id: string;
  text_content: string;
  status: string;
  error?: string;
  posted_by: string;
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
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {tab === "twitter" &&
              (availConns as TwitterConn[]).map((c) => (
                <div
                  key={c.id}
                  className="flex items-center gap-3 rounded-xl border border-bg-700 bg-bg-800 p-4"
                >
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-full text-white"
                    style={{ backgroundColor: currentPlatform.color }}
                  >
                    {currentPlatform.icon}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-bold text-fg-100">
                      @{c.twitter_username || "unknown"}
                    </div>
                    <div className="text-[10px] uppercase tracking-wide text-fg-500">
                      {c.owner_name}
                    </div>
                  </div>
                  <button
                    onClick={() => disconnectTw(c)}
                    className="rounded bg-red-950/50 px-3 py-1 text-xs text-brand-rose"
                  >
                    Disconnect
                  </button>
                </div>
              ))}
            {tab === "telegram" &&
              (availConns as TelegramConn[]).map((c) => (
                <div
                  key={c.id}
                  className="flex items-center gap-3 rounded-xl border border-bg-700 bg-bg-800 p-4"
                >
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-full text-xl text-white"
                    style={{ backgroundColor: currentPlatform.color }}
                  >
                    ✈
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-bold text-fg-100">{c.chat_title}</div>
                    <div className="text-[10px] text-fg-500">
                      {c.owner_name} · {c.chat_id}
                    </div>
                  </div>
                  <button
                    onClick={() => disconnectTg(c)}
                    className="rounded bg-red-950/50 px-3 py-1 text-xs text-brand-rose"
                  >
                    Disconnect
                  </button>
                </div>
              ))}
          </div>
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

        {availConns.length > 1 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {availConns.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedConnId(c.id)}
                className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition ${
                  selectedConnId === c.id
                    ? "border-current"
                    : "border-bg-700 bg-bg-900 text-fg-400"
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
          <button
            onClick={postNow}
            disabled={
              posting ||
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

      {/* History */}
      <div>
        <h3 className="mb-3 text-base font-bold text-fg-100">
          Riwayat {currentPlatform.name} ({history.length})
        </h3>
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
              return (
                <div
                  key={p.id}
                  className={`rounded-lg border p-3 ${
                    isError
                      ? "border-red-500/40 bg-red-950/20"
                      : "border-bg-700 bg-bg-800"
                  }`}
                >
                  <div className="mb-1 flex items-center gap-2">
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
                    {"media_type" in p && p.media_type && (
                      <span className="text-[10px] text-brand-sky">
                        · {p.media_type === "video" ? "🎬" : "🖼"} {p.media_type}
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-fg-200 whitespace-pre-wrap">{content}</div>
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
