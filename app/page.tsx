"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { loadSession } from "@/lib/auth";

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    const s = loadSession();
    router.replace(s ? "/dashboard" : "/login");
  }, [router]);
  return null;
}
