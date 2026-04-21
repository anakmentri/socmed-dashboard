"use client";
import { useState } from "react";
import { PageShell } from "@/components/PageShell";
import { DateNav } from "@/components/DateNav";
import { Modal, FormRow, Field, inputCls } from "@/components/Modal";

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
import { useToast } from "@/components/Toast";
import { useSession } from "@/hooks/useSession";
import { supabase } from "@/lib/supabase";
import { ReportItem } from "@/lib/types";
import { getDefaultTeam } from "@/lib/auth";
import { today, packReportContent, unpackReportContent, logAs } from "@/lib/utils";
import { useCachedData } from "@/hooks/useCachedData";
import { invalidateCache } from "@/lib/cache";

const empty: ReportItem = {
  date: today(),
  name: "",
  platform: "Instagram",
  type: "post",
  desc: "",
  links: [],
  image: "",
  notes: "",
};

type Row = ReportItem & { id: number };

export default function ReportPage() {
  const { session } = useSession();
  const { toast } = useToast();
  const [date, setDate] = useState(today());
  const [modal, setModal] = useState<{ open: boolean; idx: number; data: ReportItem; linksText: string }>({
    open: false,
    idx: -1,
    data: empty,
    linksText: "",
  });
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const isMember = session?.role === "member";
  const myName = session?.memberName || "";

  const cacheKey = `report_${date}_${isMember ? myName : "all"}`;
  const { data: rowsCached, refresh, loading, isStale } = useCachedData<Row[]>({
    key: cacheKey,
    fetcher: async () => {
      let q = supabase.from("report_items").select("*").eq("date", date);
      if (isMember) q = q.eq("name", myName);
      const { data } = await q;
      return ((data || []) as Array<{ id: number; date: string; name: string; title?: string; content: string; category?: string }>).map((r) => {
        const u = unpackReportContent(r.content);
        return {
          id: r.id,
          date: r.date,
          name: r.name,
          platform: u.platform || r.title || "",
          type: (r.category as "post" | "komentar") || "post",
          desc: u.desc,
          links: u.links,
          image: u.image,
          notes: u.notes,
        };
      });
    },
  });
  const rows: Row[] = rowsCached || [];

  const load = async () => {
    invalidateCache(cacheKey);
    await refresh();
  };

  const openAdd = () =>
    setModal({
      open: true,
      idx: -1,
      data: { ...empty, date, name: isMember ? myName : "" },
      linksText: "",
    });
  const openEdit = (r: Row, i: number) =>
    setModal({ open: true, idx: i, data: { ...r }, linksText: r.links.join("\n") });
  const close = () => setModal((m) => ({ ...m, open: false }));

  const team = getDefaultTeam();

  // Quick Paste modal — bulk import URL aktifitas anggota
  const [paste, setPaste] = useState<{
    open: boolean;
    owner: string;
    desc: string;
    urlsText: string;
    processing: boolean;
  }>({ open: false, owner: "", desc: "", urlsText: "", processing: false });

  const openPaste = () =>
    setPaste({
      open: true,
      owner: isMember ? myName : "",
      desc: "",
      urlsText: "",
      processing: false,
    });
  const closePaste = () => setPaste((p) => ({ ...p, open: false }));

  const detectPlatform = (url: string): string => {
    const u = url.toLowerCase();
    if (u.includes("instagram.com") || u.includes("ig.me")) return "Instagram";
    if (u.includes("facebook.com") || u.includes("fb.com") || u.includes("fb.watch")) return "Facebook";
    if (u.includes("x.com") || u.includes("twitter.com")) return "X (Twitter)";
    if (u.includes("tiktok.com")) return "TikTok";
    if (u.includes("youtube.com") || u.includes("youtu.be")) return "YouTube";
    if (u.includes("linkedin.com")) return "LinkedIn";
    if (u.includes("t.me") || u.includes("telegram")) return "Telegram";
    if (u.includes("semprot")) return "Semprot";
    return "Instagram";
  };

  // Group URLs by platform → 1 entri report per platform
  const runPaste = async () => {
    if (!paste.owner) return toast("Pilih anggota dulu", true);
    const urls = paste.urlsText
      .split(/[\n,\s]+/)
      .map((s) => s.trim())
      .filter((s) => /^https?:\/\//.test(s));
    if (urls.length === 0) return toast("Tidak ada URL valid", true);

    setPaste((p) => ({ ...p, processing: true }));
    // Kelompokkan per platform
    const byPlatform: Record<string, string[]> = {};
    for (const url of urls) {
      const pl = detectPlatform(url);
      (byPlatform[pl] = byPlatform[pl] || []).push(url);
    }

    let inserted = 0;
    for (const [platform, links] of Object.entries(byPlatform)) {
      const desc = paste.desc.trim() || `Auto-import ${links.length} link dari ${platform}`;
      const payload = {
        date,
        name: paste.owner,
        title: platform,
        content: packReportContent({
          desc,
          links,
          image: "",
          notes: "",
          platform,
        }),
        category: "post" as const,
      };
      const { error } = await supabase.from("report_items").insert(payload);
      if (!error) inserted++;
    }

    logAs(
      session,
      "Bulk Import Report",
      "Report",
      `${inserted} platform, ${urls.length} link untuk ${paste.owner}`
    );
    toast(`${inserted} entri dibuat dari ${urls.length} URL`);
    setPaste((p) => ({ ...p, processing: false, open: false }));
    load();
  };

  const handleImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return toast("Maks 2 MB", true);
    const reader = new FileReader();
    reader.onload = () =>
      setModal((m) => ({ ...m, data: { ...m.data, image: String(reader.result || "") } }));
    reader.readAsDataURL(file);
  };

  const linkCount = modal.linksText
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l).length;

  const save = async () => {
    const d = modal.data;
    const links = modal.linksText
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l);
    if (!d.name) return toast("Anggota tim wajib dipilih", true);
    if (!d.desc) return toast("Deskripsi kerjaan wajib", true);

    const payload = {
      date: d.date,
      name: d.name,
      title: d.platform,
      content: packReportContent({ ...d, links }),
      category: d.type,
    };

    if (modal.idx < 0) {
      const { error } = await supabase.from("report_items").insert(payload);
      if (error) return toast(error.message, true);
      logAs(session, `Tambah Report ${d.type}`, "Report", `${d.platform} · ${d.name} (${links.length} link)`);
      toast("Report ditambahkan");
    } else {
      const { error } = await supabase
        .from("report_items")
        .update(payload)
        .eq("id", rows[modal.idx].id);
      if (error) return toast(error.message, true);
      logAs(session, `Edit Report ${d.type}`, "Report", `${d.platform} · ${d.name}`);
      toast("Report diperbarui");
    }
    close();
    load();
  };

  const remove = async (r: Row) => {
    if (!confirm("Hapus report ini?")) return;
    await supabase.from("report_items").delete().eq("id", r.id);
    logAs(session, "Hapus Report", "Report", `${r.platform} · ${r.name}`);
    toast("Report dihapus");
    load();
  };

  return (
    <PageShell title="Report Kerjaan" desc="Laporan harian link & hasil posting per tanggal">
      <DateNav value={date} onChange={setDate} />
      <div className="mb-4 flex justify-between">
        <div className="text-sm text-fg-300">
          Total: <span className="font-bold text-fg-100">{rows.length}</span> report
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refresh}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-bg-700 bg-bg-800 px-3 py-2 text-xs text-fg-400 hover:border-bg-600 hover:text-fg-100 disabled:opacity-50"
          >
            <span className={loading ? "animate-spin" : ""}>🔄</span>
            {loading ? "..." : "Refresh"}
            {isStale && !loading && <span className="h-1.5 w-1.5 rounded-full bg-brand-amber" />}
          </button>
          <button
            onClick={openPaste}
            className="rounded-lg bg-gradient-to-r from-emerald-500 to-sky-500 px-4 py-2 text-sm font-bold text-white hover:opacity-90"
            title="Paste banyak URL sosmed, dashboard auto-record per platform"
          >
            ⚡ Quick Paste URL
          </button>
          <button
            onClick={openAdd}
            className="rounded-lg bg-brand-sky px-4 py-2 text-sm font-bold text-bg-900"
          >
            + Tambah Report
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {team
          .filter((t) => !isMember || t.name === myName)
          .map((t) => {
            const memberRows = rows
              .map((r, i) => ({ r, i }))
              .filter(({ r }) => r.name === t.name);
            const isOpen = !!expanded[t.name];
            const openAddFor = () =>
              setModal({
                open: true,
                idx: -1,
                data: { ...empty, date, name: t.name },
                linksText: "",
              });
            return (
              <div
                key={t.username}
                className="overflow-hidden rounded-xl border border-bg-700 bg-bg-800"
              >
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  <button
                    onClick={() => setExpanded((c) => ({ ...c, [t.name]: !isOpen }))}
                    className="flex flex-1 items-center gap-3 text-left"
                  >
                    <span className="text-fg-500">{isOpen ? "▼" : "▶"}</span>
                    <span
                      className="flex h-10 w-10 items-center justify-center rounded-lg text-sm font-bold text-white"
                      style={{ backgroundColor: t.color }}
                    >
                      {t.name[0]}
                    </span>
                    <div>
                      <div className="font-bold text-fg-100">{t.name}</div>
                      <div className="text-xs text-fg-500">{t.role}</div>
                    </div>
                  </button>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-fg-500">
                      <span className="font-bold text-fg-100">{memberRows.length}</span> report
                    </span>
                    <button
                      onClick={openAddFor}
                      className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/20"
                    >
                      + Tambah
                    </button>
                  </div>
                </div>
                <div className="h-0.5 w-full" style={{ backgroundColor: t.color }} />
                {isOpen && (
                  <div className="space-y-3 p-4">
                    {memberRows.length === 0 ? (
                      <div className="py-6 text-center text-sm text-fg-500">
                        Belum ada report hari ini
                      </div>
                    ) : (
                      memberRows.map(({ r, i }) => (
                        <div
                          key={r.id}
                          className="rounded-lg border border-bg-700 bg-bg-900 p-3"
                        >
                          <div className="mb-2 flex items-start justify-between gap-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded bg-bg-700 px-2 py-0.5 text-[10px] font-semibold text-fg-300">
                                {r.platform}
                              </span>
                              {r.type === "komentar" && (
                                <span className="rounded bg-indigo-950 px-2 py-0.5 text-[10px] font-bold text-brand-violet">
                                  💬 KOMENTAR
                                </span>
                              )}
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => openEdit(r, i)}
                                className="rounded bg-bg-700 px-3 py-1 text-xs text-brand-sky"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => remove(r)}
                                className="rounded bg-red-950/50 px-3 py-1 text-xs text-brand-rose"
                              >
                                Hapus
                              </button>
                            </div>
                          </div>
                          <p className="text-sm text-fg-300 whitespace-pre-wrap">{r.desc}</p>
                          {r.image && (
                            <img
                              src={r.image}
                              alt="screenshot"
                              className="mt-3 max-h-48 rounded-lg border border-bg-700"
                            />
                          )}
                          {r.links.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-1.5">
                              {r.links.map((lk, li) => (
                                <a
                                  key={li}
                                  href={lk}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="rounded border border-bg-700 bg-bg-900 px-2 py-1 text-[11px] text-brand-sky hover:border-brand-sky"
                                >
                                  🔗 {li + 1}. {lk.replace(/https?:\/\//, "").slice(0, 40)}
                                </a>
                              ))}
                            </div>
                          )}
                          {r.notes && (
                            <div className="mt-2 text-xs italic text-fg-500">📝 {r.notes}</div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
      </div>

      {/* Quick Paste URL Modal */}
      <Modal
        open={paste.open}
        onClose={closePaste}
        title="⚡ Quick Paste URL Sosmed"
        width={640}
      >
        <div className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-fg-200">
          💡 Paste banyak URL dari sosmed sekaligus (Instagram, X, TikTok, dll).
          Dashboard <strong>otomatis deteksi platform</strong> & buat report per platform.
        </div>

        <div className="mb-4">
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-fg-300">
            Anggota (pemegang report)
          </label>
          <select
            className={inputCls}
            value={paste.owner}
            disabled={isMember}
            onChange={(e) => setPaste((p) => ({ ...p, owner: e.target.value }))}
          >
            <option value="">-- Pilih anggota --</option>
            {team.map((t) => (
              <option key={t.username} value={t.name}>
                {t.name} ({t.role})
              </option>
            ))}
          </select>
        </div>

        <div className="mb-4">
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-fg-300">
            Deskripsi kerjaan (opsional)
          </label>
          <input
            className={inputCls}
            placeholder="Contoh: Posting promo April, komentar viral, dll"
            value={paste.desc}
            onChange={(e) => setPaste((p) => ({ ...p, desc: e.target.value }))}
          />
        </div>

        <div className="mb-4">
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-fg-300">
            URL Sosmed (satu per baris)
          </label>
          <textarea
            className={inputCls + " min-h-[180px] font-mono text-xs"}
            placeholder={`Paste URL di sini, satu per baris:

https://instagram.com/p/ABC123
https://x.com/user/status/456789
https://tiktok.com/@user/video/999
https://youtube.com/watch?v=xxx`}
            value={paste.urlsText}
            onChange={(e) => setPaste((p) => ({ ...p, urlsText: e.target.value }))}
          />
          <div className="mt-2 text-[11px] text-fg-500">
            {
              paste.urlsText
                .split(/[\n,\s]+/)
                .filter((u) => /^https?:\/\//.test(u.trim())).length
            }{" "}
            URL terdeteksi
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-bg-700 pt-4">
          <button
            onClick={closePaste}
            className="rounded-lg border border-bg-700 px-4 py-2 text-sm text-fg-300"
          >
            Batal
          </button>
          <button
            onClick={runPaste}
            disabled={paste.processing}
            className="rounded-lg bg-gradient-to-r from-emerald-500 to-sky-500 px-6 py-2 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
          >
            {paste.processing ? "Memproses..." : "⚡ Import Semua"}
          </button>
        </div>
      </Modal>

      <Modal
        open={modal.open}
        onClose={close}
        title={modal.idx < 0 ? "Tambah Report" : "Edit Report"}
      >
        <FormRow>
          <Field label="Tipe Report">
            <select
              className={inputCls}
              value={modal.data.type}
              onChange={(e) =>
                setModal((m) => ({
                  ...m,
                  data: { ...m.data, type: e.target.value as "post" | "komentar" },
                }))
              }
            >
              <option value="post">📱 Postingan</option>
              <option value="komentar">💬 Komentar</option>
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
        <div className="mb-4">
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-fg-300">
            Anggota Tim
          </label>
          <select
            className={inputCls}
            value={modal.data.name}
            disabled={isMember}
            onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, name: e.target.value } }))}
          >
            <option value="">-- Pilih anggota --</option>
            {team.map((t) => (
              <option key={t.username} value={t.name}>
                {t.name} ({t.role})
              </option>
            ))}
          </select>
        </div>
        <div className="mb-4">
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-fg-300">
            Deskripsi Kerjaan
          </label>
          <textarea
            className={inputCls + " min-h-[100px]"}
            placeholder="Apa yang dikerjakan..."
            value={modal.data.desc}
            onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, desc: e.target.value } }))}
          />
        </div>
        <div className="mb-4">
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-fg-300">
            Link Hasil <span className="text-brand-sky">({linkCount} link)</span>
          </label>
          <textarea
            className={inputCls + " min-h-[120px] font-mono text-xs"}
            value={modal.linksText}
            onChange={(e) => setModal((m) => ({ ...m, linksText: e.target.value }))}
            placeholder={"Paste semua link di sini, satu link per baris.\nContoh:\nhttps://x.com/post/123\nhttps://x.com/post/456"}
          />
        </div>
        <div className="mb-4">
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-fg-300">
            Screenshot / Gambar
          </label>
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-bg-700 bg-bg-900 px-4 py-6 text-center hover:border-brand-sky">
            {modal.data.image ? (
              <img src={modal.data.image} alt="preview" className="mb-2 max-h-40 rounded-lg" />
            ) : (
              <div className="mb-2 text-3xl">📷</div>
            )}
            <span className="text-xs text-fg-500">
              {modal.data.image ? "Klik untuk ganti gambar" : "Klik untuk upload gambar"}
            </span>
            <input type="file" accept="image/*" onChange={handleImage} className="hidden" />
          </label>
        </div>
        <div className="mb-4">
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-fg-300">
            Catatan
          </label>
          <input
            className={inputCls}
            placeholder="Opsional"
            value={modal.data.notes}
            onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, notes: e.target.value } }))}
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
