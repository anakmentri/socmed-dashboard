"use client";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/PageShell";
import { DateNav } from "@/components/DateNav";
import { supabase } from "@/lib/supabase";
import { getDefaultTeam } from "@/lib/auth";
import { today, initials, unpackReportContent, fN } from "@/lib/utils";

type Entry = {
  id: string;
  time: string;
  who: string;
  role: string;
  color: string;
  action: string;
  actionColor: string;
  detail: string;
  ts: string;
};

export default function HistoryPage() {
  const team = getDefaultTeam();
  const [date, setDate] = useState(today());
  const [entries, setEntries] = useState<Entry[]>([]);
  const [userFilter, setUserFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [dw, ri, ir, as_, sa, lg] = await Promise.all([
        supabase.from("daily_work").select("*").eq("date", date),
        supabase.from("report_items").select("*").eq("date", date),
        supabase.from("ir_data").select("*").eq("date", date),
        supabase.from("assets").select("*"),
        supabase.from("soc_accounts").select("*"),
        supabase.from("activity_log").select("*"),
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
          detail: `Anggota: ${d.anggota} | Platform: ${d.sosmed || "-"} | Tim: ${d.tim || "-"} | Realisasi: ${fN(d.realisasi || 0)} | Output: ${fN(d.output || 0)} | Tanggal: ${d.date}`,
          ts: d.created_at || d.date,
        });
      });

      // Assets
      ((as_.data || []) as Array<{
        id: number; name: string; type: string; uploaded_by: string; created_at?: string;
      }>).forEach((a) => {
        const aDate = (a.created_at || "").slice(0, 10);
        if (aDate !== date) return;
        const m = getMember(a.uploaded_by);
        out.push({
          id: "as-" + a.id,
          time: fmtTime(a.created_at),
          who: a.uploaded_by || "-",
          role: m?.role || "Anggota",
          color: m?.color || "#64748b",
          action: "Copy Caption Asset",
          actionColor: "text-brand-sky",
          detail: `Asset: ${a.type || "foto"} ${a.name || "-"}`,
          ts: a.created_at || "",
        });
      });

      // Soc accounts
      ((sa.data || []) as Array<{
        id: number; owner: string; platform: string; username: string;
        email?: string; created_at?: string;
      }>).forEach((s) => {
        const sDate = (s.created_at || "").slice(0, 10);
        if (sDate !== date) return;
        const m = getMember(s.owner);
        out.push({
          id: "sa-" + s.id,
          time: fmtTime(s.created_at),
          who: s.owner || "-",
          role: m?.role || "Anggota",
          color: m?.color || "#64748b",
          action: "Tambah Akun Sosmed",
          actionColor: "text-brand-sky",
          detail: `Owner: ${s.owner} | Platform: ${s.platform || "-"} | Email: ${s.email || "-"}`,
          ts: s.created_at || "",
        });
      });

      // Activity log dari Supabase
      ((lg.data || []) as Array<{
        id: number; who: string; role?: string; source?: string; action: string; detail: string; created_at?: string;
      }>).forEach((l) => {
        const lDate = (l.created_at || "").slice(0, 10);
        if (lDate !== date) return;
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
      setEntries(deduped);
      setLoading(false);
    };
    load();
  }, [date]);

  const filtered = entries.filter((r) => {
    if (userFilter && r.who !== userFilter) return false;
    if (actionFilter && !r.action.toLowerCase().includes(actionFilter.toLowerCase())) return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !r.who.toLowerCase().includes(q) &&
        !r.action.toLowerCase().includes(q) &&
        !r.detail.toLowerCase().includes(q) &&
        !r.role.toLowerCase().includes(q)
      )
        return false;
    }
    return true;
  });

  const users = [...new Set(entries.map((r) => r.who).filter(Boolean))].sort();
  const actions = [...new Set(entries.map((r) => r.action).filter(Boolean))].sort();

  return (
    <PageShell title="History Aktivitas" desc="Riwayat semua aktivitas anggota tim">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <DateNav value={date} onChange={setDate} />
      </div>

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
        {(userFilter || actionFilter || search) && (
          <button
            onClick={() => {
              setUserFilter("");
              setActionFilter("");
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
                  <th className="border-b border-bg-700 px-3 py-3 backdrop-blur">User</th>
                  <th className="border-b border-bg-700 px-3 py-3 backdrop-blur">Role</th>
                  <th className="border-b border-bg-700 px-3 py-3 backdrop-blur">Aksi</th>
                  <th className="border-b border-bg-700 px-4 py-3 backdrop-blur">Detail</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-16 text-center">
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
