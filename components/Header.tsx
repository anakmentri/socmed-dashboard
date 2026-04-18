"use client";
import { Session } from "@/lib/types";
import { initials } from "@/lib/utils";

export function Header({
  title,
  desc,
  session,
  onLogout,
}: {
  title: string;
  desc: string;
  session: Session;
  onLogout: () => void;
}) {
  const name =
    session.role === "member" ? session.memberName || session.username : session.username;
  const dateStr = new Date().toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <header className="flex items-center justify-between border-b border-bg-700 bg-bg-800 px-6 py-4">
      <div>
        <h1 className="text-xl font-bold text-fg-100">{title}</h1>
        <p className="text-xs text-fg-500">{desc}</p>
      </div>
      <div className="flex items-center gap-4">
        <div className="hidden rounded-lg border border-bg-700 bg-bg-900 px-3 py-1.5 text-xs text-fg-300 md:block">
          {dateStr}
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-bg-700 bg-bg-900 px-3 py-1.5">
          <div className="text-[10px] font-bold text-brand-emerald">● Online</div>
        </div>
        <div className="flex items-center gap-3 rounded-lg border border-bg-700 bg-bg-900 px-3 py-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-sky text-xs font-bold text-bg-900">
            {initials(name)}
          </div>
          <div className="hidden text-xs md:block">
            <div className="font-bold text-fg-100">{name}</div>
            <div className="text-[10px] text-fg-500">
              {session.role === "admin" ? "Administrator" : "Anggota"}
            </div>
          </div>
          <button
            onClick={onLogout}
            className="ml-2 rounded border border-red-900 px-2 py-1 text-[10px] font-semibold text-red-400 hover:bg-red-900/20"
          >
            Logout
          </button>
        </div>
      </div>
    </header>
  );
}
