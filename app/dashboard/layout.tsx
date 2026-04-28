"use client";
import { ReactNode, useEffect, useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { ToastProvider } from "@/components/Toast";
import { useSession } from "@/hooks/useSession";

// Bundle version stamp — set ke commit/tanggal terakhir migrasi.
// Browser auto-reload kalau localStorage version != current version.
const BUNDLE_VERSION = "2026-04-28-twitterdood";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { session, ready } = useSession(true);
  const [migrationBanner, setMigrationBanner] = useState(false);

  useEffect(() => {
    // Auto-detect old bundle: kalau localStorage version beda, force reload
    try {
      const stored = localStorage.getItem("dashboard_bundle_version");
      if (stored !== BUNDLE_VERSION) {
        localStorage.setItem("dashboard_bundle_version", BUNDLE_VERSION);
        // Hapus cache yang mungkin point ke project lama
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && (k.includes("cache") || k.startsWith("dashboard_") && !k.includes("session") && !k.includes("members"))) {
            keysToRemove.push(k);
          }
        }
        keysToRemove.forEach((k) => localStorage.removeItem(k));
        // Trigger banner sekali
        if (stored !== null) setMigrationBanner(true);
      }
    } catch {}

    // Verify Supabase URL pointing ke domain sendiri (bukan project lama)
    const expectedUrl = "socmedanalytics.com";
    if (typeof window !== "undefined") {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
      if (!supabaseUrl.includes(expectedUrl)) {
        console.warn(
          "[bundle-check] supabaseUrl seharusnya '" + expectedUrl +
          "' tapi dapat: " + supabaseUrl + ". Force reload..."
        );
        // Force hard reload sekali (skip kalau sudah di-flag biar gak loop)
        if (!sessionStorage.getItem("force_reload_done")) {
          sessionStorage.setItem("force_reload_done", "1");
          window.location.reload();
        }
      }
    }
  }, []);

  if (!ready || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-900 text-fg-500">
        Memuat...
      </div>
    );
  }

  return (
    <ToastProvider>
      <div className="flex min-h-screen bg-bg-900">
        <Sidebar session={session} />
        <main className="flex-1 overflow-x-hidden">
          {migrationBanner && (
            <div className="border-b border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-center text-xs text-brand-emerald">
              ✅ Dashboard sudah update ke versi baru. Cache lama otomatis dibersihkan.
              <button
                onClick={() => setMigrationBanner(false)}
                className="ml-3 rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] hover:bg-emerald-500/30"
              >
                ✕ Tutup
              </button>
            </div>
          )}
          {children}
        </main>
      </div>
    </ToastProvider>
  );
}
