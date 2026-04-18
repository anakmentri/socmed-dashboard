"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Session } from "@/lib/types";
import { loadSession, clearSession } from "@/lib/auth";
import { logActivity } from "@/lib/utils";

export function useSession(requireAuth = true): { session: Session | null; logout: () => void; ready: boolean } {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const s = loadSession();
    setSession(s);
    setReady(true);
    if (requireAuth && !s) router.replace("/login");
  }, [requireAuth, router]);

  const logout = () => {
    if (session) {
      logActivity({
        who: session.memberName || session.username,
        role: session.role === "admin" ? "Administrator" : "Anggota",
        action: "Logout",
        source: "Session",
        detail: `User ${session.username} logout`,
      });
    }
    clearSession();
    setSession(null);
    router.replace("/login");
  };

  return { session, logout, ready };
}
