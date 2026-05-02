"use client";
import { ReactNode, useEffect, useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { ToastProvider } from "@/components/Toast";
import { useSession } from "@/hooks/useSession";

// Bundle version stamp — bump untuk paksa reload browser & clear cache lama
// (kalau ada perubahan data source / config yang butuh fresh state).
const BUNDLE_VERSION = "2026-05-02-cors-fix";

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

    // Removed bundle-check yang hardcoded "socmedanalytics.com" — sekarang URL
    // resolve otomatis dari window.location.origin (lihat lib/supabase.ts).
    // Domain bebas (socmedanalytics.com, doodstream.emojiroket.com, dll) sama
    // bisa dipakai tanpa reconfigure.
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
