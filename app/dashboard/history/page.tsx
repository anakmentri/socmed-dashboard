"use client";
import { useState } from "react";
import { PageShell } from "@/components/PageShell";
import { DateNav } from "@/components/DateNav";
import { supabase } from "@/lib/supabase";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import { today, initials, unpackReportContent, fN } from "@/lib/utils";
import { useCachedData } from "@/hooks/useCachedData";

type Entry = {
  id: string;
  time: string;
  who: string;
  role: string;
  color: string;
  action: string;
  actionColor: string;
  source: string;
  detail: string;
  ts: string;
};

export default function HistoryPage() {
  const { team } = useTeamMembers();
  const [date, setDate] = useState(today());
  const [rangeDays, setRangeDays] = useState<1 | 7 | 30>(1);
  const [userFilter, setUserFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [search, setSearch] = useState("");

  // Compute date range based on selected window
  const dateFrom = (() => {
    if (rangeDays === 1) return date;
    const d = new Date(date);
    d.setDate(d.getDate() - (rangeDays - 1));
    return d.toISOString().slice(0, 10);
  })();
  const dateTo = date; // inclusive end
  // For DB queries with timestamptz columns, need full day range
  const tsFrom = `${dateFrom}T00:00:00`;
  const tsToExclusive = (() => {
    const d = new Date(dateTo);
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10) + "T00:00:00";
  })();

  const {
    data: entries,
    loading,
    refresh,
    isStale,
  } = useCachedData<Entry[]>({
    key: `history_${dateFrom}_${dateTo}`,
    fetcher: async () => {
      // Filter di DB level untuk efficiency + tidak miss entries karena 1000-row limit
      const [dw, ri, ir, as_, sa, lg] = await Promise.all([
        supabase.from("daily_work").select("*").gte("date", dateFrom).lte("date", dateTo),
        supabase.from("report_items").select("*").gte("date", dateFrom).lte("date", dateTo),
        supabase.from("ir_data").select("*").gte("date", dateFrom).lte("date", dateTo),
        supabase.from("assets").select("*").gte("created_at", tsFrom).lt("created_at", tsToExclusive).limit(2000),
        supabase.from("soc_accounts").select("*").gte("created_at", tsFrom).lt("created_at", tsToExclusive).limit(2000),
        supabase.from("activity_log").select("*").gte("created_at", tsFrom).lt("created_at", tsToExclusive).order("created_at", { ascending: false }).limit(5000),
      ]);

      const out: Entry[] = [];
      const getMember = (name: string) => team.find((t) => t.name === name);
      const fmtTime = (ts?: string) => {
        if (!ts || ts.length <= 10) return "—";
        const d = new Date(ts);
        if (isNaN(d.getTime())) return "—";
        return (
          String(d.getHours()).padStart(2, "0") +
          ":" +
          String(d.getMinutes()).padStart(2, "0") +
          ":" +
          String(d.getSeconds()).padStart(2, "0")
        );
      };

      // Daily work
      ((dw.data || []) as Array<{
        id: number; date: string; name: string; platform: string;
        activity: string; status: string; created_at?: string;
      }>).forEach((w) => {
        const m = getMember(w.name);
        const act =
          w.status === "done" ? "Selesai Pengerjaan" :
          w.status === "progress" ? "Proses Pengerjaan" : "Tambah Pengerjaan";
        out.push({
          id: "dw-" + w.id,
          time: fmtTime(w.created_at),
          who: w.name,
          role: m?.role || "Anggota",
          color: m?.color || "#64748b",
          action: act,
          actionColor: w.status === "done" ? "text-brand-emerald" : "text-brand-amber",
          source: "Pengerjaan",
          detail: `Platform: ${w.platform || "-"} | ${w.activity || "-"}`,
          ts: w.created_at || w.date,
        });
      });

      // Reports
      ((ri.data || []) as Array<{
        id: number; date: string; name: string; title?: string;
        content: string; category?: string; created_at?: string;
      }>).forEach((r) => {
        const u = unpackReportContent(r.content);
        const m = getMember(r.name);
        const linkCount = u.links?.length || 0;
        out.push({
          id: "ri-" + r.id,
          time: fmtTime(r.created_at),
          who: r.name,
          role: m?.role || "Anggota",
          color: m?.color || "#64748b",
          action: "Tambah Report",
          actionColor: "text-brand-violet",
          source: "Report",
          detail: `Tipe: ${r.category || "post"} | Untuk: ${r.name} | Platform: ${u.platform || r.title || "-"} | ${r.category || "post"} ${linkCount ? `| ${linkCount} link` : ""}`,
          ts: r.created_at || r.date,
        });
      });

      // Input Report
      ((ir.data || []) as Array<{
        id: number; date: string; anggota: string; sosmed: string;
        tim: string; realisasi: number; output: number; status: string;
        created_at?: string;
      }>).forEach((d) => {
        const m = getMember(d.anggota);
        out.push({
          id: "ir-" + d.id,
          time: fmtTime(d.created_at),
          who: d.anggota,
          role: m?.role || "Anggota",
          color: m?.color || "#64748b",
          action: "Tambah Input Report",
          actionColor: "text-brand-amber",
          source: "Input Report",
          detail: `Anggota: ${d.anggota} | Platform: ${d.sosmed || "-"} | Tim: ${d.tim || "-"} | Realisasi: ${fN(d.realisasi || 0)} | Output: ${fN(d.output || 0)} | Tanggal: ${d.date}`,
          ts: d.created_at || d.date,
        });
      });

      // Assets — sudah di-filter di DB level
      ((as_.data || []) as Array<{
        id: number; name: string; type: string; uploaded_by: string; created_at?: string;
      }>).forEach((a) => {
        const m = getMember(a.uploaded_by);
        out.push({
          id: "as-" + a.id,
          time: fmtTime(a.created_at),
          who: a.uploaded_by || "-",
          role: m?.role || "Anggota",
          color: m?.color || "#64748b",
          action: "Upload Asset",
          actionColor: "text-brand-sky",
          source: "Asset Library",
          detail: `Asset: ${a.type || "foto"} ${a.name || "-"}`,
          ts: a.created_at || "",
        });
      });

      // Soc accounts — sudah di-filter di DB level
      ((sa.data || []) as Array<{
        id: number; owner: string; platform: string; username: string;
        email?: string; created_at?: string;
      }>).forEach((s) => {
        const m = getMember(s.owner);
        out.push({
          id: "sa-" + s.id,
          time: fmtTime(s.created_at),
          who: s.owner || "-",
          role: m?.role || "Anggota",
          color: m?.color || "#64748b",
          action: "Tambah Akun Sosmed",
          actionColor: "text-brand-sky",
          source: "Akun Sosmed",
          detail: `Owner: ${s.owner} | Platform: ${s.platform || "-"} | Email: ${s.email || "-"}`,
          ts: s.created_at || "",
        });
      });

      // Activity log — sudah di-filter di DB level
      ((lg.data || []) as Array<{
        id: number; who: string; role?: string; source?: string; action: string; detail: string; created_at?: string;
      }>).forEach((l) => {
        const m = getMember(l.who);
        const ac = (l.action || "").toLowerCase();
        const actionColor =
          ac.includes("tambah") || ac.includes("login") || ac.includes("aktif")
            ? "text-brand-emerald"
            : ac.includes("edit") || ac.includes("set")
            ? "text-brand-amber"
            : ac.includes("hapus") || ac.includes("banned") || ac.includes("logout")
            ? "text-brand-rose"
            : "text-brand-sky";
        out.push({
          id: "lg-" + l.id,
          time: fmtTime(l.created_at),
          who: l.who,
          role: l.role || m?.role || "Anggota",
          color: m?.color || "#64748b",
          action: l.action,
          actionColor,
          source: l.source || "Lainnya",
          detail: l.detail,
          ts: l.created_at || "",
        });
      });

      // Deduplikasi kalau ada entry identik
      const seen = new Set<string>();
      const deduped = out.filter((e) => {
        const key = `${e.ts}|${e.who}|${e.action}|${e.detail}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      deduped.sort((a, b) => (a.ts < b.ts ? 1 : -1));
      return deduped;
    },
  });

  const filtered = (entries || []).filter((r) => {
    if (userFilter && r.who !== userFilter) return false;
    if (actionFilter && !r.action.toLowerCase().includes(actionFilter.toLowerCase())) return false;
    if (sourceFilter && r.source !== sourceFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !r.who.toLowerCase().includes(q) &&
        !r.action.toLowerCase().includes(q) &&
        !r.detail.toLowerCase().includes(q) &&
        !r.role.toLowerCase().includes(q) &&
        !(r.source || "").toLowerCase().includes(q)
      )
        return false;
    }
    return true;
  });

  const users = [...new Set((entries || []).map((r) => r.who).filter(Boolean))].sort();
  const actions = [...new Set((entries || []).map((r) => r.action).filter(Boolean))].sort();
  const sources = [...new Set((entries || []).map((r) => r.source).filter(Boolean))].sort();

  // Per-source counts (for summary chip badges)
  const sourceCounts = (entries || []).reduce<Record<string, number>>((acc, e) => {
    const key = e.source || "Lainnya";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  // Per-user counts
  const userCounts = (entries || []).reduce<Record<string, number>>((acc, e) => {
    if (!e.who) return acc;
    acc[e.who] = (acc[e.who] || 0) + 1;
    return acc;
  }, {});

  return (
    <PageShell title="History Aktivitas" desc="Riwayat semua aktivitas anggota tim">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <DateNav value={date} onChange={setDate} />
        <div className="flex items-center gap-1 rounded-lg border border-bg-700 bg-bg-800 p-1 text-xs">
          {([1, 7, 30] as const).map((n) => (
            <button
              key={n}
              onClick={() => setRangeDays(n)}
              className={`rounded-md px-3 py-1.5 font-semibold transition ${
                rangeDays === n
                  ? "bg-brand-sky text-bg-900"
                  : "text-fg-400 hover:bg-bg-700 hover:text-fg-100"
              }`}
            >
              {n === 1 ? "Hari Ini" : `${n} Hari`}
            </button>
          ))}
        </div>
        {rangeDays > 1 && (
          <span className="text-[10px] text-fg-500">
            {dateFrom} → {dateTo}
          </span>
        )}
      </div>

      {/* Summary chips per source */}
      {(entries?.length || 0) > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            onClick={() => setSourceFilter("")}
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
              !sourceFilter
                ? "border-brand-sky bg-brand-sky/10 text-brand-sky"
                : "border-bg-700 bg-bg-800 text-fg-400 hover:border-bg-600"
            }`}
          >
            Semua <span className="ml-1 text-fg-500">{entries?.length || 0}</span>
          </button>
          {Object.entries(sourceCounts)
            .sort((a, b) => b[1] - a[1])
            .map(([src, cnt]) => (
              <button
                key={src}
                onClick={() => setSourceFilter(src === sourceFilter ? "" : src)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                  sourceFilter === src
                    ? "border-brand-violet bg-brand-violet/10 text-brand-violet"
                    : "border-bg-700 bg-bg-800 text-fg-300 hover:border-bg-600"
                }`}
              >
                {src} <span className="ml-1 text-fg-500">{cnt}</span>
              </button>
            ))}
        </div>
      )}

      {/* Per-anggota top contributors (kalau range > 1 hari) */}
      {rangeDays > 1 && Object.keys(userCounts).length > 0 && (
        <div className="mb-4 rounded-xl border border-bg-700 bg-bg-800 p-3">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-fg-500">
            Aktivitas per Anggota ({rangeDays} hari)
          </div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(userCounts)
              .sort((a, b) => b[1] - a[1])
              .map(([who, cnt]) => {
                const m = team.find((t) => t.name === who);
                const color = m?.color || "#64748b";
                return (
                  <button
                    key={who}
                    onClick={() => setUserFilter(who === userFilter ? "" : who)}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs transition ${
                      userFilter === who
                        ? "border-current"
                        : "border-bg-700 hover:border-bg-600"
                    }`}
                    style={{ color: userFilter === who ? color : undefined }}
                  >
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                    <span className="font-semibold text-fg-100">{who}</span>
                    <span className="text-fg-500">{cnt}</span>
                  </button>
                );
              })}
          </div>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-500">
            🔍
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari user, aksi, atau detail..."
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
        <select
          value={userFilter}
          onChange={(e) => setUserFilter(e.target.value)}
          className="rounded-lg border border-bg-700 bg-bg-800 px-4 py-2 text-sm text-fg-100 outline-none"
        >
          <option value="">Semua User</option>
          {users.map((u) => (
            <option key={u}>{u}</option>
          ))}
        </select>
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="rounded-lg border border-bg-700 bg-bg-800 px-4 py-2 text-sm text-fg-100 outline-none"
        >
          <option value="">Semua Aksi</option>
          {actions.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          className="rounded-lg border border-bg-700 bg-bg-800 px-4 py-2 text-sm text-fg-100 outline-none"
        >
          <option value="">Semua Sumber</option>
          {sources.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        {(userFilter || actionFilter || sourceFilter || search) && (
          <button
            onClick={() => {
              setUserFilter("");
              setActionFilter("");
              setSourceFilter("");
              setSearch("");
            }}
            className="rounded-lg border border-bg-700 bg-bg-800 px-3 py-2 text-xs text-fg-400 hover:bg-bg-700 hover:text-fg-100"
          >
            ✕ Reset
          </button>
        )}
        <span className="rounded-full bg-bg-800 border border-bg-700 px-3 py-1 text-xs text-fg-400">
          <strong className="text-fg-100">{filtered.length}</strong> aktivitas
        </span>
        <button
          onClick={refresh}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg border border-bg-700 bg-bg-800 px-3 py-2 text-xs text-fg-400 hover:border-bg-600 hover:text-fg-100 disabled:opacity-50"
          title={isStale ? "Data mungkin lama" : "Data fresh"}
        >
          <span className={loading ? "animate-spin" : ""}>🔄</span>
          {loading ? "..." : "Refresh"}
          {isStale && !loading && <span className="h-1.5 w-1.5 rounded-full bg-brand-amber" />}
        </button>
      </div>

      {loading ? (
        <div className="rounded-xl border border-bg-700 bg-bg-800 py-16 text-center">
          <div className="mb-3 inline-block h-8 w-8 animate-spin rounded-full border-2 border-brand-sky border-t-transparent" />
          <div className="text-sm text-fg-500">Memuat data aktivitas...</div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-bg-700 bg-bg-800">
          <div className="max-h-[70vh] overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 z-10 bg-bg-900 shadow-sm">
                <tr className="text-[10px] uppercase tracking-wider text-fg-500">
                  <th className="border-b border-bg-700 px-4 py-3 backdrop-blur">Jam</th>
                  {rangeDays > 1 && (
                    <th className="border-b border-bg-700 px-3 py-3 backdrop-blur">Tanggal</th>
                  )}
                  <th className="border-b border-bg-700 px-3 py-3 backdrop-blur">User</th>
                  <th className="border-b border-bg-700 px-3 py-3 backdrop-blur">Role</th>
                  <th className="border-b border-bg-700 px-3 py-3 backdrop-blur">Sumber</th>
                  <th className="border-b border-bg-700 px-3 py-3 backdrop-blur">Aksi</th>
                  <th className="border-b border-bg-700 px-4 py-3 backdrop-blur">Detail</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={rangeDays > 1 ? 7 : 6} className="px-4 py-16 text-center">
                      <div className="mb-3 text-5xl opacity-50">
                        {search || userFilter || actionFilter ? "🔍" : "📭"}
                      </div>
                      <div className="mb-1 text-sm font-semibold text-fg-300">
                        {search || userFilter || actionFilter
                          ? "Tidak ada hasil"
                          : "Belum ada aktivitas"}
                      </div>
                      <div className="text-xs text-fg-500">
                        {search || userFilter || actionFilter
                          ? "Coba ubah filter atau hapus pencarian"
                          : "Aktivitas akan muncul di sini saat ada perubahan di dashboard"}
                      </div>
                    </td>
                  </tr>
                ) : (
                  filtered.map((e, i) => (
                    <tr
                      key={e.id}
                      className={`group border-t border-bg-700/30 transition hover:bg-bg-900/60 ${
                        i % 2 === 0 ? "bg-bg-800" : "bg-bg-800/60"
                      }`}
                    >
                      <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-fg-100">
                        {e.time}
                      </td>
                      {rangeDays > 1 && (
                        <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[11px] text-fg-400">
                          {(e.ts || "").slice(0, 10) || "—"}
                        </td>
                      )}
                      <td className="whitespace-nowrap px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <div
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-[10px] font-bold text-white shadow-sm transition group-hover:scale-110"
                            style={{ background: e.color }}
                          >
                            {initials(e.who)}
                          </div>
                          <span className="text-xs font-semibold text-fg-100">{e.who}</span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs text-fg-500">
                        {e.role}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5">
                        <span className="rounded bg-bg-700 px-2 py-0.5 text-[10px] font-semibold text-fg-300">
                          {e.source || "—"}
                        </span>
                      </td>
                      <td className={`whitespace-nowrap px-3 py-2.5 text-xs font-bold ${e.actionColor}`}>
                        {e.action}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-fg-400 max-w-md truncate" title={e.detail}>
                        {e.detail}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </PageShell>
  );
}
