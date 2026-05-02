import { Session } from "./types";
import { supabase } from "./supabase";

const SESSION_KEY = "dashboard_session_v1";

// Hardcoded credentials (mirror legacy dashboard)
const ADMIN = { username: "admin", password: "admin123", role: "admin" as const };

// Anggota tim yang punya akses setara admin (bisa lihat semua data anggota lain)
// Login pakai username/password mereka sendiri, tapi role di session = "admin"
// Match case-insensitive + trimmed
const SUPER_VIEWER_NAMES = ["anomaly"];
function isSuperViewer(name?: string): boolean {
  if (!name) return false;
  return SUPER_VIEWER_NAMES.includes(name.trim().toLowerCase());
}

const DEFAULT_MEMBERS: TeamMember[] = [
  { username: "tlegu", password: "tlegu123", name: "Tlegu", role: "Team Leader", color: "#38bdf8", platforms: ["Instagram", "X (Twitter)", "TikTok"] },
  { username: "rully", password: "rully123", name: "Rully", role: "Editor Video", color: "#ec4899", platforms: ["YouTube", "TikTok"] },
  { username: "aprianto", password: "aprianto123", name: "Aprianto", role: "Video Editor", color: "#a78bfa", platforms: ["YouTube", "TikTok"] },
  { username: "meyji", password: "meyji123", name: "Meyji", role: "Social Media Specialist", color: "#34d399", platforms: ["Instagram", "Facebook"] },
  { username: "yanto", password: "yanto123", name: "Yanto", role: "Graphic Designer", color: "#fb923c", platforms: ["Instagram"] },
  { username: "savanda", password: "savanda123", name: "Savanda", role: "Graphic Designer", color: "#fbbf24", platforms: ["Instagram"] },
  { username: "faisol", password: "faisol123", name: "Faisol", role: "Content Creator", color: "#f87171", platforms: ["X (Twitter)", "Telegram"] },
  { username: "wahyudi", password: "wahyudi123", name: "Wahyudi", role: "Social Media Specialist", color: "#06b6d4", platforms: ["Instagram", "Facebook", "X (Twitter)"] },
  { username: "soir", password: "soir123", name: "Soir", role: "Content Creator", color: "#10b981", platforms: ["TikTok", "Telegram"] },
];

export const COLORS = [
  "#38bdf8", "#ec4899", "#a78bfa", "#34d399", "#fb923c",
  "#fbbf24", "#f87171", "#06b6d4", "#10b981", "#e879f9",
  "#4ade80", "#f472b6", "#818cf8", "#22d3ee", "#fb7185",
];

const MEMBERS_KEY = "dashboard_all_members";
// v2: bump untuk paksa fetch ulang dari DB (cache lama jadi orphan)
const MEMBERS_CACHE_KEY = "dashboard_members_cache_v2";

export type TeamMember = {
  username: string;
  password: string;
  name: string;
  role: string;
  color: string;
  platforms?: string[];
  notes?: string;
};

// Also keep backward compat alias
export type ExtraMember = TeamMember;

/** Sync-read cached members (for UI — last-known from Supabase) */
export function getAllMembers(): TeamMember[] {
  if (typeof window === "undefined") return DEFAULT_MEMBERS;
  try {
    // Prefer Supabase cache if available
    const cache = localStorage.getItem(MEMBERS_CACHE_KEY);
    if (cache) return JSON.parse(cache);
    // Legacy localStorage fallback
    const raw = localStorage.getItem(MEMBERS_KEY);
    if (raw) return JSON.parse(raw);
    return [...DEFAULT_MEMBERS];
  } catch {
    return DEFAULT_MEMBERS;
  }
}

/** Refresh members from Supabase into local cache. Safe to call anytime. */
export async function refreshMembersFromDb(): Promise<TeamMember[]> {
  try {
    const { data, error } = await supabase
      .from("team_members")
      .select("*")
      .order("id", { ascending: true });
    if (error || !data) return getAllMembers();
    const members: TeamMember[] = data.map((m: { username: string; password: string; name: string; role: string; color: string; platforms?: string[]; notes?: string }) => ({
      username: m.username,
      password: m.password,
      name: m.name,
      role: m.role || "",
      color: m.color || "#38bdf8",
      platforms: m.platforms || [],
      notes: m.notes || "",
    }));
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(MEMBERS_CACHE_KEY, JSON.stringify(members));
      } catch {}
    }
    return members;
  } catch {
    return getAllMembers();
  }
}

/** Save a single member to Supabase (upsert). */
export async function upsertMember(m: TeamMember) {
  const payload: Record<string, unknown> = {
    username: m.username,
    password: m.password,
    name: m.name,
    role: m.role,
    color: m.color,
    platforms: m.platforms || [],
    notes: m.notes || "",
    updated_at: new Date().toISOString(),
  };
  // Try with notes; fallback tanpa notes kalau kolom belum ada (DB belum di-ALTER)
  let res = await supabase.from("team_members").upsert(payload, { onConflict: "username" });
  if (res.error && /notes/i.test(res.error.message)) {
    delete payload.notes;
    res = await supabase.from("team_members").upsert(payload, { onConflict: "username" });
  }
  if (res.error) throw new Error(res.error.message);
}

/** Delete a member by username. */
export async function deleteMember(username: string) {
  await supabase.from("team_members").delete().eq("username", username);
}

/** Legacy save — still writes to cache, but not authoritative anymore */
export function saveAllMembers(members: TeamMember[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(MEMBERS_CACHE_KEY, JSON.stringify(members));
  } catch {}
}

export async function tryLogin(username: string, password: string): Promise<Session | null> {
  const u = username.trim().toLowerCase();
  if (u === ADMIN.username && password === ADMIN.password) {
    return { username: ADMIN.username, role: "admin" };
  }
  // Try Supabase first (authoritative)
  try {
    const { data } = await supabase
      .from("team_members")
      .select("username,password,name")
      .eq("username", u)
      .eq("password", password)
      .maybeSingle();
    if (data) {
      const elevated = isSuperViewer(data.name);
      return {
        username: data.username,
        role: elevated ? "admin" : "member",
        memberName: data.name,
      };
    }
  } catch {}
  // Fallback to cached/default
  const m = getAllMembers().find((c) => c.username === u && c.password === password);
  if (m) {
    const elevated = isSuperViewer(m.name);
    return {
      username: m.username,
      role: elevated ? "admin" : "member",
      memberName: m.name,
    };
  }
  return null;
}

export function saveSession(s: Session) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  } catch {}
}

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {}
}

export function getDefaultTeam(): Array<{ name: string; role: string; color: string; username: string }> {
  return getAllMembers().map((m, i) => ({
    name: m.name,
    role: m.role,
    color: m.color || COLORS[i % COLORS.length],
    username: m.username,
  }));
}

// Backward compat
export function getExtraMembers(): ExtraMember[] { return []; }
export function saveExtraMembers(_: ExtraMember[]) {}
export function getAllCredentials() {
  return getAllMembers().map((m) => ({
    username: m.username, password: m.password, name: m.name, role: m.role,
  }));
}
