"use client";
import { PageShell } from "@/components/PageShell";
import { useSession } from "@/hooks/useSession";

export default function SettingsPage() {
  const { session } = useSession();

  return (
    <PageShell title="Settings" desc="Pengaturan profil dan konfigurasi">
      <div className="max-w-2xl space-y-6">
        <div className="rounded-xl border border-bg-700 bg-bg-800 p-6">
          <h3 className="mb-4 text-sm font-bold uppercase tracking-wide text-fg-300">Profil</h3>
          <div className="space-y-2 text-sm">
            <div>
              <span className="text-fg-500">Username:</span>{" "}
              <span className="font-bold text-fg-100">{session?.username}</span>
            </div>
            <div>
              <span className="text-fg-500">Role:</span>{" "}
              <span className="font-bold text-fg-100">
                {session?.role === "admin" ? "Administrator" : "Anggota"}
              </span>
            </div>
            {session?.memberName && (
              <div>
                <span className="text-fg-500">Nama:</span>{" "}
                <span className="font-bold text-fg-100">{session.memberName}</span>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-bg-700 bg-bg-800 p-6">
          <h3 className="mb-4 text-sm font-bold uppercase tracking-wide text-fg-300">Data Storage</h3>
          <div className="space-y-2 text-xs text-fg-300">
            <p>
              Semua data disimpan di <span className="font-bold text-brand-sky">Supabase PostgreSQL</span>.
              Tidak ada penyimpanan lokal.
            </p>
            <p className="text-fg-500">
              Project: <span className="font-mono">fireqxxqxxkxbcemcpmj.supabase.co</span>
            </p>
            <p className="text-fg-500">
              Tabel: daily_work, report_items, ir_data, soc_accounts, assets, platforms, team, activity_log
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-bg-700 bg-bg-800 p-6">
          <h3 className="mb-4 text-sm font-bold uppercase tracking-wide text-fg-300">Tentang</h3>
          <div className="text-xs text-fg-500">
            Tim Dashboard v2.0 · Next.js + React + Tailwind CSS + Supabase
          </div>
        </div>
      </div>
    </PageShell>
  );
}
