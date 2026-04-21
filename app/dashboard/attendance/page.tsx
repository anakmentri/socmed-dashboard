"use client";
import { useState } from "react";
import { PageShell } from "@/components/PageShell";
import { DateNav } from "@/components/DateNav";
import { useToast } from "@/components/Toast";
import { useSession } from "@/hooks/useSession";
import { getDefaultTeam } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { today, initials, logAs } from "@/lib/utils";
import { useCachedData } from "@/hooks/useCachedData";
import { setCached } from "@/lib/cache";

type Status = "kerja" | "izin" | "off";

type AttendanceRecord = {
  name: string;
  status: Status;
  note: string;
};

async function loadAttendance(date: string): Promise<Record<string, AttendanceRecord>> {
  try {
    const { data } = await supabase.from("attendance").select("*").eq("date", date);
    const out: Record<string, AttendanceRecord> = {};
    (data || []).forEach((r: { name: string; status: string; note?: string }) => {
      out[r.name] = { name: r.name, status: (r.status as Status) || "kerja", note: r.note || "" };
    });
    return out;
  } catch {
    return {};
  }
}

async function upsertAttendance(date: string, rec: AttendanceRecord) {
  await supabase.from("attendance").upsert(
    { date, name: rec.name, status: rec.status, note: rec.note, updated_at: new Date().toISOString() },
    { onConflict: "date,name" }
  );
}

const STATUS_OPTIONS: { value: Status; label: string; cls: string; icon: string }[] = [
  { value: "kerja", label: "Kerja", cls: "bg-emerald-950 text-brand-emerald border-emerald-500/40", icon: "💼" },
  { value: "izin", label: "Izin", cls: "bg-amber-950/50 text-brand-amber border-amber-500/40", icon: "📋" },
  { value: "off", label: "Off Day", cls: "bg-red-950/50 text-brand-rose border-red-500/40", icon: "🏠" },
];

export default function AttendancePage() {
  const { session } = useSession();
  const { toast } = useToast();
  const team = getDefaultTeam();
  const isAdmin = session?.role === "admin";
  const isMember = session?.role === "member";
  const myName = session?.memberName || "";

  const [date, setDate] = useState(today());
  const [editNote, setEditNote] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");

  const cacheKey = `attendance_${date}`;
  const {
    data: recordsData,
    refresh,
    loading,
    isStale,
    mutate,
  } = useCachedData<Record<string, AttendanceRecord>>({
    key: cacheKey,
    fetcher: () => loadAttendance(date),
  });
  const records = recordsData || {};
  const setRecords = (
    updater:
      | Record<string, AttendanceRecord>
      | ((prev: Record<string, AttendanceRecord>) => Record<string, AttendanceRecord>)
  ) => {
    const next =
      typeof updater === "function"
        ? (updater as (prev: Record<string, AttendanceRecord>) => Record<string, AttendanceRecord>)(records)
        : updater;
    mutate(next);
    setCached(cacheKey, next);
  };

  const setStatus = async (name: string, status: Status) => {
    const rec: AttendanceRecord = { name, status, note: records[name]?.note || "" };
    setRecords((r) => ({ ...r, [name]: rec }));
    await upsertAttendance(date, rec);
    const s = STATUS_OPTIONS.find((o) => o.value === status);
    logAs(session, `Set Kehadiran ${s?.label}`, "Kehadiran", `${name} pada ${date}`);
    toast(`${name}: ${s?.icon} ${s?.label}`);
  };

  const saveNote = async (name: string) => {
    const rec: AttendanceRecord = {
      name,
      status: records[name]?.status || "kerja",
      note: noteText,
    };
    setRecords((r) => ({ ...r, [name]: rec }));
    await upsertAttendance(date, rec);
    setEditNote(null);
    logAs(session, "Edit Catatan Kehadiran", "Kehadiran", `${name}: ${noteText}`);
    toast("Catatan disimpan");
  };

  const kerjaCount = team.filter((t) => (records[t.name]?.status || "kerja") === "kerja").length;
  const izinCount = team.filter((t) => records[t.name]?.status === "izin").length;
  const offCount = team.filter((t) => records[t.name]?.status === "off").length;

  return (
    <PageShell title="Kehadiran" desc="Status kehadiran anggota tim per hari">
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <DateNav value={date} onChange={setDate} />
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="mb-4 flex items-center gap-1.5 rounded-lg border border-bg-700 bg-bg-800 px-3 py-2 text-xs text-fg-400 hover:border-bg-600 hover:text-fg-100 disabled:opacity-50"
        >
          <span className={loading ? "animate-spin" : ""}>🔄</span>
          {loading ? "..." : "Refresh"}
          {isStale && !loading && <span className="h-1.5 w-1.5 rounded-full bg-brand-amber" />}
        </button>
      </div>

      {/* Summary */}
      <div className="mb-5 grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-bg-700 bg-bg-800 p-4">
          <div className="text-2xl font-extrabold text-brand-emerald">{kerjaCount}</div>
          <div className="mt-1 text-[10px] uppercase tracking-wider text-fg-500">💼 Kerja</div>
        </div>
        <div className="rounded-xl border border-bg-700 bg-bg-800 p-4">
          <div className="text-2xl font-extrabold text-brand-amber">{izinCount}</div>
          <div className="mt-1 text-[10px] uppercase tracking-wider text-fg-500">📋 Izin</div>
        </div>
        <div className="rounded-xl border border-bg-700 bg-bg-800 p-4">
          <div className="text-2xl font-extrabold text-brand-rose">{offCount}</div>
          <div className="mt-1 text-[10px] uppercase tracking-wider text-fg-500">🏠 Off Day</div>
        </div>
      </div>

      {/* Member list */}
      <div className="overflow-hidden rounded-xl border border-bg-700 bg-bg-800">
        <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-bg-900">
            <tr className="text-[10px] uppercase tracking-wider text-fg-500">
              <th className="border-b border-bg-700 px-4 py-3">Anggota</th>
              <th className="border-b border-bg-700 px-3 py-3">Role</th>
              <th className="border-b border-bg-700 px-3 py-3">Status</th>
              <th className="border-b border-bg-700 px-4 py-3">Catatan</th>
            </tr>
          </thead>
          <tbody>
            {team.map((t, i) => {
              const rec = records[t.name];
              const currentStatus = rec?.status || "kerja";
              const currentOpt = STATUS_OPTIONS.find((o) => o.value === currentStatus)!;
              const note = rec?.note || "";
              return (
                <tr
                  key={t.username}
                  className={`group border-t border-bg-700/30 transition hover:bg-bg-900/60 ${
                    i % 2 === 0 ? "bg-bg-800" : "bg-bg-800/60"
                  }`}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-xs font-bold text-white shadow-sm transition group-hover:scale-110"
                        style={{ backgroundColor: t.color }}
                      >
                        {initials(t.name)}
                      </div>
                      <span className="text-sm font-bold text-fg-100">{t.name}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-xs text-fg-500">{t.role}</td>
                  <td className="px-3 py-3">
                    {(isAdmin || (isMember && t.name === myName)) ? (
                      <div className="flex gap-1.5">
                        {STATUS_OPTIONS.map((opt) => (
                          <button
                            key={opt.value}
                            onClick={() => setStatus(t.name, opt.value)}
                            className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition ${
                              currentStatus === opt.value
                                ? opt.cls
                                : "border-bg-700 bg-bg-900 text-fg-500 hover:border-bg-600"
                            }`}
                          >
                            {opt.icon} {opt.label}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <span className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold ${currentOpt.cls}`}>
                        {currentOpt.icon} {currentOpt.label}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {editNote === t.name ? (
                      <div className="flex items-center gap-2">
                        <input
                          className="w-full rounded border border-bg-700 bg-bg-900 px-2 py-1 text-xs text-fg-100 outline-none focus:border-brand-sky"
                          value={noteText}
                          onChange={(e) => setNoteText(e.target.value)}
                          placeholder="Alasan izin / catatan..."
                          autoFocus
                          onKeyDown={(e) => e.key === "Enter" && saveNote(t.name)}
                        />
                        <button
                          onClick={() => saveNote(t.name)}
                          className="rounded bg-brand-sky px-2 py-1 text-[10px] font-bold text-bg-900"
                        >
                          OK
                        </button>
                        <button
                          onClick={() => setEditNote(null)}
                          className="rounded border border-bg-700 px-2 py-1 text-[10px] text-fg-400"
                        >
                          Batal
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-fg-400">
                          {note || <span className="text-fg-600">—</span>}
                        </span>
                        {(isAdmin || (isMember && t.name === myName)) && (
                          <button
                            onClick={() => { setEditNote(t.name); setNoteText(note); }}
                            className="text-[10px] text-brand-sky hover:underline"
                          >
                            Edit
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>
    </PageShell>
  );
}
