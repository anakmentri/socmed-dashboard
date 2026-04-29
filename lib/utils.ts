export function fN(n: number): string {
  if (!n) return "0";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return n.toString();
}

export function fmtIdDate(d: string | Date): string {
  if (!d) return "-";
  try {
    return new Date(d).toLocaleDateString("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return String(d);
  }
}

export function today(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function dayName(d: string | Date): string {
  const names = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
  return names[new Date(d).getDay()];
}

/**
 * Hitung range minggu (Senin–Minggu) untuk tanggal tertentu.
 * Returns: { start, end, weekNum, label }
 *   start: string YYYY-MM-DD (Monday)
 *   end:   string YYYY-MM-DD (Sunday)
 *   weekNum: ISO week number
 *   label: 'Minggu 17 (21-27 Apr 2026)'
 */
export function getWeekRange(dateStr: string): {
  start: string;
  end: string;
  weekNum: number;
  label: string;
} {
  const d = new Date(dateStr + "T00:00:00");
  // Senin = 1, Minggu = 0. Jadikan Senin awal minggu.
  const dayOfWeek = d.getDay() || 7; // Minggu (0) jadi 7
  const monday = new Date(d);
  monday.setDate(d.getDate() - (dayOfWeek - 1));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (x: Date) =>
    `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(
      x.getDate()
    ).padStart(2, "0")}`;
  // ISO Week number
  const target = new Date(monday);
  const dayNr = (target.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.getTime();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay() + 7) % 7));
  }
  const weekNum =
    1 + Math.ceil((firstThursday - target.getTime()) / (7 * 24 * 3600 * 1000));
  const monthShort = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  const sameMonth = monday.getMonth() === sunday.getMonth();
  const label = sameMonth
    ? `Minggu ${weekNum} (${monday.getDate()}–${sunday.getDate()} ${monthShort[monday.getMonth()]} ${monday.getFullYear()})`
    : `Minggu ${weekNum} (${monday.getDate()} ${monthShort[monday.getMonth()]} – ${sunday.getDate()} ${monthShort[sunday.getMonth()]} ${sunday.getFullYear()})`;
  return { start: fmt(monday), end: fmt(sunday), weekNum, label };
}

/**
 * Adjust tanggal +/- N hari, return ISO date string (YYYY-MM-DD).
 */
export function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export type ActivityLogEntry = {
  id: string;
  ts: string;
  who: string;
  role: string;
  action: string;
  source: string;
  detail: string;
};

const ACTIVITY_LOG_KEY = "dashboard_activity_log";
const ACTIVITY_LOG_MAX = 2000;

export function logActivity(entry: Omit<ActivityLogEntry, "id" | "ts"> & { ts?: string }) {
  if (typeof window === "undefined") return;
  // Local cache (instant feedback)
  try {
    const raw = localStorage.getItem(ACTIVITY_LOG_KEY);
    const list: ActivityLogEntry[] = raw ? JSON.parse(raw) : [];
    list.unshift({
      id: Math.random().toString(36).slice(2) + Date.now().toString(36),
      ts: entry.ts || new Date().toISOString(),
      who: entry.who || "-",
      role: entry.role || "Anggota",
      action: entry.action,
      source: entry.source,
      detail: entry.detail,
    });
    if (list.length > ACTIVITY_LOG_MAX) list.length = ACTIVITY_LOG_MAX;
    localStorage.setItem(ACTIVITY_LOG_KEY, JSON.stringify(list));
  } catch {}
  // Persist to Supabase (async, fire-and-forget)
  import("./supabase").then(({ supabase }) => {
    supabase.from("activity_log").insert({
      who: entry.who || "-",
      role: entry.role || "Anggota",
      action: entry.action,
      source: entry.source,
      detail: entry.detail,
    }).then(() => {});
  }).catch(() => {});
}

export function logAs(
  session: { role?: string; username?: string; memberName?: string } | null | undefined,
  action: string,
  source: string,
  detail: string
) {
  if (!session) return;
  logActivity({
    who: session.memberName || session.username || "-",
    role: session.role === "admin" ? "Administrator" : "Anggota",
    action,
    source,
    detail,
  });
}

export function getActivityLog(): ActivityLogEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(ACTIVITY_LOG_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function initials(name: string): string {
  return (name || "?")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

// Pack / unpack extra fields for reports & assets (match legacy schema)
export function packReportContent(r: {
  desc: string;
  links: string[];
  image: string;
  notes: string;
  platform: string;
}): string {
  return (
    "__J__" +
    JSON.stringify({
      d: r.desc || "",
      l: r.links || [],
      i: r.image || "",
      n: r.notes || "",
      p: r.platform || "",
    })
  );
}

export function unpackReportContent(content: string): {
  desc: string;
  links: string[];
  image: string;
  notes: string;
  platform: string;
} {
  if (typeof content === "string" && content.startsWith("__J__")) {
    try {
      const j = JSON.parse(content.slice(5));
      return {
        desc: j.d || "",
        links: j.l || [],
        image: j.i || "",
        notes: j.n || "",
        platform: j.p || "",
      };
    } catch {
      /* fall through */
    }
  }
  return { desc: content || "", links: [], image: "", notes: "", platform: "" };
}

export function packAssetUrl(a: {
  caption: string;
  link: string;
  date: string;
  notes: string;
  status: string;
  image: string;
}): string {
  return (
    "__J__" +
    JSON.stringify({
      c: a.caption || "",
      lk: a.link || "",
      dt: a.date || "",
      nt: a.notes || "",
      st: a.status || "available",
      img: a.image || "",
    })
  );
}

export function unpackAssetUrl(url: string): {
  caption: string;
  link: string;
  date: string;
  notes: string;
  status: string;
  image: string;
} {
  if (typeof url === "string" && url.startsWith("__J__")) {
    try {
      const j = JSON.parse(url.slice(5));
      return {
        caption: j.c || "",
        link: j.lk || "",
        date: j.dt || "",
        notes: j.nt || "",
        status: j.st || "available",
        image: j.img || "",
      };
    } catch {
      /* fall through */
    }
  }
  return {
    caption: "",
    link: url || "",
    date: "",
    notes: "",
    status: "available",
    image: "",
  };
}
