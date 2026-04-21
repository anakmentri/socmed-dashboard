"use client";
import { useState } from "react";
import { PageShell } from "@/components/PageShell";
import { DateNav } from "@/components/DateNav";
import { supabase } from "@/lib/supabase";
import { DailyWork, IrData, ReportItem } from "@/lib/types";
import { today, fN, initials, unpackReportContent } from "@/lib/utils";
import { getDefaultTeam } from "@/lib/auth";
import { useCachedData } from "@/hooks/useCachedData";

type ReportRow = ReportItem;

function SectionHeader({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <span className="h-5 w-1 rounded-full bg-brand-sky" />
        <h3 className="text-base font-bold text-fg-100">{title}</h3>
      </div>
      {right && <div className="text-xs text-fg-500">{right}</div>}
    </div>
  );
}

export default function OverviewPage() {
  const [date, setDate] = useState(today());
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const team = getDefaultTeam();

  const { data: overviewData, refresh, loading, isStale } = useCachedData<{
    dailyWork: DailyWork[];
    irData: IrData[];
    reports: ReportRow[];
  }>({
    key: `overview_${date}`,
    fetcher: async () => {
      const [dw, ir, ri] = await Promise.all([
        supabase.from("daily_work").select("*").eq("date", date),
        supabase.from("ir_data").select("*").eq("date", date),
        supabase.from("report_items").select("*").eq("date", date),
      ]);
      const rawReports = (ri.data || []) as Array<{
        id: number; date: string; name: string; title?: string; content: string; category?: string;
      }>;
      return {
        dailyWork: (dw.data as DailyWork[]) || [],
        irData: (ir.data as IrData[]) || [],
        reports: rawReports.map((r) => {
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
        }),
      };
    },
  });

  const dailyWork = overviewData?.dailyWork || [];
  const irData = overviewData?.irData || [];
  const reports = overviewData?.reports || [];

  const doneCount = dailyWork.filter((w) => w.status === "done").length;
  const totalAktivitas = dailyWork.length + reports.length + irData.length;
  const irDone = irData.filter((d) =>
    ["done", "selesai", "approved"].includes((d.status || "").toLowerCase())
  ).length;
  const totalSelesai = doneCount + reports.length + irDone;
  const totalLinks = reports.reduce((a, r) => a + (r.links?.length || 0), 0);
  const totalUpload = irData.reduce((a, d) => a + (d.realisasi || 0), 0);
  const totalViews = irData.reduce((a, d) => a + (d.output || 0), 0);

  const donePct = totalAktivitas ? Math.round((totalSelesai / totalAktivitas) * 100) : 0;

  const stats = [
    {
      label: "AKTIVITAS HARIAN",
      value: totalAktivitas,
      sub: `${dailyWork.length} kerja · ${reports.length} report · ${irData.length} input`,
      icon: "⚡",
      border: "border-l-brand-sky",
      text: "text-brand-sky",
      progress: null,
    },
    {
      label: "SELESAI",
      value: totalSelesai,
      sub: totalAktivitas ? `${donePct}% selesai` : "—",
      icon: "✓",
      border: "border-l-brand-emerald",
      text: "text-brand-emerald",
      progress: donePct,
    },
    {
      label: "REPORT POSTING",
      value: reports.length,
      sub: totalLinks ? `${totalLinks} link dikirim` : "—",
      icon: "📋",
      border: "border-l-brand-violet",
      text: "text-brand-violet",
      progress: null,
    },
    {
      label: "TOTAL VIEWS",
      value: fN(totalViews),
      sub: `${fN(totalUpload)} upload`,
      icon: "👁",
      border: "border-l-brand-amber",
      text: "text-brand-amber",
      progress: null,
    },
  ];


  const platformsInIr = Array.from(new Set(irData.map((d) => d.sosmed).filter(Boolean)));

  type Row = {
    anggota: string;
    platform: string;
    sumber: "Pengerjaan" | "Report" | "Input Report";
    desc: string;
    realisasi: string;
    output: string;
    link: string;
    status: string;
  };
  const allRows: Row[] = [
    ...dailyWork.map<Row>((w) => ({
      anggota: w.name,
      platform: w.platform || "-",
      sumber: "Pengerjaan",
      desc: w.activity || "-",
      realisasi: "",
      output: "",
      link: "",
      status: w.status,
    })),
    ...reports.map<Row>((r) => ({
      anggota: r.name,
      platform: r.platform || "-",
      sumber: "Report",
      desc: r.desc || "-",
      realisasi: "",
      output: (r.links?.length || 0) + " link",
      link: r.links?.[0] || "",
      status: r.type === "komentar" ? "komentar" : "post",
    })),
    ...irData.map<Row>((d) => ({
      anggota: d.anggota,
      platform: d.sosmed || "-",
      sumber: "Input Report",
      desc: d.tim || "-",
      realisasi: fN(d.realisasi || 0) + (d.realisasi_label ? " " + d.realisasi_label : ""),
      output: fN(d.output || 0) + (d.output_label ? " " + d.output_label : ""),
      link: "",
      status: d.status || "",
    })),
  ];

  const sumberStyle = (s: Row["sumber"]) =>
    s === "Pengerjaan"
      ? "bg-emerald-950 text-brand-emerald"
      : s === "Report"
      ? "bg-indigo-950 text-brand-violet"
      : "bg-amber-950/50 text-brand-amber";

  const statusBadge = (s: string) => {
    if (s === "done")
      return <span className="rounded bg-emerald-950 px-2 py-0.5 text-[10px] font-semibold text-brand-emerald">Selesai</span>;
    if (s === "progress")
      return <span className="rounded bg-amber-950/50 px-2 py-0.5 text-[10px] font-semibold text-brand-amber">Proses</span>;
    if (s === "pending")
      return <span className="rounded bg-bg-700 px-2 py-0.5 text-[10px] font-semibold text-fg-400">Pending</span>;
    if (!s) return <span className="text-fg-500">-</span>;
    return <span className="text-[11px] text-fg-400">{s}</span>;
  };

  return (
    <PageShell title="Dashboard Overview" desc="Ringkasan performa semua platform sosial media">
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <DateNav value={date} onChange={setDate} />
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="mb-4 flex items-center gap-1.5 rounded-lg border border-bg-700 bg-bg-800 px-3 py-2 text-xs text-fg-400 hover:border-bg-600 hover:text-fg-100 disabled:opacity-50"
          title={isStale ? "Data mungkin sudah lama" : "Data fresh"}
        >
          <span className={loading ? "animate-spin" : ""}>🔄</span>
          {loading ? "Refresh..." : "Refresh"}
          {isStale && !loading && <span className="h-1.5 w-1.5 rounded-full bg-brand-amber" />}
        </button>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className={`rounded-xl border border-bg-700 border-l-4 bg-bg-800 p-4 shadow-sm transition hover:shadow-md ${s.border}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className={`mb-2 text-[11px] font-bold uppercase tracking-wider ${s.text}`}>
                  {s.label}
                </div>
                <div className="text-2xl font-extrabold text-fg-100">{s.value}</div>
                {s.progress !== null ? (
                  <div className="mt-2 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg-700">
                      <div
                        className="h-full rounded-full bg-brand-emerald transition-all"
                        style={{ width: `${s.progress}%` }}
                      />
                    </div>
                    <span className="text-[10px] font-semibold text-fg-400">{s.progress}%</span>
                  </div>
                ) : (
                  <div className="mt-1 text-[11px] text-fg-500">{s.sub}</div>
                )}
              </div>
              <div className={`text-3xl opacity-30 ${s.text}`}>{s.icon}</div>
            </div>
          </div>
        ))}
      </div>

      {/* SB-Admin style: 2-panel chart row */}
      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Aktivitas Overview — bar chart per anggota */}
        <div className="rounded-xl border border-bg-700 bg-bg-800 lg:col-span-2">
          <div className="flex items-center justify-between border-b border-bg-700 px-5 py-3">
            <h4 className="text-sm font-bold text-brand-sky">📊 Aktivitas Overview</h4>
            <span className="text-xs text-fg-500">Per anggota · hari ini</span>
          </div>
          <div className="p-5">
            {(() => {
              const memberStats = team
                .map((t) => ({
                  name: t.name,
                  color: t.color,
                  count:
                    dailyWork.filter((w) => w.name === t.name).length +
                    reports.filter((r) => r.name === t.name).length +
                    irData.filter((d) => d.anggota === t.name).length,
                }))
                .filter((m) => m.count > 0)
                .sort((a, b) => b.count - a.count);
              const max = Math.max(1, ...memberStats.map((m) => m.count));
              if (memberStats.length === 0) {
                return (
                  <div className="py-12 text-center text-sm text-fg-500">
                    Belum ada aktivitas anggota hari ini
                  </div>
                );
              }
              return (
                <div className="space-y-2.5">
                  {memberStats.map((m) => {
                    const pct = Math.round((m.count / max) * 100);
                    return (
                      <div key={m.name} className="flex items-center gap-3">
                        <div className="w-20 truncate text-xs font-semibold text-fg-300">
                          {m.name}
                        </div>
                        <div className="flex-1 overflow-hidden rounded-full bg-bg-700">
                          <div
                            className="flex h-5 items-center justify-end rounded-full px-2 text-[10px] font-bold text-white transition-all"
                            style={{ width: `${pct}%`, backgroundColor: m.color, minWidth: "32px" }}
                          >
                            {m.count}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </div>

        {/* Platform Distribution — donut-like */}
        <div className="rounded-xl border border-bg-700 bg-bg-800">
          <div className="flex items-center justify-between border-b border-bg-700 px-5 py-3">
            <h4 className="text-sm font-bold text-brand-violet">🎯 Distribusi Sumber</h4>
          </div>
          <div className="p-5">
            {(() => {
              const sources = [
                { name: "Pengerjaan", count: dailyWork.length, color: "#34d399" },
                { name: "Report", count: reports.length, color: "#a78bfa" },
                { name: "Input Report", count: irData.length, color: "#fbbf24" },
              ].filter((s) => s.count > 0);
              const total = sources.reduce((a, s) => a + s.count, 0);
              if (total === 0) {
                return (
                  <div className="py-12 text-center text-sm text-fg-500">Belum ada data</div>
                );
              }
              // SVG donut
              const R = 60;
              const C = 2 * Math.PI * R;
              let offset = 0;
              return (
                <div className="flex flex-col items-center gap-4">
                  <svg width="160" height="160" viewBox="0 0 160 160">
                    <circle
                      cx="80"
                      cy="80"
                      r={R}
                      fill="none"
                      stroke="#1e293b"
                      strokeWidth="22"
                    />
                    {sources.map((s) => {
                      const len = (s.count / total) * C;
                      const circle = (
                        <circle
                          key={s.name}
                          cx="80"
                          cy="80"
                          r={R}
                          fill="none"
                          stroke={s.color}
                          strokeWidth="22"
                          strokeDasharray={`${len} ${C - len}`}
                          strokeDashoffset={-offset}
                          transform="rotate(-90 80 80)"
                        />
                      );
                      offset += len;
                      return circle;
                    })}
                    <text
                      x="80"
                      y="78"
                      textAnchor="middle"
                      className="fill-fg-100"
                      fontSize="22"
                      fontWeight="800"
                    >
                      {total}
                    </text>
                    <text
                      x="80"
                      y="96"
                      textAnchor="middle"
                      className="fill-fg-500"
                      fontSize="10"
                    >
                      TOTAL
                    </text>
                  </svg>
                  <div className="flex w-full flex-col gap-1.5 text-xs">
                    {sources.map((s) => (
                      <div key={s.name} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: s.color }}
                          />
                          <span className="text-fg-300">{s.name}</span>
                        </div>
                        <span className="font-semibold text-fg-100">
                          {s.count}{" "}
                          <span className="text-fg-500">
                            ({Math.round((s.count / total) * 100)}%)
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      </div>

      <SectionHeader
        title="Ringkasan Anggota"
        right={`${dailyWork.length} pengerjaan · ${reports.length} report · ${irData.length} input report`}
      />
      <div className="mb-8 space-y-3">
        {team.map((t) => {
          const uw = dailyWork.filter((w) => w.name === t.name);
          const ur = reports.filter((r) => r.name === t.name);
          const ui = irData.filter((d) => d.anggota === t.name);
          const total = uw.length + ur.length + ui.length;
          const ud = uw.filter((w) => w.status === "done").length;
          const urL = ur.reduce((a, r) => a + (r.links?.length || 0), 0);
          const uiR = ui.reduce((a, d) => a + (d.realisasi || 0), 0);
          const uiO = ui.reduce((a, d) => a + (d.output || 0), 0);
          const pct = uw.length ? Math.round((ud / uw.length) * 100) : 0;
          const pctColor = pct >= 80 ? "bg-brand-emerald" : pct >= 50 ? "bg-brand-amber" : "bg-brand-rose";
          const pctText = pct >= 80 ? "text-brand-emerald" : pct >= 50 ? "text-brand-amber" : "text-brand-rose";
          const isOpen = !!expanded[t.name];
          return (
            <div
              key={t.name}
              className="overflow-hidden rounded-xl border border-bg-700 bg-bg-800"
            >
              {/* Header */}
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
                    {initials(t.name)}
                  </span>
                  <div>
                    <div className="font-bold text-fg-100">{t.name}</div>
                    <div className="text-xs text-fg-500">{t.role}</div>
                  </div>
                </button>
                <div className="flex items-center gap-3">
                  <div className="flex flex-wrap gap-1.5">
                    {uw.length > 0 && (
                      <span className="rounded bg-emerald-950 px-2 py-0.5 text-[10px] font-semibold text-brand-emerald">
                        {ud}/{uw.length} kerja
                      </span>
                    )}
                    {ur.length > 0 && (
                      <span className="rounded bg-indigo-950 px-2 py-0.5 text-[10px] font-semibold text-brand-violet">
                        {ur.length} report
                      </span>
                    )}
                    {urL > 0 && (
                      <span className="rounded bg-bg-900 px-2 py-0.5 text-[10px] font-semibold text-brand-sky">
                        {urL} link
                      </span>
                    )}
                    {uiR > 0 && (
                      <span className="rounded bg-bg-700 px-2 py-0.5 text-[10px] font-semibold text-brand-amber">
                        {fN(uiR)} upload
                      </span>
                    )}
                    {uiO > 0 && (
                      <span className="rounded bg-bg-700 px-2 py-0.5 text-[10px] font-semibold text-brand-sky">
                        {fN(uiO)} views
                      </span>
                    )}
                    {total === 0 && (
                      <span className="rounded-full border border-bg-700 px-2 py-0.5 text-[9px] text-fg-600">
                        kosong
                      </span>
                    )}
                  </div>
                  {uw.length > 0 && (
                    <div className="flex w-20 items-center gap-1.5">
                      <div className="h-1 flex-1 overflow-hidden rounded bg-bg-700">
                        <div className={`h-full rounded ${pctColor}`} style={{ width: pct + "%" }} />
                      </div>
                      <span className={`text-[10px] font-bold ${pctText}`}>{pct}%</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="h-0.5 w-full" style={{ backgroundColor: t.color }} />

              {isOpen && (
                <div className="p-4">
                  {total === 0 ? (
                    <div className="py-4 text-center text-sm text-fg-500">
                      Belum ada aktivitas hari ini
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Pengerjaan */}
                      {uw.length > 0 && (
                        <div>
                          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-fg-500">
                            Pengerjaan ({ud}/{uw.length} selesai)
                          </div>
                          <div className="space-y-1.5">
                            {uw.map((w) => (
                              <div key={w.id} className="flex items-center gap-3 rounded-lg border border-bg-700 bg-bg-900 px-3 py-2">
                                <span className={`rounded px-2 py-0.5 text-[10px] font-semibold ${
                                  w.status === "done" ? "bg-emerald-950 text-brand-emerald" :
                                  w.status === "progress" ? "bg-amber-950/50 text-brand-amber" :
                                  "bg-bg-700 text-fg-400"
                                }`}>
                                  {w.status === "done" ? "Selesai" : w.status === "progress" ? "Proses" : "Pending"}
                                </span>
                                <span className="text-xs text-fg-300">{w.platform}</span>
                                <span className="flex-1 truncate text-xs text-fg-200">{w.activity}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Report */}
                      {ur.length > 0 && (
                        <div>
                          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-fg-500">
                            Report ({ur.length} report · {urL} link)
                          </div>
                          <div className="space-y-1.5">
                            {ur.map((r) => (
                              <div key={r.id} className="rounded-lg border border-bg-700 bg-bg-900 px-3 py-2">
                                <div className="flex items-center gap-2">
                                  <span className="rounded bg-indigo-950 px-2 py-0.5 text-[10px] font-semibold text-brand-violet">
                                    {r.type === "komentar" ? "Komentar" : "Postingan"}
                                  </span>
                                  <span className="text-xs text-fg-300">{r.platform}</span>
                                  {(r.links?.length || 0) > 0 && (
                                    <span className="text-[10px] text-brand-sky">{r.links.length} link</span>
                                  )}
                                </div>
                                <div className="mt-1 truncate text-xs text-fg-400">{r.desc}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Input Report */}
                      {ui.length > 0 && (
                        <div>
                          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-fg-500">
                            Input Report ({fN(uiR)} upload · {fN(uiO)} views)
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-[10px] uppercase text-fg-500">
                                  <th className="px-2 py-1.5 text-left">Platform</th>
                                  <th className="px-2 py-1.5 text-left">Tim</th>
                                  <th className="px-2 py-1.5 text-right">Upload</th>
                                  <th className="px-2 py-1.5 text-right">Views</th>
                                  <th className="px-2 py-1.5 text-left">Status</th>
                                </tr>
                              </thead>
                              <tbody>
                                {ui.map((d) => (
                                  <tr key={d.id} className="border-t border-bg-700/50">
                                    <td className="px-2 py-1.5 text-fg-200">{d.sosmed || "-"}</td>
                                    <td className="px-2 py-1.5 text-fg-400">{d.tim || "-"}</td>
                                    <td className="px-2 py-1.5 text-right font-semibold text-brand-violet">{fN(d.realisasi || 0)}</td>
                                    <td className="px-2 py-1.5 text-right font-semibold text-brand-sky">{fN(d.output || 0)}</td>
                                    <td className="px-2 py-1.5 text-fg-400">{d.status || "-"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {platformsInIr.length > 0 && (
        <>
          <SectionHeader title="Ringkasan per Platform (Input Report)" />
          <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
            {platformsInIr.map((p) => {
              const pIr = irData.filter((d) => d.sosmed === p);
              const pReal = pIr.reduce((a, d) => a + (d.realisasi || 0), 0);
              const pOut = pIr.reduce((a, d) => a + (d.output || 0), 0);
              const members = Array.from(new Set(pIr.map((d) => d.anggota)));
              return (
                <div
                  key={p}
                  className="rounded-xl border border-bg-700 bg-bg-800 p-4 transition hover:border-bg-600"
                >
                  <div className="mb-3 text-sm font-bold text-fg-100">{p}</div>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-fg-500">Upload</span>
                    <strong className="text-brand-violet">{fN(pReal)}</strong>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-fg-500">Views</span>
                    <strong className="text-brand-sky">{fN(pOut)}</strong>
                  </div>
                  <div className="mt-3 border-t border-bg-700 pt-2 text-[10px] text-fg-600">
                    {members.join(", ")}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <SectionHeader title="Semua Data Sosmed Anggota" right={`${allRows.length} data`} />
      <div className="overflow-hidden rounded-xl border border-bg-700 bg-bg-800">
        <div className="max-h-[60vh] overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 z-10 bg-bg-900 shadow-sm">
              <tr className="text-[11px] uppercase tracking-wider text-fg-500">
                <th className="border-b border-bg-700 px-4 py-3">Anggota</th>
                <th className="border-b border-bg-700 px-2 py-3">Platform</th>
                <th className="border-b border-bg-700 px-2 py-3">Sumber</th>
                <th className="border-b border-bg-700 px-2 py-3">Aktivitas / Deskripsi</th>
                <th className="border-b border-bg-700 px-2 py-3 text-right">Realisasi</th>
                <th className="border-b border-bg-700 px-2 py-3 text-right">Output</th>
                <th className="border-b border-bg-700 px-2 py-3">Link</th>
                <th className="border-b border-bg-700 px-2 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {allRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-16 text-center">
                    <div className="mb-3 text-5xl opacity-50">📊</div>
                    <div className="mb-1 text-sm font-semibold text-fg-300">Belum ada data</div>
                    <div className="text-xs text-fg-500">
                      Data akan muncul saat anggota mengisi pengerjaan/report/input report
                    </div>
                  </td>
                </tr>
              ) : (
                allRows.map((r, i) => {
                  const tObj = team.find((t) => t.name === r.anggota);
                  const color = tObj?.color || "#64748b";
                  return (
                    <tr
                      key={i}
                      className={`group border-t border-bg-700/30 transition hover:bg-bg-900/60 ${
                        i % 2 === 0 ? "bg-bg-800" : "bg-bg-800/60"
                      }`}
                    >
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <div
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-[10px] font-bold text-white shadow-sm transition group-hover:scale-110"
                            style={{ background: color }}
                          >
                            {initials(r.anggota)}
                          </div>
                          <span className="text-xs font-semibold text-fg-100">{r.anggota}</span>
                        </div>
                      </td>
                      <td className="px-2 py-2.5 text-xs text-fg-300">{r.platform}</td>
                      <td className="px-2 py-2.5">
                        <span className={`rounded px-2 py-0.5 text-[10px] font-semibold ${sumberStyle(r.sumber)}`}>
                          {r.sumber}
                        </span>
                      </td>
                      <td className="max-w-[240px] truncate px-2 py-2.5 text-xs text-fg-300" title={r.desc}>
                        {r.desc}
                      </td>
                      <td className="px-2 py-2.5 text-right text-xs font-semibold text-brand-violet">
                        {r.realisasi || <span className="text-fg-600">-</span>}
                      </td>
                      <td className="px-2 py-2.5 text-right text-xs font-semibold text-brand-sky">
                        {r.output || <span className="text-fg-600">-</span>}
                      </td>
                      <td className="px-2 py-2.5">
                        {r.link ? (
                          <a
                            href={r.link}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 rounded-full bg-brand-sky/10 px-2 py-0.5 text-[10px] font-semibold text-brand-sky hover:bg-brand-sky/20"
                          >
                            🔗 Buka
                          </a>
                        ) : (
                          <span className="text-fg-600">-</span>
                        )}
                      </td>
                      <td className="px-2 py-2.5">{statusBadge(r.status)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </PageShell>
  );
}
