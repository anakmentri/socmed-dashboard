"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Session } from "@/lib/types";

const MENU = [
  { href: "/dashboard", label: "Overview", icon: "◉", adminOnly: true },
  { href: "/dashboard/platforms", label: "Platform", icon: "▦", adminOnly: true },
  { href: "/dashboard/input-report", label: "Input Report", icon: "▤", memberOk: true },
  { href: "/dashboard/report", label: "Report Kerjaan", icon: "◈", memberOk: true },
  { href: "/dashboard/accounts", label: "Akun Sosmed", icon: "◎", memberOk: true },
  { href: "/dashboard/assets", label: "Asset Library", icon: "▢", memberOk: true },
  { href: "/dashboard/autopost", label: "Auto Post", icon: "🚀", memberOk: true },
  { href: "/dashboard/scheduler", label: "Scheduler", icon: "⏰", adminOnly: true },
  { href: "/dashboard/attendance", label: "Kehadiran", icon: "✓", memberOk: true },
  { href: "/dashboard/team", label: "Anggota Tim", icon: "◆", adminOnly: true },
  { href: "/dashboard/history", label: "History", icon: "⟳", adminOnly: true },
  { href: "/dashboard/settings", label: "Settings", icon: "⚙", adminOnly: true },
];

export function Sidebar({ session }: { session: Session }) {
  const pathname = usePathname();
  const isMember = session.role === "member";

  return (
    <aside className="hidden w-64 shrink-0 border-r border-bg-700 bg-bg-800 lg:block">
      <div className="flex h-16 items-center gap-3 border-b border-bg-700 px-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-brand-sky to-brand-violet text-sm font-bold text-bg-900">
          TD
        </div>
        <div>
          <div className="text-sm font-bold text-fg-100">Tim Dashboard</div>
          <div className="text-[10px] text-fg-500">Social Media</div>
        </div>
      </div>
      <nav className="p-3">
        {MENU.map((m) => {
          if (isMember && m.adminOnly && !m.memberOk) return null;
          const active = pathname === m.href;
          return (
            <Link
              key={m.href}
              href={m.href}
              className={`mb-1 flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm transition ${
                active
                  ? "bg-brand-sky/10 text-brand-sky"
                  : "text-fg-300 hover:bg-bg-700 hover:text-fg-100"
              }`}
            >
              <span className="w-5 text-center">{m.icon}</span>
              {m.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
