"use client";
import { useEffect, useState } from "react";
import {
  getAllMembers,
  refreshMembersFromDb,
  TeamMember,
} from "@/lib/auth";

/**
 * Hook untuk ambil daftar anggota tim yang SELALU tersinkronisasi.
 * - Return cache instant (tidak ada flicker)
 * - Auto-fetch dari Supabase di background (stale-while-revalidate)
 * - Auto-refresh saat tab kembali fokus dari background
 *
 * Pakai ini SEBAGAI GANTI `getDefaultTeam()` langsung di page components
 * biar data anggota konsisten antar browser.
 */
export function useTeamMembers(): {
  team: Array<{ name: string; role: string; color: string; username: string }>;
  members: TeamMember[];
  refresh: () => Promise<void>;
} {
  const [members, setMembers] = useState<TeamMember[]>(() => getAllMembers());

  const refresh = async () => {
    const fresh = await refreshMembersFromDb();
    setMembers(fresh);
  };

  useEffect(() => {
    // Selalu re-sync pas mount
    refresh();
    // Sync ulang saat user balik ke tab
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const team = members.map((m, i) => ({
    name: m.name,
    role: m.role,
    color: m.color || ["#38bdf8", "#ec4899", "#a78bfa", "#34d399", "#fb923c"][i % 5],
    username: m.username,
  }));

  return { team, members, refresh };
}
