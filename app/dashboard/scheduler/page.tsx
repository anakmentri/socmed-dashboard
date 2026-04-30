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
  media_url: string | null;
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

  const isAdmin = session?.role === "admin";
  const isMember = session?.role === "member";
  const myName = session?.memberName || (isAdmin ? "admin" : "");

  const [library, setLibrary] = useState<ContentItem[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    // Anggota: filter schedules by owner_name = myName
    // Admin: lihat semua
    let schQuery = supabase.from("post_schedules").select("*").order("hour_utc");
    if (isMember && myName) schQuery = schQuery.eq("owner_name", myName);

    const [lib, sch, rn] = await Promise.all([
      supabase.from("content_library").select("*").order("created_at", { ascending: false }),
      schQuery,
      supabase.from("scheduled_runs").select("*").order("ran_at", { ascending: false }).limit(50),
    ]);
    setLibrary((lib.data as ContentItem[]) || []);
    let schedulesData = (sch.data as Schedule[]) || [];
    let runsData = (rn.data as Run[]) || [];
    // Filter logs to schedules anggota saja
    if (isMember && myName) {
      const myScheduleIds = new Set(schedulesData.map((s) => s.id));
      runsData = runsData.filter(
        (r) => !r.schedule_id || myScheduleIds.has(r.schedule_id)
      );
    }
    setSchedules(schedulesData);
    setRuns(runsData);
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
      media_url: d.media_url?.trim() || null,
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
    // Vercel Hobby plan hard limit body 4.5MB. Untuk media lebih besar,
    // user harus pakai field 'Media URL' (link eksternal).
    const HARD_LIMIT = 4 * 1024 * 1024; // 4MB safe under 4.5MB Vercel limit
    if (file.size > HARD_LIMIT) {
      const mb = (file.size / 1024 / 1024).toFixed(1);
      return toast(
        `File ${mb}MB terlalu besar. Max 4MB untuk upload langsung. Untuk file lebih besar, upload ke imgbb.com atau imgur.com lalu paste URL-nya di field 'Media URL'.`,
        true
      );
    }
    const reader = new FileReader();
    reader.onload = () => {
      setLibModal((m) => ({
        ...m,
        data: { ...m.data, media_base64: String(reader.result || ""), media_url: "" },
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
          owner_name: isMember ? myName : "admin",
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
  // Format WIB hour:minute, e.g. "09:30 WIB"
  const wibTime = (utcHour: number, utcMinute: number) => {
    const h = (utcHour + 7) % 24;
    return `${String(h).padStart(2, "0")}:${String(utcMinute).padStart(2, "0")}`;
  };

  return (
    <PageShell
      title="Auto Post Scheduler"
      desc={
        isMember
          ? `Schedule auto-post untuk akun ${myName} — fire ke Post 1/2/3/Short otomatis`
          : "Schedule auto-post untuk semua anggota — fire ke Post 1/2/3/Short otomatis"
      }
    >
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
                        <span>🕐 {wibTime(s.hour_utc, s.minute || 0)} WIB</span>
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
                  {(c.media_base64 || c.media_url) && (
                    <div className="mb-2 relative">
                      {(() => {
                        const src = c.media_base64 || c.media_url || "";
                        const isVideo = src.startsWith("data:video") || /\.(mp4|mov|webm)$/i.test(src);
                        return isVideo ? (
                          <video src={src} className="max-h-32 w-full rounded object-cover" muted />
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={src}
                            alt=""
                            className="max-h-32 w-full rounded object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.opacity = "0.3";
                            }}
                          />
                        );
                      })()}
                      {c.media_url && !c.media_base64 && (
                        <span className="absolute top-1 right-1 rounded bg-bg-900/80 px-1 py-0.5 text-[8px] text-brand-sky">
                          🔗 URL
                        </span>
                      )}
                    </div>
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
            Media (opsional)
            <span className="ml-2 normal-case text-fg-500 font-normal">
              upload max 4MB ATAU paste URL untuk file besar
            </span>
          </label>

          {/* Option 1: Upload langsung (max 4MB karena Vercel Hobby limit) */}
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-bg-700 bg-bg-900 p-4 hover:border-brand-sky">
            {libModal.data.media_base64 ? (
              libModal.data.media_base64.startsWith("data:video") ? (
                <video src={libModal.data.media_base64} controls className="max-h-48 rounded" />
              ) : (
                <img src={libModal.data.media_base64} alt="" className="max-h-48 rounded" />
              )
            ) : (
              <div className="text-center">
                <div className="text-2xl mb-1">📷</div>
                <div className="text-xs text-fg-500">Klik upload foto/video</div>
                <div className="text-[10px] text-fg-600 mt-1">
                  Limit upload: <strong>4MB</strong> (Vercel Hobby plan).
                  <br />Untuk file lebih besar → pakai Media URL di bawah.
                </div>
              </div>
            )}
            <input
              type="file"
              accept="image/*,video/*"
              className="hidden"
              onChange={handleMediaUpload}
            />
          </label>
          {libModal.data.media_base64 && (
            <div className="mt-1 flex items-center gap-3">
              <span className="text-[10px] text-fg-500">
                Size: {((libModal.data.media_base64.length * 0.75) / 1024 / 1024).toFixed(1)}MB
                {libModal.data.media_base64.startsWith("data:video") && " · 🎬 Video"}
              </span>
              <button
                onClick={() =>
                  setLibModal((m) => ({ ...m, data: { ...m.data, media_base64: "" } }))
                }
                className="text-[10px] text-brand-rose hover:underline"
              >
                ✕ Hapus upload
              </button>
            </div>
          )}

          {/* Option 2: Media URL (untuk file besar / video panjang) */}
          <div className="mt-3">
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-fg-400">
              ATAU Media URL (untuk file lebih dari 4MB)
            </label>
            <input
              className={inputCls}
              placeholder="https://i.imgur.com/abc.jpg atau direct link foto/video lain"
              value={libModal.data.media_url || ""}
              onChange={(e) =>
                setLibModal((m) => ({
                  ...m,
                  data: { ...m.data, media_url: e.target.value, media_base64: "" },
                }))
              }
            />
            <div className="mt-1 text-[10px] text-fg-500">
              💡 Upload file besar ke{" "}
              <a
                href="https://imgbb.com"
                target="_blank"
                rel="noreferrer"
                className="text-brand-sky hover:underline"
              >
                imgbb.com
              </a>
              ,{" "}
              <a
                href="https://imgur.com"
                target="_blank"
                rel="noreferrer"
                className="text-brand-sky hover:underline"
              >
                imgur.com
              </a>
              , atau Telegram channel public → copy <strong>direct image URL</strong> → paste di sini.
            </div>
            {libModal.data.media_url && (
              <div className="mt-2 rounded border border-bg-700 bg-bg-900 p-2">
                {libModal.data.media_url.match(/\.(mp4|mov|webm)$/i) ? (
                  <video src={libModal.data.media_url} controls className="max-h-32 rounded" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={libModal.data.media_url}
                    alt="preview"
                    className="max-h-32 rounded"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                )}
              </div>
            )}
          </div>
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
              value={schModal.data.owner_name || (isMember ? myName : "admin")}
              disabled={isMember}
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
            {isMember && (
              <div className="mt-1 text-[10px] text-fg-500">
                Schedule akan jalan untuk akun kamu sendiri
              </div>
            )}
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
          <Field label="🕐 Jam Fire (WIB)">
            <input
              type="time"
              className={inputCls}
              value={(() => {
                // Convert hour_utc + minute → HH:MM WIB
                const utcHour = schModal.data.hour_utc ?? 9;
                const utcMin = schModal.data.minute ?? 0;
                const wibHour = (utcHour + 7) % 24;
                return `${String(wibHour).padStart(2, "0")}:${String(utcMin).padStart(2, "0")}`;
              })()}
              onChange={(e) => {
                // Parse HH:MM WIB → convert ke UTC untuk storage
                const [hStr, mStr] = e.target.value.split(":");
                const wibHour = parseInt(hStr, 10) || 0;
                const minute = parseInt(mStr, 10) || 0;
                // WIB = UTC + 7, jadi UTC = WIB - 7 (modulo 24)
                const utcHour = (wibHour - 7 + 24) % 24;
                setSchModal((m) => ({
                  ...m,
                  data: { ...m.data, hour_utc: utcHour, minute },
                }));
              }}
            />
            <div className="mt-1 text-[10px] text-fg-500">
              Pilih jam dalam zona WIB (Indonesia Barat). Sistem auto-convert ke UTC.
              {schModal.data.hour_utc !== undefined && (
                <span className="ml-1 text-fg-600">
                  · Internal: {String(schModal.data.hour_utc).padStart(2, "0")}:
                  {String(schModal.data.minute || 0).padStart(2, "0")} UTC
                </span>
              )}
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
