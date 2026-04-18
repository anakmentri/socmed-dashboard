"use client";
import { ReactNode } from "react";
import { Header } from "./Header";
import { useSession } from "@/hooks/useSession";

export function PageShell({
  title,
  desc,
  children,
}: {
  title: string;
  desc: string;
  children: ReactNode;
}) {
  const { session, logout } = useSession(true);
  if (!session) return null;
  return (
    <>
      <Header title={title} desc={desc} session={session} onLogout={logout} />
      <div className="p-6">{children}</div>
    </>
  );
}
