"use client";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/PageShell";
import { Modal, FormRow, Field, inputCls } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { useSession } from "@/hooks/useSession";
import { supabase } from "@/lib/supabase";
import { SocAccount } from "@/lib/types";
import { getDefaultTeam } from "@/lib/auth";
import { logAs } from "@/lib/utils";

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
};

export default function AccountsPage() {
  const { session } = useSession();
  const { toast } = useToast();
  const team = getDefaultTeam();
  const [rows, setRows] = useState<SocAccount[]>([]);
  const [showPw, setShowPw] = useState<Record<number, boolean>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [banned, setBanned] = useState<Record<number, boolean>>({});
  const [filter, setFilter] = useState<"all" | "active" | "banned">("all");

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
    banned: boolean;
  };
  const emptyBatchRow: BatchRow = {
    platform: "Instagram",
    username: "",
    email: "",
    password: "",
    notes: "",
    banned: false,
  };
  const [batch, setBatch] = useState<{
    open: boolean;
    owner: string;
    rows: BatchRow[];
  }>({ open: false, owner: "", rows: [{ ...emptyBatchRow }] });
  const isMember = session?.role === "member";
  const myName = session?.memberName || "";

  const load = async () => {
    let q = supabase.from("soc_accounts").select("*");
    if (isMember) q = q.eq("owner", myName);
    const { data } = await q;
    setRows((data as SocAccount[]) || []);
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

      <div className="space-y-3">
        {team
          .filter((t) => !isMember || t.name === myName)
          .map((t) => {
            const memberAccs = rows.filter((r) => r.owner === t.name);
            const isOpen = !!expanded[t.name];
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
                  <div className="p-4">
                    {memberAccs.length === 0 ? (
                      <div className="py-6 text-center text-sm text-fg-500">
                        Belum ada akun yang terdaftar
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {memberAccs.filter((r) => {
                          if (filter === "banned") return !!banned[r.id!];
                          if (filter === "active") return !banned[r.id!];
                          return true;
                        }).map((r) => {
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
                              className={`group relative rounded-xl border p-4 transition ${
                                isBanned
                                  ? "border-red-500/40 bg-red-950/20 hover:border-red-500/60"
                                  : "border-bg-700 bg-bg-900 hover:border-bg-600"
                              }`}
                            >
                              {isBanned && (
                                <div className="absolute left-3 top-3 rounded-full bg-red-500/20 border border-red-500/50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-red-400">
                                  🚫 BANNED
                                </div>
                              )}
                              <div className="absolute right-3 top-3 flex gap-1 opacity-0 transition group-hover:opacity-100">
                                <button
                                  onClick={() => toggleBanned(r.id!)}
                                  className={`rounded px-2 py-1 text-[10px] font-semibold ${
                                    isBanned
                                      ? "bg-emerald-950 text-brand-emerald"
                                      : "bg-red-950/60 text-brand-rose"
                                  }`}
                                >
                                  {isBanned ? "↩ Aktifkan" : "🚫 Banned"}
                                </button>
                                <button
                                  onClick={() => openEdit(r, idx)}
                                  className="rounded bg-bg-700 px-2 py-1 text-[10px] text-brand-sky"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => remove(r)}
                                  className="rounded bg-red-950/50 px-2 py-1 text-[10px] text-brand-rose"
                                >
                                  Hapus
                                </button>
                              </div>

                              <div className={`mb-3 flex items-center gap-3 ${isBanned ? "mt-6" : ""}`}>
                                <div
                                  className={`flex h-10 w-10 items-center justify-center rounded-xl text-xs font-bold text-white ${pi.bg} ${isBanned ? "grayscale" : ""}`}
                                >
                                  {pi.icon}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className={`text-sm font-bold ${isBanned ? "text-fg-400 line-through" : "text-fg-100"}`}>
                                    {r.platform}
                                  </div>
                                  <div className={`truncate text-xs ${isBanned ? "text-fg-500" : "text-brand-sky"}`}>
                                    {r.email}
                                  </div>
                                </div>
                              </div>

                              {r.username && (
                                <div className="mb-2 text-xs text-fg-400">
                                  @{r.username.replace(/^@/, "")}
                                </div>
                              )}

                              {pUrl && (
                                <a
                                  href={pUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-bg-700 bg-bg-800 px-3 py-1 text-[11px] font-semibold text-fg-200 transition hover:border-brand-sky hover:text-brand-sky"
                                >
                                  🔗 Buka Profil
                                </a>
                              )}

                              <div className="flex items-center gap-2 text-xs">
                                <span className="font-mono tracking-wider text-fg-300">
                                  {showPw[r.id!] ? r.password : "••••••••"}
                                </span>
                                <button
                                  onClick={() =>
                                    setShowPw((p) => ({ ...p, [r.id!]: !p[r.id!] }))
                                  }
                                  className="rounded border border-bg-700 bg-bg-800 px-2 py-0.5 text-[10px] text-fg-400 transition hover:text-fg-100"
                                >
                                  {showPw[r.id!] ? "Sembunyikan" : "Lihat"}
                                </button>
                              </div>

                              {r.notes && (
                                <div className="mt-2 text-[10px] italic text-fg-600">
                                  {r.notes}
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
