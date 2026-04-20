"use client";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { useToast } from "@/components/Toast";
import { useSession } from "@/hooks/useSession";
import { supabase } from "@/lib/supabase";
import { logAs } from "@/lib/utils";

type Connection = {
  id: number;
  owner_name: string;
  twitter_username: string;
  twitter_user_id: string;
  expires_at: string;
  created_at: string;
};

type Post = {
  id: number;
  tweet_id: string;
  text_content: string;
  status: string;
  error?: string;
  posted_by: string;
  created_at: string;
};

function AutoPostInner() {
  const { session } = useSession();
  const { toast } = useToast();
  const sp = useSearchParams();

  const [connections, setConnections] = useState<Connection[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [text, setText] = useState("");
  const [owner, setOwner] = useState("admin");
  const [posting, setPosting] = useState(false);

  const isAdmin = session?.role === "admin";
  const isMember = session?.role === "member";
  const myName = session?.memberName || (isAdmin ? "admin" : "");

  const load = async () => {
    // Member: hanya lihat koneksi & post miliknya sendiri
    // Admin: lihat semua
    let connQ = supabase.from("twitter_connections").select("*").order("id");
    let postQ = supabase
      .from("twitter_posts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (isMember && myName) {
      connQ = connQ.eq("owner_name", myName);
      postQ = postQ.eq("posted_by", myName);
    }
    const [cData, pData] = await Promise.all([connQ, postQ]);
    setConnections((cData.data as Connection[]) || []);
    setPosts((pData.data as Post[]) || []);
  };

  useEffect(() => {
    load();
    if (sp.get("connected")) {
      toast(`Twitter @${sp.get("connected")} terhubung!`);
      window.history.replaceState({}, "", "/dashboard/autopost");
    }
    if (sp.get("error")) {
      toast(`Error: ${sp.get("error")}`, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (myName) setOwner(myName);
  }, [myName]);

  const connectTwitter = () => {
    window.location.href = `/api/twitter/auth?owner=${encodeURIComponent(owner)}`;
  };

  const disconnect = async (conn: Connection) => {
    if (!confirm(`Putuskan akun Twitter @${conn.twitter_username}?`)) return;
    await supabase.from("twitter_connections").delete().eq("id", conn.id);
    logAs(session, "Disconnect Twitter", "Auto Post", `@${conn.twitter_username}`);
    toast("Akun Twitter diputuskan");
    load();
  };

  const postTweet = async () => {
    if (!text.trim()) return toast("Tweet kosong", true);
    if (text.length > 280) return toast("Melebihi 280 karakter", true);
    const conn = connections.find((c) => c.owner_name === owner);
    if (!conn) return toast(`Akun Twitter untuk "${owner}" belum terhubung`, true);

    setPosting(true);
    try {
      const res = await fetch("/api/twitter/tweet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, owner, posted_by: myName }),
      });
      const j = await res.json();
      if (!res.ok) {
        toast(`Gagal post: ${j.error || "error"}`, true);
      } else {
        logAs(session, "Post Tweet", "Auto Post", text.slice(0, 80));
        toast("Tweet berhasil di-post!");
        setText("");
        load();
      }
    } catch (e) {
      toast(`Error: ${e instanceof Error ? e.message : "unknown"}`, true);
    } finally {
      setPosting(false);
    }
  };

  const charCount = text.length;
  const charColor =
    charCount > 280
      ? "text-brand-rose"
      : charCount > 260
      ? "text-brand-amber"
      : "text-fg-500";

  const activeConn = connections.find((c) => c.owner_name === owner);

  return (
    <PageShell title="Auto Post" desc="Post otomatis ke Twitter dari dashboard">
      {/* Connected Accounts */}
      <div className="mb-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-bold text-fg-100">
            {isMember
              ? `Akun Twitter Kamu${connections.length > 0 ? ` (${connections.length})` : ""}`
              : `Akun Twitter Terhubung (${connections.length})`}
          </h3>
          <button
            onClick={connectTwitter}
            className="rounded-lg bg-[#1DA1F2] px-4 py-2 text-sm font-bold text-white hover:opacity-90"
          >
            🐦 {isMember
              ? connections.length > 0
                ? "Re-connect Twitter"
                : "Connect Twitter Kamu"
              : `Connect Twitter untuk ${owner}`}
          </button>
        </div>

        {connections.length === 0 ? (
          <div className="rounded-xl border border-bg-700 bg-bg-800 p-8 text-center">
            <div className="mb-2 text-4xl">🐦</div>
            <div className="text-sm font-semibold text-fg-300">Belum ada akun terhubung</div>
            <div className="mt-1 text-xs text-fg-500">
              Klik &quot;Connect Twitter&quot; di atas untuk authorize akun
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {connections.map((c) => (
              <div
                key={c.id}
                className="flex items-center gap-3 rounded-xl border border-bg-700 bg-bg-800 p-4"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#1DA1F2] text-lg font-bold text-white">
                  𝕏
                </div>
                <div className="flex-1">
                  <div className="text-sm font-bold text-fg-100">
                    @{c.twitter_username || "unknown"}
                  </div>
                  <div className="text-[10px] uppercase tracking-wide text-fg-500">
                    pemegang: {c.owner_name}
                  </div>
                </div>
                <button
                  onClick={() => disconnect(c)}
                  className="rounded bg-red-950/50 px-3 py-1 text-xs text-brand-rose hover:bg-red-950"
                >
                  Disconnect
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Compose Tweet */}
      <div className="mb-6 rounded-xl border border-bg-700 bg-bg-800 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-bold text-fg-100">Compose Tweet</h3>
          {isMember ? (
            <div className="rounded-lg border border-bg-700 bg-bg-900 px-3 py-1.5 text-xs text-fg-100">
              Post sebagai: <strong>{myName}</strong>
              {activeConn && (
                <span className="ml-2 text-brand-sky">@{activeConn.twitter_username}</span>
              )}
            </div>
          ) : (
            <select
              className="rounded-lg border border-bg-700 bg-bg-900 px-3 py-1.5 text-xs text-fg-100 outline-none"
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
            >
              <option value="admin">admin</option>
              {connections.map((c) => (
                <option key={c.id} value={c.owner_name}>
                  {c.owner_name} (@{c.twitter_username})
                </option>
              ))}
            </select>
          )}
        </div>

        {!activeConn && (
          <div className="mb-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-brand-amber">
            ⚠ Akun Twitter untuk &quot;<strong>{owner}</strong>&quot; belum terhubung. Klik
            tombol &quot;Connect Twitter&quot; di atas dulu.
          </div>
        )}

        <textarea
          className="w-full rounded-lg border border-bg-700 bg-bg-900 p-4 text-sm text-fg-100 outline-none focus:border-brand-sky"
          rows={5}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Apa yang kamu pikirkan? Ketik tweet di sini..."
          maxLength={500}
        />

        <div className="mt-3 flex items-center justify-between">
          <span className={`text-xs font-semibold ${charColor}`}>
            {charCount}/280 karakter
          </span>
          <button
            onClick={postTweet}
            disabled={posting || !text.trim() || text.length > 280 || !activeConn}
            className="rounded-full bg-[#1DA1F2] px-6 py-2 text-sm font-bold text-white hover:opacity-90 disabled:opacity-40"
          >
            {posting ? "Posting..." : "🚀 Post Now"}
          </button>
        </div>
      </div>

      {/* Post History */}
      <div>
        <h3 className="mb-3 text-base font-bold text-fg-100">
          Riwayat Post ({posts.length})
        </h3>
        {posts.length === 0 ? (
          <div className="rounded-xl border border-bg-700 bg-bg-800 p-6 text-center text-sm text-fg-500">
            Belum ada tweet yang di-post
          </div>
        ) : (
          <div className="space-y-2">
            {posts.map((p) => {
              const isError = p.status === "error";
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
                      {isError ? "❌ GAGAL" : "✅ POSTED"}
                    </span>
                    <span className="text-[10px] text-fg-500">
                      {new Date(p.created_at).toLocaleString("id-ID")}
                    </span>
                    {p.posted_by && (
                      <span className="text-[10px] text-fg-400">· {p.posted_by}</span>
                    )}
                    {p.tweet_id && !isError && (
                      <a
                        href={`https://twitter.com/i/status/${p.tweet_id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="ml-auto text-[10px] text-brand-sky hover:underline"
                      >
                        Lihat di X →
                      </a>
                    )}
                  </div>
                  <div className="text-sm text-fg-200 whitespace-pre-wrap">
                    {p.text_content}
                  </div>
                  {isError && p.error && (
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
