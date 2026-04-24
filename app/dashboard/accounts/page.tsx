"use client";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/PageShell";
import { Modal, FormRow, Field, inputCls } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { useSession } from "@/hooks/useSession";
import { supabase } from "@/lib/supabase";
import { SocAccount } from "@/lib/types";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import { logAs } from "@/lib/utils";
import { useCachedData } from "@/hooks/useCachedData";
import { invalidateCache } from "@/lib/cache";

const PLATFORMS = [
  "Instagram",
  "Facebook",
  "X (Twitter)",
  "TikTok",
  "YouTube",
  "LinkedIn",
  "Telegram",
  "Semprot",
];

const PLAT_ICONS: Record<string, { icon: string; bg: string }> = {
  Instagram: { icon: "IG", bg: "bg-gradient-to-br from-purple-500 to-pink-500" },
  Facebook: { icon: "FB", bg: "bg-blue-600" },
  "X (Twitter)": { icon: "X", bg: "bg-gray-800" },
  TikTok: { icon: "TT", bg: "bg-gray-900" },
  YouTube: { icon: "YT", bg: "bg-red-600" },
  LinkedIn: { icon: "LI", bg: "bg-blue-700" },
  Telegram: { icon: "TG", bg: "bg-sky-500" },
  Semprot: { icon: "SP", bg: "bg-gradient-to-br from-rose-500 to-orange-500" },
};

const empty: SocAccount = {
  owner: "",
  platform: "Instagram",
  username: "",
  email: "",
  password: "",
  notes: "",
  verify_link: "",
};

export default function AccountsPage() {
  const { session } = useSession();
  const { toast } = useToast();
  const { team } = useTeamMembers();
  const [showPw, setShowPw] = useState<Record<number, boolean>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [banned, setBanned] = useState<Record<number, boolean>>({});
  const [filter, setFilter] = useState<"all" | "active" | "banned">("all");
  const [search, setSearch] = useState("");
  const [platformFilter, setPlatformFilter] = useState<string>("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const loadBanned = async () => {
    try {
      const { data } = await supabase.from("banned_accounts").select("account_id");
      const map: Record<number, boolean> = {};
      (data || []).forEach((b: { account_id: number }) => { map[b.account_id] = true; });
      setBanned(map);
    } catch {}
  };

  useEffect(() => {
    loadBanned();
  }, []);

  const toggleBanned = async (id: number) => {
    const isCurrentlyBanned = !!banned[id];
    const next = { ...banned };
    if (isCurrentlyBanned) {
      delete next[id];
      await supabase.from("banned_accounts").delete().eq("account_id", id);
    } else {
      next[id] = true;
      await supabase.from("banned_accounts").upsert({ account_id: id });
    }
    setBanned(next);
    const r = rows.find((x) => x.id === id);
    logAs(
      session,
      isCurrentlyBanned ? "Aktifkan Akun" : "Tandai Banned",
      "Akun Sosmed",
      r ? `${r.platform} milik ${r.owner}` : "Akun #" + id
    );
    toast(isCurrentlyBanned ? "Akun kembali aktif" : "Akun ditandai BANNED");
  };
  const [modal, setModal] = useState<{ open: boolean; idx: number; data: SocAccount }>({
    open: false,
    idx: -1,
    data: empty,
  });

  type BatchRow = {
    platform: string;
    username: string;
    email: string;
    password: string;
    notes: string;
    verify_link: string;
    banned: boolean;
  };
  const emptyBatchRow: BatchRow = {
    platform: "Instagram",
    username: "",
    email: "",
    password: "",
    notes: "",
    verify_link: "",
    banned: false,
  };
  const [batch, setBatch] = useState<{
    open: boolean;
    owner: string;
    rows: BatchRow[];
  }>({ open: false, owner: "", rows: [{ ...emptyBatchRow }] });
  const isMember = session?.role === "member";
  const myName = session?.memberName || "";

  const accountsKey = isMember ? `accounts_${myName}` : "accounts_all";
  const {
    data: rowsCached,
    loading: accountsLoading,
    refresh: refreshAccounts,
    isStale: accountsStale,
  } = useCachedData<SocAccount[]>({
    key: accountsKey,
    fetcher: async () => {
      let q = supabase.from("soc_accounts").select("*");
      if (isMember) q = q.eq("owner", myName);
      const { data } = await q;
      return (data as SocAccount[]) || [];
    },
  });
  const rows: SocAccount[] = rowsCached || [];

  const load = async () => {
    invalidateCache(accountsKey);
    await refreshAccounts();
  };

  const openAddFor = (name: string) =>
    setBatch({ open: true, owner: name, rows: [{ ...emptyBatchRow }] });
  const openEdit = (r: SocAccount, i: number) =>
    setModal({ open: true, idx: i, data: { ...r } });
  const close = () => setModal((m) => ({ ...m, open: false }));
  const closeBatch = () => setBatch((b) => ({ ...b, open: false }));

  const addBatchRow = () =>
    setBatch((b) => ({ ...b, rows: [...b.rows, { ...emptyBatchRow }] }));
  const removeBatchRow = (idx: number) =>
    setBatch((b) => ({
      ...b,
      rows: b.rows.length === 1 ? [{ ...emptyBatchRow }] : b.rows.filter((_, i) => i !== idx),
    }));
  const updateBatchRow = (idx: number, patch: Partial<BatchRow>) =>
    setBatch((b) => ({
      ...b,
      rows: b.rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)),
    }));

  const saveBatch = async () => {
    if (!batch.owner) return toast("Pemegang akun wajib dipilih", true);
    const valid = batch.rows.filter((r) => r.email.trim() && r.password.trim());
    if (valid.length === 0) return toast("Isi minimal 1 akun (email & password)", true);

    let success = 0;
    const newBanned = { ...banned };
    for (const row of valid) {
      const payload = {
        owner: batch.owner,
        platform: row.platform,
        username: row.username.trim(),
        email: row.email.trim(),
        password: row.password.trim(),
        notes: row.notes.trim(),
        verify_link: row.verify_link.trim(),
      };
      const { data, error } = await supabase
        .from("soc_accounts")
        .insert(payload)
        .select()
        .single();
      if (error) {
        toast(`${row.platform}: ${error.message}`, true);
        continue;
      }
      if (row.banned && data?.id) newBanned[data.id] = true;
      success++;
    }
    if (success > 0) {
      // Persist banned IDs to Supabase
      const newIds = Object.keys(newBanned)
        .filter((id) => newBanned[Number(id)] && !banned[Number(id)])
        .map((id) => ({ account_id: Number(id) }));
      if (newIds.length > 0) {
        await supabase.from("banned_accounts").upsert(newIds);
      }
      setBanned(newBanned);
      logAs(
        session,
        "Tambah Akun Sosmed (Batch)",
        "Akun Sosmed",
        `${success} akun ditambahkan untuk ${batch.owner}`
      );
      toast(`${success} akun ditambahkan`);
      closeBatch();
      load();
    }
  };

  const save = async () => {
    const d = modal.data;
    if (!d.owner) return toast("Pemegang akun wajib diisi", true);
    if (!d.email) return toast("Email wajib diisi", true);
    if (!d.password) return toast("Password wajib diisi", true);
    const payload = { ...d };
    delete (payload as { id?: number }).id;
    if (modal.idx < 0) {
      const { error } = await supabase.from("soc_accounts").insert(payload);
      if (error) return toast(error.message, true);
      logAs(session, "Tambah Akun Sosmed", "Akun Sosmed", `${d.platform} untuk ${d.owner} (${d.email})`);
      toast("Akun ditambahkan");
    } else {
      const { error } = await supabase.from("soc_accounts").update(payload).eq("id", d.id!);
      if (error) return toast(error.message, true);
      logAs(session, "Edit Akun Sosmed", "Akun Sosmed", `${d.platform} milik ${d.owner}`);
      toast("Akun diperbarui");
    }
    close();
    load();
  };

  const remove = async (r: SocAccount) => {
    if (!confirm(`Hapus akun ${r.platform} milik ${r.owner}?`)) return;
    await supabase.from("soc_accounts").delete().eq("id", r.id!);
    logAs(session, "Hapus Akun Sosmed", "Akun Sosmed", `${r.platform} milik ${r.owner}`);
    toast("Akun dihapus");
    load();
  };

  const removeAll = async (name: string) => {
    const accs = rows.filter((r) => r.owner === name);
    if (accs.length === 0) return;
    if (!confirm(`Hapus semua ${accs.length} akun milik ${name}?`)) return;
    for (const a of accs) await supabase.from("soc_accounts").delete().eq("id", a.id!);
    logAs(session, "Hapus Semua Akun", "Akun Sosmed", `${accs.length} akun milik ${name}`);
    toast(`${accs.length} akun ${name} dihapus`);
    load();
  };

  const exportAccounts = () => {
    const csv = [
      ["Owner", "Platform", "Username", "Email", "Password", "Notes"],
      ...rows.map((r) => [r.owner, r.platform, r.username, r.email, r.password, r.notes]),
    ]
      .map((row) => row.map((c) => `"${(c || "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "akun_sosmed.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast("Data akun di-export");
  };

  const importAccounts = async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const text = await file.text();
      const lines = text.split("\n").slice(1);
      let count = 0;
      for (const line of lines) {
        const cols = line.match(/("(?:[^"]|"")*"|[^,]*)/g)?.map((c) =>
          c.replace(/^"|"$/g, "").replace(/""/g, '"')
        );
        if (!cols || cols.length < 4) continue;
        const [owner, platform, username, email, password, notes] = cols;
        if (!owner || !email) continue;
        await supabase.from("soc_accounts").insert({ owner, platform, username, email, password, notes });
        count++;
      }
      toast(`${count} akun di-import`);
      load();
    };
    input.click();
  };

  // Auto-check status akun sosmed
  const [checking, setChecking] = useState(false);
  const [checkResults, setCheckResults] = useState<
    Record<number, { active: boolean | null; reason: string; at: string }>
  >({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem("dashboard_account_check_results");
      if (raw) setCheckResults(JSON.parse(raw));
    } catch {}
  }, []);

  const saveCheckResults = (
    r: Record<number, { active: boolean | null; reason: string; at: string }>
  ) => {
    try {
      localStorage.setItem("dashboard_account_check_results", JSON.stringify(r));
    } catch {}
  };

  const [checkProgress, setCheckProgress] = useState<{ done: number; total: number } | null>(null);

  const checkAccounts = async (accountsToCheck: SocAccount[]) => {
    if (accountsToCheck.length === 0) return;
    setChecking(true);
    const checks = accountsToCheck
      .filter((a) => a.id && a.username)
      .map((a) => ({
        id: a.id!,
        url: profileUrl(a),
        platform: a.platform,
        username: a.username,
      }));

    if (checks.length === 0) {
      toast("Tidak ada akun dengan username valid", true);
      setChecking(false);
      return;
    }

    setCheckProgress({ done: 0, total: checks.length });

    // Batch 30 per request (sesuai server limit)
    const BATCH = 30;
    const chunks: typeof checks[] = [];
    for (let i = 0; i < checks.length; i += BATCH) chunks.push(checks.slice(i, i + BATCH));

    let totalChecked = 0;
    let suspended = 0;
    let active = 0;
    let unknown = 0;
    const nextResults = { ...checkResults };
    const newlyBanned: number[] = [];

    for (const chunk of chunks) {
      try {
        const res = await fetch("/api/check-account", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ checks: chunk }),
        });
        const j = await res.json();
        for (const r of j.results || []) {
          nextResults[r.id] = {
            active: r.active,
            reason: r.reason,
            at: new Date().toISOString(),
          };
          totalChecked++;
          if (r.active === false) {
            // Confirmed suspended → mark banned
            if (!banned[r.id]) newlyBanned.push(r.id);
            suspended++;
          } else if (r.active === true) {
            active++;
          } else {
            // Uncertain (null) → JANGAN auto-ban, biar admin manual cek
            unknown++;
          }
        }
        setCheckProgress({ done: totalChecked, total: checks.length });
        // Update results incrementally so user sees progress
        setCheckResults({ ...nextResults });
      } catch (e) {
        console.error(e);
      }
    }

    setCheckResults(nextResults);
    saveCheckResults(nextResults);

    // Sync newly-banned ke Supabase (batch)
    if (newlyBanned.length > 0) {
      const newBanned = { ...banned };
      newlyBanned.forEach((id) => (newBanned[id] = true));
      setBanned(newBanned);
      await supabase
        .from("banned_accounts")
        .upsert(newlyBanned.map((id) => ({ account_id: id })))
        .then(() => {});
    }

    logAs(
      session,
      "Auto-Check Akun Sosmed",
      "Akun Sosmed",
      `${totalChecked} dicek: ✅${active} aktif, ⚠${suspended} suspended, ❓${unknown} tidak pasti`
    );
    toast(
      `✅ ${active} aktif · ⚠ ${suspended} suspended (auto-banned) · ❓ ${unknown} tidak pasti${
        unknown > 0 ? " (cek manual)" : ""
      }`
    );
    setChecking(false);
    setCheckProgress(null);
  };

  const copyToClipboard = (text: string, label: string) => {
    if (!text) return toast(`${label} kosong`, true);
    try {
      navigator.clipboard.writeText(text);
      toast(`${label} disalin`);
    } catch {
      toast("Gagal menyalin", true);
    }
  };

  const profileUrl = (r: SocAccount) => {
    if (!r.username) return "";
    const u = r.username.replace(/^@/, "");
    if (r.platform === "Instagram") return `https://instagram.com/${u}`;
    if (r.platform === "X (Twitter)") return `https://x.com/${u}`;
    if (r.platform === "TikTok") return `https://tiktok.com/@${u}`;
    if (r.platform === "YouTube") return `https://youtube.com/@${u}`;
    if (r.platform === "LinkedIn") return `https://linkedin.com/in/${u}`;
    if (r.platform === "Facebook") return `https://facebook.com/${u}`;
    if (r.platform === "Telegram") return `https://t.me/${u}`;
    if (r.platform === "Semprot") return `https://www.semprot.com/profile/${u}`;
    return "";
  };

  return (
    <PageShell title="Akun Sosmed" desc="Data akun sosial media per anggota tim">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-base font-bold text-fg-100">Data Akun Sosial Media</h3>
          <div className="flex gap-1 rounded-lg border border-bg-700 bg-bg-900 p-0.5">
            {(["all", "active", "banned"] as const).map((f) => {
              const count =
                f === "banned"
                  ? rows.filter((r) => banned[r.id!]).length
                  : f === "active"
                  ? rows.filter((r) => !banned[r.id!]).length
                  : rows.length;
              const label = f === "all" ? "Semua" : f === "active" ? "Aktif" : "🚫 Banned";
              return (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`rounded px-2.5 py-1 text-[11px] font-semibold transition ${
                    filter === f
                      ? f === "banned"
                        ? "bg-red-500/20 text-red-400"
                        : "bg-brand-sky text-bg-900"
                      : "text-fg-400 hover:text-fg-100"
                  }`}
                >
                  {label} ({count})
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={refreshAccounts}
            disabled={accountsLoading}
            className="flex items-center gap-1.5 rounded-lg border border-bg-700 bg-bg-800 px-3 py-2 text-xs text-fg-400 hover:border-bg-600 hover:text-fg-100 disabled:opacity-50"
            title={accountsStale ? "Data mungkin lama" : "Data fresh"}
          >
            <span className={accountsLoading ? "animate-spin" : ""}>🔄</span>
            {accountsLoading ? "..." : "Refresh"}
            {accountsStale && !accountsLoading && (
              <span className="h-1.5 w-1.5 rounded-full bg-brand-amber" />
            )}
          </button>
          <button
            onClick={() => checkAccounts(rows)}
            disabled={checking}
            className="flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-brand-emerald hover:bg-emerald-500/20 disabled:opacity-50"
            title="Cek semua akun: Twitter via oembed (100% reliable), platform lain via HTTP+body"
          >
            <span className={checking ? "animate-spin" : ""}>🔍</span>
            {checking
              ? checkProgress
                ? `Mengecek ${checkProgress.done}/${checkProgress.total}...`
                : "Mengecek..."
              : "Cek Semua Akun"}
          </button>
          <button
            onClick={exportAccounts}
            className="rounded-lg border border-bg-700 bg-bg-800 px-4 py-2 text-xs font-semibold text-fg-300 hover:border-bg-600"
          >
            Export Akun
          </button>
          <button
            onClick={importAccounts}
            className="rounded-lg border border-bg-700 bg-bg-800 px-4 py-2 text-xs font-semibold text-fg-300 hover:border-bg-600"
          >
            Import Akun
          </button>
          <button
            onClick={() =>
              setBatch({
                open: true,
                owner: isMember ? myName : "",
                rows: [{ ...emptyBatchRow }],
              })
            }
            className="rounded-lg bg-brand-sky px-4 py-2 text-xs font-bold text-bg-900"
          >
            + Tambah Akun
          </button>
        </div>
      </div>

      {/* Search + Platform filter chips */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[240px] flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-500">
            🔍
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari email, username, platform, atau anggota..."
            className="w-full rounded-lg border border-bg-700 bg-bg-800 py-2 pl-9 pr-3 text-sm text-fg-100 outline-none focus:border-brand-sky"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-fg-500 hover:text-fg-100"
              title="Bersihkan"
            >
              ✕
            </button>
          )}
        </div>
        {(search || platformFilter || filter !== "all") && (
          <button
            onClick={() => {
              setSearch("");
              setPlatformFilter("");
              setFilter("all");
            }}
            className="rounded-lg border border-bg-700 bg-bg-800 px-3 py-2 text-xs text-fg-400 hover:bg-bg-700 hover:text-fg-100"
          >
            ✕ Reset Semua
          </button>
        )}
      </div>

      {/* Platform filter chips with counts */}
      <div className="mb-5 flex flex-wrap gap-1.5">
        <button
          onClick={() => setPlatformFilter("")}
          className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition ${
            platformFilter === ""
              ? "border-brand-sky bg-brand-sky/10 text-brand-sky"
              : "border-bg-700 bg-bg-800 text-fg-400 hover:border-bg-600"
          }`}
        >
          Semua Platform ({rows.length})
        </button>
        {PLATFORMS.map((p) => {
          const count = rows.filter((r) => r.platform === p).length;
          if (count === 0) return null;
          const pi = PLAT_ICONS[p];
          return (
            <button
              key={p}
              onClick={() => setPlatformFilter(platformFilter === p ? "" : p)}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold transition ${
                platformFilter === p
                  ? "border-brand-sky bg-brand-sky/10 text-brand-sky"
                  : "border-bg-700 bg-bg-800 text-fg-400 hover:border-bg-600"
              }`}
            >
              {pi && (
                <span
                  className={`flex h-4 w-4 items-center justify-center rounded text-[8px] font-bold text-white ${pi.bg}`}
                >
                  {pi.icon}
                </span>
              )}
              {p} ({count})
            </button>
          );
        })}
        <div className="ml-auto flex rounded-lg border border-bg-700 bg-bg-800 p-0.5">
          <button
            onClick={() => setViewMode("grid")}
            title="Tampilan kartu"
            className={`rounded px-2.5 py-1 text-[11px] font-semibold transition ${
              viewMode === "grid"
                ? "bg-brand-sky text-bg-900"
                : "text-fg-400 hover:text-fg-100"
            }`}
          >
            ▦ Grid
          </button>
          <button
            onClick={() => setViewMode("list")}
            title="Tampilan list (kompak)"
            className={`rounded px-2.5 py-1 text-[11px] font-semibold transition ${
              viewMode === "list"
                ? "bg-brand-sky text-bg-900"
                : "text-fg-400 hover:text-fg-100"
            }`}
          >
            ☰ List
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {team
          .filter((t) => !isMember || t.name === myName)
          .map((t) => {
            const memberAccs = rows
              .filter((r) => r.owner === t.name)
              .filter((r) => {
                // banned/active filter
                if (filter === "banned" && !banned[r.id!]) return false;
                if (filter === "active" && banned[r.id!]) return false;
                // platform filter
                if (platformFilter && r.platform !== platformFilter) return false;
                // search
                if (search) {
                  const q = search.toLowerCase();
                  const hay = `${r.platform} ${r.username} ${r.email} ${r.notes} ${r.owner}`.toLowerCase();
                  if (!hay.includes(q)) return false;
                }
                return true;
              });
            // Auto-open kalau filter/search aktif & ada hasil
            const filterActive = !!(search || platformFilter || filter !== "all");
            const isOpen = filterActive ? memberAccs.length > 0 : !!expanded[t.name];
            // Hide member yg kosong saat filter aktif (untuk fokus)
            if (filterActive && memberAccs.length === 0) return null;
            return (
              <div
                key={t.username}
                className="overflow-hidden rounded-xl border border-bg-700 bg-bg-800"
              >
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  <button
                    onClick={() =>
                      setExpanded((c) => ({ ...c, [t.name]: !isOpen }))
                    }
                    className="flex flex-1 items-center gap-3 text-left"
                  >
                    <span className="text-fg-500">{isOpen ? "▼" : "▶"}</span>
                    <span
                      className="flex h-10 w-10 items-center justify-center rounded-lg text-sm font-bold text-white shadow-sm"
                      style={{ backgroundColor: t.color }}
                    >
                      {t.name[0]}
                    </span>
                    <div>
                      <div className="font-bold text-fg-100">{t.name}</div>
                      <div className="text-xs text-fg-500">
                        {t.role} · {memberAccs.length} akun
                      </div>
                    </div>
                  </button>
                  <div className="flex items-center gap-2">
                    {memberAccs.length > 0 && (
                      <button
                        onClick={() => checkAccounts(memberAccs)}
                        disabled={checking}
                        className="rounded-full border border-sky-500/40 bg-sky-500/10 px-3 py-1 text-xs font-semibold text-brand-sky hover:bg-sky-500/20 disabled:opacity-50"
                        title="Cek status semua akun milik anggota ini"
                      >
                        <span className={checking ? "inline-block animate-spin" : ""}>🔍</span>{" "}
                        Cek
                      </button>
                    )}
                    <button
                      onClick={() => openAddFor(t.name)}
                      className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/20"
                    >
                      + Tambah
                    </button>
                    {memberAccs.length > 0 && !isMember && (
                      <button
                        onClick={() => removeAll(t.name)}
                        className="rounded-full border border-red-500/40 bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-400 hover:bg-red-500/20"
                      >
                        🗑 Hapus
                      </button>
                    )}
                  </div>
                </div>

                <div className="h-0.5 w-full" style={{ backgroundColor: t.color }} />

                {isOpen && (
                  <div className="max-h-[60vh] overflow-y-auto p-4 scrollbar-thin">
                    {memberAccs.length === 0 ? (
                      <div className="py-6 text-center">
                        <div className="mb-2 text-3xl opacity-50">🐣</div>
                        <div className="text-sm text-fg-500">Belum ada akun yang terdaftar</div>
                      </div>
                    ) : viewMode === "list" ? (
                      <div className="overflow-hidden rounded-lg border border-bg-700">
                        <table className="w-full text-xs">
                          <thead className="bg-bg-900 text-[10px] uppercase tracking-wider text-fg-500">
                            <tr>
                              <th className="px-3 py-2 text-left">Platform</th>
                              <th className="px-2 py-2 text-left">Username</th>
                              <th className="px-2 py-2 text-left">Email</th>
                              <th className="px-2 py-2 text-left">Password</th>
                              <th className="px-2 py-2 text-left">🔗 Verify</th>
                              <th className="px-2 py-2 text-left">Status</th>
                              <th className="px-2 py-2 text-right">Aksi</th>
                            </tr>
                          </thead>
                          <tbody>
                            {memberAccs.map((r) => {
                              const idx = rows.indexOf(r);
                              const pi = PLAT_ICONS[r.platform] || {
                                icon: r.platform.slice(0, 2),
                                bg: "bg-gray-700",
                              };
                              const pUrl = profileUrl(r);
                              const isBanned = !!banned[r.id!];
                              return (
                                <tr
                                  key={r.id}
                                  className={`group border-t border-bg-700/40 transition hover:bg-bg-900/60 ${
                                    isBanned ? "bg-red-950/20" : ""
                                  }`}
                                >
                                  <td className="px-3 py-2">
                                    <div className="flex items-center gap-2">
                                      <div
                                        className={`flex h-6 w-6 items-center justify-center rounded text-[9px] font-bold text-white ${pi.bg} ${
                                          isBanned ? "grayscale" : ""
                                        }`}
                                      >
                                        {pi.icon}
                                      </div>
                                      <span
                                        className={`font-semibold ${
                                          isBanned ? "text-fg-500 line-through" : "text-fg-100"
                                        }`}
                                      >
                                        {r.platform}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="px-2 py-2">
                                    {r.username ? (
                                      <button
                                        onClick={() =>
                                          copyToClipboard(
                                            r.username.replace(/^@/, ""),
                                            "Username"
                                          )
                                        }
                                        className="text-fg-300 hover:text-fg-100 hover:underline"
                                      >
                                        @{r.username.replace(/^@/, "")}
                                      </button>
                                    ) : (
                                      <span className="text-fg-600">-</span>
                                    )}
                                  </td>
                                  <td className="max-w-[180px] truncate px-2 py-2">
                                    <button
                                      onClick={() => copyToClipboard(r.email, "Email")}
                                      className="truncate text-brand-sky hover:underline"
                                      title={r.email}
                                    >
                                      {r.email}
                                    </button>
                                  </td>
                                  <td className="px-2 py-2">
                                    <div className="flex items-center gap-1.5">
                                      <span className="font-mono text-fg-300">
                                        {showPw[r.id!] ? r.password : "••••••"}
                                      </span>
                                      <button
                                        onClick={() =>
                                          setShowPw((p) => ({ ...p, [r.id!]: !p[r.id!] }))
                                        }
                                        className="text-[9px] text-brand-sky hover:underline"
                                      >
                                        {showPw[r.id!] ? "H" : "Lihat"}
                                      </button>
                                      <button
                                        onClick={() => copyToClipboard(r.password, "Password")}
                                        title="Copy password"
                                        className="text-[10px] text-fg-400 hover:text-fg-100"
                                      >
                                        📋
                                      </button>
                                    </div>
                                  </td>
                                  <td className="max-w-[160px] px-2 py-2">
                                    {r.verify_link ? (
                                      <div className="flex items-center gap-1">
                                        <a
                                          href={r.verify_link}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="truncate text-[10px] text-brand-emerald hover:underline"
                                          title={r.verify_link}
                                        >
                                          🔗 Link
                                        </a>
                                        <button
                                          onClick={() =>
                                            copyToClipboard(r.verify_link || "", "Link verifikasi")
                                          }
                                          className="text-[10px] text-fg-400 hover:text-fg-100"
                                          title="Copy link verifikasi"
                                        >
                                          📋
                                        </button>
                                      </div>
                                    ) : (
                                      <span className="text-fg-600">-</span>
                                    )}
                                  </td>
                                  <td className="px-2 py-2">
                                    {isBanned ? (
                                      <span className="rounded bg-red-500/20 px-1.5 py-0.5 text-[9px] font-bold text-brand-rose">
                                        🚫 Banned
                                      </span>
                                    ) : (
                                      <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-bold text-brand-emerald">
                                        Aktif
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-2 py-2 text-right">
                                    <div className="flex justify-end gap-1">
                                      {pUrl && (
                                        <a
                                          href={pUrl}
                                          target="_blank"
                                          rel="noreferrer"
                                          title="Buka profil"
                                          className="rounded border border-bg-700 px-1.5 py-0.5 text-[10px] hover:border-brand-sky"
                                        >
                                          🔗
                                        </a>
                                      )}
                                      <button
                                        onClick={() => toggleBanned(r.id!)}
                                        title={isBanned ? "Aktifkan" : "Tandai banned"}
                                        className={`rounded px-1.5 py-0.5 text-[10px] ${
                                          isBanned
                                            ? "bg-emerald-950 text-brand-emerald"
                                            : "bg-red-950/50 text-brand-rose"
                                        }`}
                                      >
                                        {isBanned ? "↩" : "🚫"}
                                      </button>
                                      <button
                                        onClick={() => openEdit(r, idx)}
                                        title="Edit"
                                        className="rounded bg-bg-700 px-1.5 py-0.5 text-[10px] text-brand-sky"
                                      >
                                        ✎
                                      </button>
                                      <button
                                        onClick={() => remove(r)}
                                        title="Hapus"
                                        className="rounded bg-red-950/50 px-1.5 py-0.5 text-[10px] text-brand-rose"
                                      >
                                        🗑
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {memberAccs.map((r) => {
                          const idx = rows.indexOf(r);
                          const pi = PLAT_ICONS[r.platform] || {
                            icon: r.platform.slice(0, 2),
                            bg: "bg-gray-700",
                          };
                          const pUrl = profileUrl(r);
                          const isBanned = !!banned[r.id!];
                          return (
                            <div
                              key={r.id}
                              className={`group relative rounded-lg border p-2.5 transition ${
                                isBanned
                                  ? "border-red-500/40 bg-red-950/20 hover:border-red-500/60"
                                  : "border-bg-700 bg-bg-900 hover:border-bg-600"
                              }`}
                            >
                              {/* Header: icon + platform + email + menu on hover */}
                              <div className="mb-1.5 flex items-center gap-2">
                                <div
                                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold text-white ${pi.bg} ${
                                    isBanned ? "grayscale" : ""
                                  }`}
                                >
                                  {pi.icon}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5">
                                    <span
                                      className={`text-xs font-bold ${
                                        isBanned ? "text-fg-500 line-through" : "text-fg-100"
                                      }`}
                                    >
                                      {r.platform}
                                    </span>
                                    {isBanned && (
                                      <span className="rounded bg-red-500/20 px-1 text-[8px] font-bold text-brand-rose">
                                        🚫
                                      </span>
                                    )}
                                  </div>
                                  <button
                                    onClick={() => copyToClipboard(r.email, "Email")}
                                    title="Klik untuk copy email"
                                    className={`block w-full truncate text-left text-[11px] hover:underline ${
                                      isBanned ? "text-fg-500" : "text-brand-sky"
                                    }`}
                                  >
                                    {r.email}
                                  </button>
                                </div>
                              </div>

                              {/* @username + actions inline */}
                              <div className="mb-1.5 flex items-center justify-between gap-2">
                                {r.username ? (
                                  <button
                                    onClick={() =>
                                      copyToClipboard(r.username.replace(/^@/, ""), "Username")
                                    }
                                    title="Copy username"
                                    className="truncate text-[10px] text-fg-400 hover:text-fg-100 hover:underline"
                                  >
                                    @{r.username.replace(/^@/, "")}
                                  </button>
                                ) : (
                                  <span className="text-[10px] text-fg-600">no username</span>
                                )}
                                <div className="flex gap-1">
                                  {pUrl && (
                                    <a
                                      href={pUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      title="Buka profil"
                                      className="rounded border border-bg-700 bg-bg-800 px-1.5 py-0.5 text-[10px] hover:border-brand-sky"
                                    >
                                      🔗
                                    </a>
                                  )}
                                  <button
                                    onClick={() => copyToClipboard(r.email, "Email")}
                                    title="Copy email"
                                    className="rounded border border-bg-700 bg-bg-800 px-1.5 py-0.5 text-[10px] hover:border-brand-sky"
                                  >
                                    📧
                                  </button>
                                  <button
                                    onClick={() => copyToClipboard(r.password, "Password")}
                                    title="Copy password"
                                    className="rounded border border-bg-700 bg-bg-800 px-1.5 py-0.5 text-[10px] hover:border-brand-sky"
                                  >
                                    🔑
                                  </button>
                                </div>
                              </div>

                              {/* Password inline row */}
                              <div className="flex items-center gap-1.5 rounded border border-bg-700 bg-bg-800/50 px-2 py-1 text-[10px]">
                                <span className="text-fg-500">PWD</span>
                                <span className="flex-1 truncate font-mono tracking-wider text-fg-300">
                                  {showPw[r.id!] ? r.password : "••••••••"}
                                </span>
                                <button
                                  onClick={() =>
                                    setShowPw((p) => ({ ...p, [r.id!]: !p[r.id!] }))
                                  }
                                  className="text-brand-sky hover:underline"
                                >
                                  {showPw[r.id!] ? "Hide" : "Lihat"}
                                </button>
                              </div>

                              {/* Edit/Hapus/Banned — tampil saat hover */}
                              <div className="absolute right-1.5 top-1.5 flex gap-0.5 opacity-0 transition group-hover:opacity-100">
                                <button
                                  onClick={() => toggleBanned(r.id!)}
                                  title={isBanned ? "Aktifkan" : "Tandai banned"}
                                  className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${
                                    isBanned
                                      ? "bg-emerald-950 text-brand-emerald"
                                      : "bg-red-950/60 text-brand-rose"
                                  }`}
                                >
                                  {isBanned ? "↩" : "🚫"}
                                </button>
                                <button
                                  onClick={() => openEdit(r, idx)}
                                  title="Edit"
                                  className="rounded bg-bg-700 px-1.5 py-0.5 text-[9px] text-brand-sky"
                                >
                                  ✎
                                </button>
                                <button
                                  onClick={() => remove(r)}
                                  title="Hapus"
                                  className="rounded bg-red-950/50 px-1.5 py-0.5 text-[9px] text-brand-rose"
                                >
                                  🗑
                                </button>
                              </div>

                              {/* Status check result */}
                              {checkResults[r.id!] && (
                                <>
                                  <div
                                    className={`mt-1.5 flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] ${
                                      checkResults[r.id!].active === true
                                        ? "bg-emerald-500/10 text-brand-emerald"
                                        : checkResults[r.id!].active === false
                                        ? "bg-red-500/10 text-brand-rose"
                                        : "bg-bg-700 text-fg-500"
                                    }`}
                                    title={`${checkResults[r.id!].reason} · Dicek ${new Date(
                                      checkResults[r.id!].at
                                    ).toLocaleString("id-ID")}`}
                                  >
                                    {checkResults[r.id!].active === true
                                      ? "✅ Terverifikasi Aktif"
                                      : checkResults[r.id!].active === false
                                      ? "⚠ " + checkResults[r.id!].reason.slice(0, 40)
                                      : "❓ Tidak pasti"}
                                  </div>
                                  {/* False-positive ban indicator: banned tapi check confirms active */}
                                  {isBanned && checkResults[r.id!].active === true && (
                                    <button
                                      onClick={() => toggleBanned(r.id!)}
                                      className="mt-1 flex w-full items-center justify-center gap-1 rounded bg-amber-500/10 border border-amber-500/40 px-1.5 py-1 text-[9px] font-bold text-brand-amber hover:bg-amber-500/20"
                                      title="Akun ini ditandai banned tapi check konfirmasi aktif. Klik untuk un-ban."
                                    >
                                      🔓 Unban — terverifikasi aktif
                                    </button>
                                  )}
                                </>
                              )}

                              {r.verify_link && (
                                <div className="mt-1.5 flex items-center gap-1">
                                  <a
                                    href={r.verify_link}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex-1 truncate text-[9px] text-brand-emerald hover:underline"
                                    title={r.verify_link}
                                  >
                                    🔗 {r.verify_link}
                                  </a>
                                  <button
                                    onClick={() =>
                                      copyToClipboard(r.verify_link || "", "Link verifikasi")
                                    }
                                    title="Copy link verifikasi"
                                    className="rounded border border-bg-700 bg-bg-800 px-1 text-[9px] hover:border-brand-emerald"
                                  >
                                    📋
                                  </button>
                                </div>
                              )}

                              {r.notes && (
                                <div className="mt-1.5 truncate text-[9px] italic text-fg-600" title={r.notes}>
                                  📝 {r.notes}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

        {/* Global empty state when nothing matches filter */}
        {(search || platformFilter || filter !== "all") &&
          team
            .filter((t) => !isMember || t.name === myName)
            .every((t) => {
              const accs = rows
                .filter((r) => r.owner === t.name)
                .filter((r) => {
                  if (filter === "banned" && !banned[r.id!]) return false;
                  if (filter === "active" && banned[r.id!]) return false;
                  if (platformFilter && r.platform !== platformFilter) return false;
                  if (search) {
                    const q = search.toLowerCase();
                    const hay = `${r.platform} ${r.username} ${r.email} ${r.notes} ${r.owner}`.toLowerCase();
                    if (!hay.includes(q)) return false;
                  }
                  return true;
                });
              return accs.length === 0;
            }) && (
            <div className="rounded-xl border border-bg-700 bg-bg-800 p-12 text-center">
              <div className="mb-3 text-5xl opacity-50">🔍</div>
              <div className="mb-1 text-sm font-semibold text-fg-300">
                Tidak ada akun yang cocok
              </div>
              <div className="text-xs text-fg-500">
                Coba ubah kata kunci pencarian atau filter platform
              </div>
            </div>
          )}
      </div>

      <Modal
        open={batch.open}
        onClose={closeBatch}
        title="Tambah Akun Sosmed (Multi)"
        width={780}
      >
        <div className="mb-4">
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-fg-300">
            Pemegang (Anggota)
          </label>
          <select
            className={inputCls}
            value={batch.owner}
            disabled={isMember}
            onChange={(e) => setBatch((b) => ({ ...b, owner: e.target.value }))}
          >
            <option value="">-- Pilih anggota --</option>
            {team.map((t) => (
              <option key={t.username} value={t.name}>
                {t.name} ({t.role})
              </option>
            ))}
          </select>
        </div>

        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-fg-300">
            Daftar Akun ({batch.rows.length})
          </span>
          <button
            onClick={addBatchRow}
            className="rounded-lg bg-emerald-500/20 border border-emerald-500/40 px-3 py-1 text-xs font-semibold text-brand-emerald hover:bg-emerald-500/30"
          >
            + Tambah Baris
          </button>
        </div>

        <div className="mb-4 space-y-3">
          {batch.rows.map((row, idx) => (
            <div
              key={idx}
              className={`rounded-lg border p-3 ${
                row.banned
                  ? "border-red-500/40 bg-red-950/20"
                  : "border-bg-700 bg-bg-900"
              }`}
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="rounded bg-bg-700 px-2 py-0.5 text-[10px] font-bold text-fg-300">
                  #{idx + 1}
                </span>
                <div className="flex items-center gap-2">
                  <label className="flex cursor-pointer items-center gap-1.5 rounded px-2 py-1 text-[11px]">
                    <input
                      type="checkbox"
                      checked={row.banned}
                      onChange={(e) => updateBatchRow(idx, { banned: e.target.checked })}
                      className="h-3.5 w-3.5 accent-red-500"
                    />
                    <span className={row.banned ? "font-bold text-brand-rose" : "text-fg-400"}>
                      🚫 Banned
                    </span>
                  </label>
                  <button
                    onClick={() => removeBatchRow(idx)}
                    className="rounded bg-red-950/50 px-2 py-1 text-[10px] text-brand-rose"
                    title="Hapus baris"
                  >
                    ✕
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select
                  className={inputCls + " text-xs"}
                  value={row.platform}
                  onChange={(e) => updateBatchRow(idx, { platform: e.target.value })}
                >
                  {PLATFORMS.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
                <input
                  className={inputCls + " text-xs"}
                  placeholder="@username"
                  value={row.username}
                  onChange={(e) => updateBatchRow(idx, { username: e.target.value })}
                />
                <input
                  type="email"
                  className={inputCls + " text-xs"}
                  placeholder="Email *"
                  value={row.email}
                  onChange={(e) => updateBatchRow(idx, { email: e.target.value })}
                />
                <input
                  className={inputCls + " text-xs"}
                  placeholder="Password *"
                  value={row.password}
                  onChange={(e) => updateBatchRow(idx, { password: e.target.value })}
                />
              </div>
              <input
                className={inputCls + " mt-2 text-xs"}
                placeholder="🔗 Link verifikasi (opsional) — mis. link konfirmasi email Twitter"
                value={row.verify_link}
                onChange={(e) => updateBatchRow(idx, { verify_link: e.target.value })}
              />
              <input
                className={inputCls + " mt-2 text-xs"}
                placeholder="Catatan (opsional)"
                value={row.notes}
                onChange={(e) => updateBatchRow(idx, { notes: e.target.value })}
              />
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2 border-t border-bg-700 pt-4">
          <button
            onClick={closeBatch}
            className="rounded-lg border border-bg-700 px-4 py-2 text-sm text-fg-300"
          >
            Batal
          </button>
          <button
            onClick={saveBatch}
            className="rounded-lg bg-brand-sky px-6 py-2 text-sm font-bold text-bg-900"
          >
            Simpan Semua
          </button>
        </div>
      </Modal>

      <Modal
        open={modal.open}
        onClose={close}
        title={modal.idx < 0 ? "Tambah Akun Sosmed" : "Edit Akun Sosmed"}
      >
        <FormRow>
          <Field label="Pemegang (Anggota)">
            <select
              className={inputCls}
              value={modal.data.owner}
              disabled={isMember}
              onChange={(e) =>
                setModal((m) => ({ ...m, data: { ...m.data, owner: e.target.value } }))
              }
            >
              <option value="">-- Pilih anggota --</option>
              {team.map((t) => (
                <option key={t.username} value={t.name}>
                  {t.name} ({t.role})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Platform">
            <select
              className={inputCls}
              value={modal.data.platform}
              onChange={(e) =>
                setModal((m) => ({ ...m, data: { ...m.data, platform: e.target.value } }))
              }
            >
              {PLATFORMS.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </Field>
        </FormRow>
        <FormRow>
          <Field label="Username / Handle">
            <input
              className={inputCls}
              value={modal.data.username}
              onChange={(e) =>
                setModal((m) => ({ ...m, data: { ...m.data, username: e.target.value } }))
              }
              placeholder="@username"
            />
          </Field>
          <Field label="Email">
            <input
              className={inputCls}
              type="email"
              value={modal.data.email}
              onChange={(e) =>
                setModal((m) => ({ ...m, data: { ...m.data, email: e.target.value } }))
              }
            />
          </Field>
        </FormRow>
        <div className="mb-4">
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-fg-300">
            Password
          </label>
          <input
            className={inputCls}
            value={modal.data.password}
            onChange={(e) =>
              setModal((m) => ({ ...m, data: { ...m.data, password: e.target.value } }))
            }
          />
        </div>
        <div className="mb-4">
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-fg-300">
            🔗 Link Verifikasi
          </label>
          <input
            className={inputCls}
            value={modal.data.verify_link || ""}
            onChange={(e) =>
              setModal((m) => ({ ...m, data: { ...m.data, verify_link: e.target.value } }))
            }
            placeholder="Contoh: link konfirmasi email Twitter, magic link, dll"
          />
        </div>
        <div className="mb-4">
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-fg-300">
            Catatan
          </label>
          <input
            className={inputCls}
            value={modal.data.notes}
            onChange={(e) =>
              setModal((m) => ({ ...m, data: { ...m.data, notes: e.target.value } }))
            }
            placeholder="Opsional"
          />
        </div>
        <div className="flex justify-end gap-2 border-t border-bg-700 pt-4">
          <button
            onClick={close}
            className="rounded-lg border border-bg-700 px-4 py-2 text-sm text-fg-300"
          >
            Batal
          </button>
          <button
            onClick={save}
            className="rounded-lg bg-brand-sky px-6 py-2 text-sm font-bold text-bg-900"
          >
            Simpan
          </button>
        </div>
      </Modal>
    </PageShell>
  );
}
