"use client";
import { ReactNode } from "react";
import { Sidebar } from "@/components/Sidebar";
import { ToastProvider } from "@/components/Toast";
import { useSession } from "@/hooks/useSession";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { session, ready } = useSession(true);

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
        <main className="flex-1 overflow-x-hidden">{children}</main>
      </div>
    </ToastProvider>
  );
}
