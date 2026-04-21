"use client";
import { useState } from "react";
import { PageShell } from "@/components/PageShell";
import { Modal, FormRow, Field, inputCls } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { useSession } from "@/hooks/useSession";
import { supabase } from "@/lib/supabase";
import { Platform, IrData, ReportItem } from "@/lib/types";
import { fN, logAs, unpackReportContent } from "@/lib/utils";
import { useCachedData } from "@/hooks/useCachedData";
import { invalidateCache } from "@/lib/cache";

const empty: Platform = {
  name: "",
  icon: "",
  color: "ig-bg",
  followers: 0,
  following: 0,
  posts: 0,
  eng: 0,
  growth: 0,
  growth_pct: 0,
  hex: "#38bdf8",
};

export default function PlatformsPage() {
  const { toast } = useToast();
  const { session } = useSession();
  const [modal, setModal] = useState<{ open: boolean; idx: number; data: Platform }>({
    open: false,
    idx: -1,
    data: empty,
  });

  const { data: rowsCached, refresh, loading, isStale } = useCachedData<Platform[]>({
    key: "platforms_all",
    fetcher: async () => {
      const { data } = await supabase.from("platforms").select("*");
      return (data as Platform[]) || [];
    },
  });
  const rows: Platform[] = rowsCached || [];

  // Data kerjaan tim untuk auto-update stats per platform
  const { data: teamWork } = useCachedData<{
    reports: ReportItem[];
    irData: IrData[];
  }>({
    key: "platforms_team_work",
    fetcher: async () => {
      const [ri, ir] = await Promise.all([
        supabase
          .from("report_items")
          .select("*")
          .order("date", { ascending: false })
          .limit(2000),
        supabase
          .from("ir_data")
          .select("*")
          .order("date", { ascending: false })
          .limit(2000),
      ]);
      const reports = ((ri.data || []) as Array<{
        id: number;
        date: string;
        name: string;
        title?: string;
        content: string;
        category?: string;
      }>).map((r) => {
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
      return {
        reports,
        irData: (ir.data as IrData[]) || [],
      };
    },
  });

  const getPlatformStats = (platformName: string) => {
    const reports = (teamWork?.reports || []).filter((r) => r.platform === platformName);
    const ir = (teamWork?.irData || []).filter((d) => d.sosmed === platformName);
    const totalLinks = reports.reduce((a, r) => a + (r.links?.length || 0), 0);
    const totalUploads = ir.reduce((a, d) => a + (d.realisasi || 0), 0);
    const totalViews = ir.reduce((a, d) => a + (d.output || 0), 0);
    const today = new Date().toISOString().slice(0, 10);
    const todayReports = reports.filter((r) => r.date === today);
    const todayIr = ir.filter((d) => d.date === today);
    const todayUploads = todayIr.reduce((a, d) => a + (d.realisasi || 0), 0);
    const contributors = Array.from(
      new Set([...reports.map((r) => r.name), ...ir.map((d) => d.anggota)].filter(Boolean))
    );
    return {
      reportsCount: reports.length,
      totalLinks,
      totalUploads,
      totalViews,
      todayReportsCount: todayReports.length,
      todayUploads,
      contributors,
      lastActivity: [...reports.map((r) => r.date), ...ir.map((d) => d.date)].sort().reverse()[0],
    };
  };

  const load = async () => {
    invalidateCache("platforms_all");
    await refresh();
  };

  const openAdd = () => setModal({ open: true, idx: -1, data: empty });
  const openEdit = (r: Platform, i: number) => setModal({ open: true, idx: i, data: { ...r } });
  const close = () => setModal((m) => ({ ...m, open: false }));

  const save = async () => {
    const d = modal.data;
    if (!d.name) return toast("Nama platform wajib", true);
    const payload = { ...d };
    delete (payload as { id?: number }).id;
    if (modal.idx < 0) {
      const { error } = await supabase.from("platforms").insert(payload);
      if (error) return toast(error.message, true);
      logAs(session, "Tambah Platform", "Platform", `${d.name} · ${fN(d.followers)} followers`);
    } else {
      const { error } = await supabase.from("platforms").update(payload).eq("id", d.id!);
      if (error) return toast(error.message, true);
      logAs(session, "Edit Platform", "Platform", `${d.name}`);
    }
    toast("Platform tersimpan");
    close();
    load();
  };

  const remove = async (r: Platform) => {
    if (!confirm(`Hapus ${r.name}?`)) return;
    await supabase.from("platforms").delete().eq("id", r.id!);
    logAs(session, "Hapus Platform", "Platform", r.name);
    toast("Platform dihapus");
    load();
  };

  const removeAll = async () => {
    if (!confirm(`Hapus SEMUA ${rows.length} platform?`)) return;
    for (const r of rows) await supabase.from("platforms").delete().eq("id", r.id!);
    logAs(session, "Hapus Semua Platform", "Platform", `${rows.length} platform dihapus`);
    toast("Semua platform dihapus");
    load();
  };

  return (
    <PageShell title="Platform" desc="Kelola akun dan data setiap platform">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-bold text-fg-100">Kelola Platform</h3>
        <div className="flex gap-2">
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
            onClick={removeAll}
            className="rounded-lg border border-red-900 px-4 py-2 text-sm text-brand-rose hover:bg-red-950/20"
          >
            🗑 Hapus Semua
          </button>
          <button onClick={openAdd} className="rounded-lg bg-brand-sky px-4 py-2 text-sm font-bold text-bg-900">
            + Tambah Platform
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rows.length === 0 && (
          <div className="rounded-xl border border-dashed border-bg-700 bg-bg-900 p-8 text-center text-fg-500 md:col-span-2 xl:col-span-3">
            📦 Belum ada platform. Klik + Tambah Platform untuk menambahkan.
          </div>
        )}
        {rows.map((r, i) => {
          const ts = getPlatformStats(r.name);
          // Posts auto = report link + input report count
          const autoPosts = ts.totalLinks + ts.totalUploads;
          return (
            <div key={r.id} className="rounded-xl border border-bg-700 bg-bg-800 p-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <div
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-[10px] font-bold text-white"
                      style={{ backgroundColor: r.hex || "#38bdf8" }}
                    >
                      {r.icon || r.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="font-bold text-fg-100">{r.name}</div>
                  </div>
                  <div className="mt-1 text-xs text-fg-500">{fN(r.followers)} followers</div>
                </div>
                <div className="flex gap-1">
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
                    ×
                  </button>
                </div>
              </div>

              {/* Manual metrics */}
              <div className="mb-3 grid grid-cols-2 gap-2 text-xs">
                <div>
                  Engagement: <span className="font-bold text-brand-emerald">{r.eng}%</span>
                </div>
                <div>
                  Growth: <span className="font-bold text-brand-sky">+{fN(r.growth)}</span>
                </div>
                <div>
                  Following: <span className="font-bold">{fN(r.following)}</span>
                </div>
                <div>
                  Posts: <span className="font-bold">{fN(Math.max(r.posts, autoPosts))}</span>
                </div>
              </div>

              {/* AUTO — Team work stats */}
              <div className="rounded-lg border border-brand-sky/30 bg-brand-sky/5 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-brand-sky">
                    📊 Data dari Tim (Auto)
                  </span>
                  {ts.lastActivity && (
                    <span className="text-[9px] text-fg-500">
                      Terakhir: {ts.lastActivity}
                    </span>
                  )}
                </div>
                {ts.reportsCount === 0 && ts.totalUploads === 0 ? (
                  <div className="text-[11px] text-fg-500">
                    Belum ada kerjaan tim di platform ini
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div>
                        <span className="text-fg-500">📋 Reports:</span>{" "}
                        <span className="font-bold text-brand-violet">{ts.reportsCount}</span>
                      </div>
                      <div>
                        <span className="text-fg-500">🔗 Link:</span>{" "}
                        <span className="font-bold text-brand-sky">{fN(ts.totalLinks)}</span>
                      </div>
                      <div>
                        <span className="text-fg-500">⬆ Upload:</span>{" "}
                        <span className="font-bold text-brand-amber">{fN(ts.totalUploads)}</span>
                      </div>
                      <div>
                        <span className="text-fg-500">👁 Views:</span>{" "}
                        <span className="font-bold text-brand-emerald">{fN(ts.totalViews)}</span>
                      </div>
                    </div>
                    {(ts.todayReportsCount > 0 || ts.todayUploads > 0) && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {ts.todayReportsCount > 0 && (
                          <span className="rounded bg-violet-500/20 px-1.5 py-0.5 text-[9px] font-semibold text-brand-violet">
                            +{ts.todayReportsCount} report hari ini
                          </span>
                        )}
                        {ts.todayUploads > 0 && (
                          <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-semibold text-brand-amber">
                            +{fN(ts.todayUploads)} upload hari ini
                          </span>
                        )}
                      </div>
                    )}
                    {ts.contributors.length > 0 && (
                      <div className="mt-2 text-[10px] text-fg-500">
                        👥 Kontributor: {ts.contributors.join(", ")}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <Modal open={modal.open} onClose={close} title={modal.idx < 0 ? "Tambah Platform" : "Edit Platform"}>
        <FormRow>
          <Field label="Nama">
            <input
              className={inputCls}
              value={modal.data.name}
              onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, name: e.target.value } }))}
            />
          </Field>
          <Field label="Icon (2 huruf)">
            <input
              className={inputCls}
              value={modal.data.icon}
              maxLength={3}
              onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, icon: e.target.value } }))}
            />
          </Field>
        </FormRow>
        <FormRow>
          <Field label="Followers">
            <input
              type="number"
              className={inputCls}
              value={modal.data.followers}
              onChange={(e) =>
                setModal((m) => ({ ...m, data: { ...m.data, followers: +e.target.value } }))
              }
            />
          </Field>
          <Field label="Following">
            <input
              type="number"
              className={inputCls}
              value={modal.data.following}
              onChange={(e) =>
                setModal((m) => ({ ...m, data: { ...m.data, following: +e.target.value } }))
              }
            />
          </Field>
        </FormRow>
        <FormRow>
          <Field label="Engagement %">
            <input
              type="number"
              step="0.1"
              className={inputCls}
              value={modal.data.eng}
              onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, eng: +e.target.value } }))}
            />
          </Field>
          <Field label="Growth">
            <input
              type="number"
              className={inputCls}
              value={modal.data.growth}
              onChange={(e) =>
                setModal((m) => ({ ...m, data: { ...m.data, growth: +e.target.value } }))
              }
            />
          </Field>
        </FormRow>
        <FormRow>
          <Field label="Posts">
            <input
              type="number"
              className={inputCls}
              value={modal.data.posts}
              onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, posts: +e.target.value } }))}
            />
          </Field>
          <Field label="Hex Color">
            <input
              className={inputCls}
              value={modal.data.hex}
              onChange={(e) => setModal((m) => ({ ...m, data: { ...m.data, hex: e.target.value } }))}
            />
          </Field>
        </FormRow>
        <div className="flex justify-end gap-2 border-t border-bg-700 pt-4">
          <button onClick={close} className="rounded-lg border border-bg-700 px-4 py-2 text-sm text-fg-300">
            Batal
          </button>
          <button onClick={save} className="rounded-lg bg-brand-sky px-6 py-2 text-sm font-bold text-bg-900">
            Simpan
          </button>
        </div>
      </Modal>
    </PageShell>
  );
}
