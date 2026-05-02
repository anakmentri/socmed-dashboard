"use client";
import { createClient } from "@supabase/supabase-js";

// supabaseUrl arah ke domain dashboard sendiri (rewrites di next.config.js
// translate /rest/v1/<table> → /api/pgrest/<table> yang konek langsung ke
// twitterdood schema via direct PostgreSQL).
//
// Resolve URL otomatis (urutan prioritas):
// 1. NEXT_PUBLIC_SUPABASE_URL (eksplisit di env, untuk custom domain)
// 2. NEXT_PUBLIC_VERCEL_URL (auto-set Vercel saat deploy, contoh: doodstream-xxx.vercel.app)
// 3. window.location.origin (browser fallback)
// 4. http://localhost:3000 (dev fallback)
function resolveUrl(): string {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) return process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (process.env.NEXT_PUBLIC_VERCEL_URL) return `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`;
  if (typeof window !== "undefined") return window.location.origin;
  return "http://localhost:3000";
}

// Anon key tidak dipakai untuk auth (kita pakai custom session di localStorage),
// cuma jadi identifier untuk Supabase client. Default ke dummy string aman.
const supabaseUrl = resolveUrl();
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "anon-placeholder-not-used-for-auth";

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});
