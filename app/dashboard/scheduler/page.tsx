"use client";
import { useState, useEffect } from "react";
import { PageShell } from "@/components/PageShell";
import { Modal, FormRow, Field, inputCls } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { useSession } from "@/hooks/useSession";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import { supabase } from "@/lib/supabase";
import { logAs } from "@/lib/utils";

type ContentItem = {
  id: number;
  name: string;
  text_content: string;
  media_base64: string | null;
  tags: string[] | null;
  active: boolean;
  used_count: number;
  last_used_at: string | null;
  created_at: string;
};

type Schedule = {
  id: number;
  name: string;
  platform: string;
  owner_name: string;
  target_group: string;
  hour_utc: number;
  minute: number;
  frequency: string;
  content_mode: string;
  specific_content_id: number | null;
  active: boolean;
  last_run_at: string | null;
  created_at: string;
};

type Run = {
  id: number;
  schedule_id: number | null;
  content_id: number | null;
  status: string;
  posted_count: number;
  failed_count: number;
  errors: Array<{ account: string; error: string }> | null;
  ran_at: string;
};

const GROUPS = ["Post 1", "Post 2", "Post 3", "Post Short"];

export default function SchedulerPage() {
  const { session } = useSession();
  const { team } = useTeamMembers();
  const { toast } = useToast();
  const [tab, setTab] = useState<"schedules" | "library" | "logs">("schedules");

  const [library, setLibrary] = useState<ContentItem[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    const [lib, sch, rn] = await Promise.all([
      supabase.from("content_library").select("*").order("created_at", { ascending: false }),
      supabase.from("post_schedules").select("*").order("hour_utc"),
      supabase.from("scheduled_runs").select("*").order("ran_at", { ascending: false }).limit(50),
    ]);
    setLibrary((lib.data as ContentItem[]) || []);
    setSchedules((sch.data as Schedule[]) || []);
    setRuns((rn.data as Run[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    if (session?.role) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.role]);

  // ============ Library Modal ============
  const [libModal, setLibModal] = useState<{
    open: boolean;
    data: Partial<ContentItem>;
  }>({ open: false, data: {} });

  const openLibModal = (item?: ContentItem) =>
    setLibModal({
      open: true,
      data: item || { name: "", text_content: "", media_base64: "", active: true },
    });

  const saveLibItem = async () => {
    const d = libModal.data;
    if (!d.name?.trim() || !d.text_content?.trim())
      return toast("Name & text wajib", true);
    if (d.text_content.length > 280) return toast("Text > 280 char (Twitter limit)", true);

    const payload = {
      name: d.name.trim(),
      text_content: d.text_content.trim(),
      media_base64: d.media_base64 || null,
      active: d.active !== false,
      created_by: session?.memberName || session?.username,
    };

    let error;
    if (d.id) {
      ({ error } = await supabase.from("content_library").update(payload).eq("id", d.id));
    } else {
      ({ error } = await supabase.from("content_library").insert(payload));
    }
    if (error) return toast(error.message, true);
    logAs(session, d.id ? "Edit Content" : "Tambah Content", "Auto Post", d.name || "");
    toast(d.id ? "Content diperbarui" : "Content ditambahkan");
    setLibModal({ open: false, data: {} });
    load();
  };

  const deleteLibItem = async (item: ContentItem) => {
    if (!confirm(`Hapus content "${item.name}"?`)) return;
    await supabase.from("content_library").delete().eq("id", item.id);
    toast("Content dihapus");
    load();
  };

  const handleMediaUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return toast("Max 5MB", true);
    const reader = new FileReader();
    reader.onload = () => {
      setLibModal((m) => ({
        ...m,
        data: { ...m.data, media_base64: String(reader.result || "") },
      }));
    };
    reader.readAsDataURL(file);
  };

  // ============ Schedule Modal ============
  const [schModal, setSchModal] = useState<{
    open: boolean;
    data: Partial<Schedule>;
  }>({ open: false, data: {} });

  const openSchModal = (item?: Schedule) =>
    setSchModal({
      open: true,
      data:
        item ||
        {
          name: "",
          platform: "twitter",
          owner_name: "admin",
          target_group: "Post 1",
          hour_utc: 9,
          minute: 0,
          frequency: "daily",
          content_mode: "random",
          active: true,
        },
    });

  const saveSchedule = async () => {
    const d = schModal.data;
    if (!d.name?.trim()) return toast("Name wajib", true);
    if (d.hour_utc === undefined || d.hour_utc < 0 || d.hour_utc > 23)
      return toast("Hour 0-23", true);

    const payload = {
      name: d.name.trim(),
      platform: d.platform || "twitter",
      owner_name: d.owner_name || "admin",
      target_group: d.target_group || "Post 1",
      hour_utc: d.hour_utc,
      minute: d.minute || 0,
      frequency: d.frequency || "daily",
      content_mode: d.content_mode || "random",
      specific_content_id: d.specific_content_id || null,
      active: d.active !== false,
      created_by: session?.memberName || session?.username,
    };

    let error;
    if (d.id) {
      ({ error } = await supabase.from("post_schedules").update(payload).eq("id", d.id));
    } else {
      ({ error } = await supabase.from("post_schedules").insert(payload));
    }
    if (error) return toast(error.message, true);
    logAs(session, d.id ? "Edit Schedule" : "Tambah Schedule", "Auto Post", d.name || "");
    toast(d.id ? "Schedule diperbarui" : "Schedule ditambahkan");
    setSchModal({ open: false, data: {} });
    load();
  };

  const deleteSchedule = async (s: Schedule) => {
    if (!confirm(`Hapus schedule "${s.name}"?`)) return;
    await supabase.from("post_schedules").delete().eq("id", s.id);
    toast("Schedule dihapus");
    load();
  };

  const toggleSchedule = async (s: Schedule) => {
    await supabase.from("post_schedules").update({ active: !s.active }).eq("id", s.id);
    load();
  };

  // ============ Manual trigger ============
  const triggerCron = async () => {
    if (!confirm("Trigger cron auto-post sekarang? (akan jalanin schedule yang due hari ini)"))
      return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/cron/auto-post?key=${process.env.NEXT_PUBLIC_CRON_SECRET || ""}`
      );
      const j = await res.json();
      if (res.ok) {
        toast(`✅ Cron run: ${j.processed || 0} schedules processed`);
      } else {
        toast(`❌ ${j.error || "Failed"}`, true);
      }
    } catch (e) {
      toast(`Error: ${e instanceof Error ? e.message : "unknown"}`, true);
    } finally {
      setLoading(false);
      load();
    }
  };

  // ============ Render ============
  const wibHour = (utcHour: number) => {
    const h = (utcHour + 7) % 24;
    return String(h).padStart(2, "0") + ":00";
  };

  return (
    <PageShell title="Auto Post Scheduler" desc="Schedule posts otomatis ke Post 1/2/3/Short">
      {/* Tabs */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-lg border border-bg-700 bg-bg-800 p-1">
          {(["schedules", "library", "logs"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                tab === t
                  ? "bg-brand-sky text-bg-900"
                  : "text-fg-400 hover:bg-bg-700 hover:text-fg-100"
              }`}
            >
              {t === "schedules" && "⏰ Schedules"}
              {t === "library" && "📚 Library"}
              {t === "logs" && "📜 Logs"}
              <span className="ml-1 rounded bg-black/20 px-1.5 text-[9px]">
                {t === "schedules" ? schedules.length : t === "library" ? library.length : runs.length}
              </span>
            </button>
          ))}
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="rounded-lg border border-bg-700 bg-bg-800 px-3 py-2 text-xs text-fg-400 hover:text-fg-100 disabled:opacity-50"
        >
          🔄 Refresh
        </button>
        <button
          onClick={triggerCron}
          disabled={loading}
          className="rounded-lg bg-brand-amber px-3 py-2 text-xs font-bold text-bg-900 hover:opacity-90 disabled:opacity-50"
          title="Trigger cron auto-post manual (test)"
        >
          ⚡ Trigger Now
        </button>
      </div>

      {/* SCHEDULES TAB */}
      {tab === "schedules" && (
        <>
          <div className="mb-4 flex items-center justify-between">
            <div className="text-xs text-fg-500">
              Schedule jadwal otomatis untuk fire bulk post ke Post 1/2/3/Short.
              <br />
              <strong className="text-brand-amber">Cron berjalan tiap hari (Vercel Hobby).</strong>{" "}
              Untuk hourly, setup external cron di{" "}
              <a
                href="https://cron-job.org"
                target="_blank"
                rel="noreferrer"
                className="text-brand-sky hover:underline"
              >
                cron-job.org
              </a>
              .
            </div>
            <button
              onClick={() => openSchModal()}
              className="rounded-lg bg-brand-sky px-4 py-2 text-sm font-bold text-bg-900"
            >
              + Tambah Schedule
            </button>
          </div>

          <div className="space-y-2">
            {schedules.length === 0 ? (
              <div className="rounded-xl border border-bg-700 bg-bg-800 p-8 text-center text-sm text-fg-500">
                Belum ada schedule. Klik <strong>+ Tambah Schedule</strong> untuk mulai.
              </div>
            ) : (
              schedules.map((s) => (
                <div
                  key={s.id}
                  className={`rounded-xl border p-3 ${
                    s.active
                      ? "border-bg-700 bg-bg-800"
                      : "border-bg-700/50 bg-bg-900 opacity-60"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <button
                      onClick={() => toggleSchedule(s)}
                      className={`flex h-7 w-12 items-center rounded-full px-1 transition ${
                        s.active ? "bg-brand-emerald" : "bg-bg-700"
                      }`}
                      title={s.active ? "Active — klik untuk pause" : "Paused — klik untuk aktifkan"}
                    >
                      <span
                        className={`h-5 w-5 rounded-full bg-white transition ${
                          s.active ? "translate-x-5" : ""
                        }`}
                      />
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-fg-100">{s.name}</span>
                        <span className="rounded bg-bg-700 px-1.5 py-0.5 text-[9px] uppercase text-fg-300">
                          {s.platform}
                        </span>
                        <span className="rounded bg-brand-sky/20 px-1.5 py-0.5 text-[9px] font-bold text-brand-sky">
                          {s.target_group}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-fg-400">
                        <span>👤 {s.owner_name}</span>
                        <span>🕐 {wibHour(s.hour_utc)} WIB ({String(s.hour_utc).padStart(2, "0")}:00 UTC)</span>
                        <span>📅 {s.frequency}</span>
                        <span>🎲 {s.content_mode}</span>
                        {s.last_run_at && (
                          <span>↻ {new Date(s.last_run_at).toLocaleString("id-ID")}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => openSchModal(s)}
                        className="rounded bg-bg-700 px-2 py-1 text-[10px] text-brand-sky hover:bg-bg-600"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => deleteSchedule(s)}
                        className="rounded bg-red-950/50 px-2 py-1 text-[10px] text-brand-rose hover:bg-red-950"
                      >
                        Hapus
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}

      {/* LIBRARY TAB */}
      {tab === "library" && (
        <>
          <div className="mb-4 flex items-center justify-between">
            <div className="text-xs text-fg-500">
              Pool konten yang akan di-post otomatis. Cron pilih random dari yang active.
            </div>
            <button
              onClick={() => openLibModal()}
              className="rounded-lg bg-brand-sky px-4 py-2 text-sm font-bold text-bg-900"
            >
              + Tambah Content
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {library.length === 0 ? (
              <div className="md:col-span-2 lg:col-span-3 rounded-xl border border-bg-700 bg-bg-800 p-8 text-center text-sm text-fg-500">
                Library kosong. Tambah minimal 5-10 konten untuk auto post berjalan dengan baik.
              </div>
            ) : (
              library.map((c) => (
                <div
                  key={c.id}
                  className={`rounded-xl border p-3 ${
                    c.active
                      ? "border-bg-700 bg-bg-800"
                      : "border-bg-700/50 bg-bg-900 opacity-60"
                  }`}
                >
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <span className="truncate text-sm font-bold text-fg-100">{c.name}</span>
                    <span className="rounded bg-bg-700 px-1.5 py-0.5 text-[9px] text-fg-400">
                      x{c.used_count}
                    </span>
                  </div>
                  {c.media_base64 && (
                    <img
                      src={c.media_base64}
                      alt=""
                      className="mb-2 max-h-32 w-full rounded object-cover"
                    />
                  )}
                  <p className="mb-2 line-clamp-3 text-xs text-fg-300 whitespace-pre-wrap">
                    {c.text_content}
                  </p>
                  <div className="flex justify-between">
                    <span className="text-[10px] text-fg-500">{c.text_content.length}/280</span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => openLibModal(c)}
                        className="rounded bg-bg-700 px-2 py-0.5 text-[10px] text-brand-sky hover:bg-bg-600"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => deleteLibItem(c)}
                        className="rounded bg-red-950/50 px-2 py-0.5 text-[10px] text-brand-rose hover:bg-red-950"
                      >
                        Hapus
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}

      {/* LOGS TAB */}
      {tab === "logs" && (
        <div className="overflow-x-auto rounded-xl border border-bg-700 bg-bg-800">
          <table className="w-full text-sm">
            <thead className="bg-bg-900 text-left text-xs uppercase text-fg-500">
              <tr>
                <th className="p-3">Waktu</th>
                <th className="p-3">Schedule</th>
                <th className="p-3">Status</th>
                <th className="p-3">Posted</th>
                <th className="p-3">Failed</th>
                <th className="p-3">Errors</th>
              </tr>
            </thead>
            <tbody>
              {runs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-fg-500">
                    Belum ada riwayat run. Buat schedule + trigger untuk mulai.
                  </td>
                </tr>
              ) : (
                runs.map((r) => {
                  const sch = schedules.find((s) => s.id === r.schedule_id);
                  const content = library.find((l) => l.id === r.content_id);
                  return (
                    <tr key={r.id} className="border-t border-bg-700 hover:bg-bg-700/30">
                      <td className="p-3 text-xs text-fg-400">
                        {new Date(r.ran_at).toLocaleString("id-ID")}
                      </td>
                      <td className="p-3 text-xs">
                        <div className="font-semibold text-fg-100">{sch?.name || "-"}</div>
                        <div className="text-[10px] text-fg-500">{content?.name || ""}</div>
                      </td>
                      <td className="p-3">
                        <span
                          className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                            r.status === "success"
                              ? "bg-emerald-500/20 text-brand-emerald"
                              : r.status === "partial"
                              ? "bg-amber-500/20 text-brand-amber"
                              : "bg-red-500/20 text-brand-rose"
                          }`}
                        >
                          {r.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="p-3 text-sm font-bold text-brand-emerald">{r.posted_count}</td>
                      <td className="p-3 text-sm font-bold text-brand-rose">{r.failed_count}</td>
                      <td className="p-3 text-[10px] text-fg-400 max-w-md">
                        {r.errors && r.errors.length > 0 ? (
                          <details>
                            <summary className="cursor-pointer">
                              {r.errors.length} error
                            </summary>
                            <div className="mt-1 max-h-32 overflow-y-auto rounded bg-bg-900 p-2 font-mono text-[9px]">
                              {r.errors.map((e, i) => (
                                <div key={i}>
                                  {e.account}: {e.error}
                                </div>
                              ))}
                            </div>
                          </details>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* LIBRARY MODAL */}
      <Modal
        open={libModal.open}
        onClose={() => setLibModal({ open: false, data: {} })}
        title={libModal.data.id ? "Edit Content" : "Tambah Content ke Library"}
      >
        <FormRow>
          <Field label="Nama (untuk identifikasi)">
            <input
              className={inputCls}
              value={libModal.data.name || ""}
              placeholder="Contoh: Promo Pagi Senin"
              onChange={(e) =>
                setLibModal((m) => ({ ...m, data: { ...m.data, name: e.target.value } }))
              }
            />
          </Field>
          <Field label="Status">
            <select
              className={inputCls}
              value={libModal.data.active === false ? "false" : "true"}
              onChange={(e) =>
                setLibModal((m) => ({
                  ...m,
                  data: { ...m.data, active: e.target.value === "true" },
                }))
              }
            >
              <option value="true">Active (akan dipakai cron)</option>
              <option value="false">Paused (skip)</option>
            </select>
          </Field>
        </FormRow>
        <div className="mb-4">
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-fg-300">
            Text Content (max 280 char)
          </label>
          <textarea
            className={inputCls + " min-h-[120px]"}
            value={libModal.data.text_content || ""}
            placeholder="Tulis post text di sini..."
            onChange={(e) =>
              setLibModal((m) => ({
                ...m,
                data: { ...m.data, text_content: e.target.value },
              }))
            }
          />
          <div className="mt-1 text-[10px] text-fg-500">
            {(libModal.data.text_content || "").length}/280
          </div>
        </div>
        <div className="mb-4">
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-fg-300">
            Media (opsional, max 5MB)
          </label>
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-bg-700 bg-bg-900 p-4 hover:border-brand-sky">
            {libModal.data.media_base64 ? (
              <img src={libModal.data.media_base64} alt="" className="max-h-40 rounded" />
            ) : (
              <span className="text-xs text-fg-500">📷 Klik upload media</span>
            )}
            <input type="file" accept="image/*,video/*" className="hidden" onChange={handleMediaUpload} />
          </label>
          {libModal.data.media_base64 && (
            <button
              onClick={() =>
                setLibModal((m) => ({ ...m, data: { ...m.data, media_base64: "" } }))
              }
              className="mt-1 text-[10px] text-brand-rose hover:underline"
            >
              ✕ Hapus media
            </button>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-bg-700 pt-4">
          <button
            onClick={() => setLibModal({ open: false, data: {} })}
            className="rounded-lg border border-bg-700 px-4 py-2 text-sm text-fg-300"
          >
            Batal
          </button>
          <button
            onClick={saveLibItem}
            className="rounded-lg bg-brand-sky px-6 py-2 text-sm font-bold text-bg-900"
          >
            {libModal.data.id ? "Simpan" : "Tambah"}
          </button>
        </div>
      </Modal>

      {/* SCHEDULE MODAL */}
      <Modal
        open={schModal.open}
        onClose={() => setSchModal({ open: false, data: {} })}
        title={schModal.data.id ? "Edit Schedule" : "Tambah Schedule"}
      >
        <FormRow>
          <Field label="Nama">
            <input
              className={inputCls}
              value={schModal.data.name || ""}
              placeholder="Contoh: Daily Morning Post 1"
              onChange={(e) =>
                setSchModal((m) => ({ ...m, data: { ...m.data, name: e.target.value } }))
              }
            />
          </Field>
          <Field label="Platform">
            <select
              className={inputCls}
              value={schModal.data.platform || "twitter"}
              onChange={(e) =>
                setSchModal((m) => ({ ...m, data: { ...m.data, platform: e.target.value } }))
              }
            >
              <option value="twitter">𝕏 Twitter</option>
              <option value="telegram">✈ Telegram</option>
            </select>
          </Field>
        </FormRow>
        <FormRow>
          <Field label="Owner (anggota mana akun-akunnya)">
            <select
              className={inputCls}
              value={schModal.data.owner_name || "admin"}
              onChange={(e) =>
                setSchModal((m) => ({
                  ...m,
                  data: { ...m.data, owner_name: e.target.value },
                }))
              }
            >
              <option value="admin">admin</option>
              {team.map((t) => (
                <option key={t.username} value={t.name}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Target Group">
            <select
              className={inputCls}
              value={schModal.data.target_group || "Post 1"}
              onChange={(e) =>
                setSchModal((m) => ({
                  ...m,
                  data: { ...m.data, target_group: e.target.value },
                }))
              }
            >
              {GROUPS.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </Field>
        </FormRow>
        <FormRow>
          <Field label="Jam (UTC, kurangi 7 untuk WIB)">
            <input
              type="number"
              min={0}
              max={23}
              className={inputCls}
              value={schModal.data.hour_utc ?? 9}
              onChange={(e) =>
                setSchModal((m) => ({
                  ...m,
                  data: { ...m.data, hour_utc: parseInt(e.target.value, 10) },
                }))
              }
            />
            <div className="mt-1 text-[10px] text-fg-500">
              {schModal.data.hour_utc !== undefined &&
                `= ${String(((schModal.data.hour_utc ?? 0) + 7) % 24).padStart(2, "0")}:00 WIB`}
            </div>
          </Field>
          <Field label="Mode Konten">
            <select
              className={inputCls}
              value={schModal.data.content_mode || "random"}
              onChange={(e) =>
                setSchModal((m) => ({
                  ...m,
                  data: { ...m.data, content_mode: e.target.value },
                }))
              }
            >
              <option value="random">Random (least-used first)</option>
              <option value="specific">Specific content</option>
            </select>
          </Field>
        </FormRow>
        {schModal.data.content_mode === "specific" && (
          <Field label="Content (pilih dari Library)">
            <select
              className={inputCls}
              value={schModal.data.specific_content_id || ""}
              onChange={(e) =>
                setSchModal((m) => ({
                  ...m,
                  data: {
                    ...m.data,
                    specific_content_id: parseInt(e.target.value, 10) || null,
                  },
                }))
              }
            >
              <option value="">-- Pilih content --</option>
              {library
                .filter((l) => l.active)
                .map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
            </select>
          </Field>
        )}
        <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2 text-[11px] text-fg-400">
          ⚠ Vercel Hobby cron jalan harian. Untuk hourly, register di{" "}
          <a
            href="https://cron-job.org"
            target="_blank"
            rel="noreferrer"
            className="text-brand-sky"
          >
            cron-job.org
          </a>{" "}
          (free) → URL: <code className="rounded bg-bg-900 px-1">https://socmedanalytics.com/api/cron/auto-post?key=...</code>
        </div>
        <div className="flex justify-end gap-2 border-t border-bg-700 pt-4">
          <button
            onClick={() => setSchModal({ open: false, data: {} })}
            className="rounded-lg border border-bg-700 px-4 py-2 text-sm text-fg-300"
          >
            Batal
          </button>
          <button
            onClick={saveSchedule}
            className="rounded-lg bg-brand-sky px-6 py-2 text-sm font-bold text-bg-900"
          >
            {schModal.data.id ? "Simpan" : "Tambah"}
          </button>
        </div>
      </Modal>
    </PageShell>
  );
}
