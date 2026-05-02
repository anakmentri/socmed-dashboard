"use client";
import { createClient } from "@supabase/supabase-js";

// supabaseUrl arah ke domain dashboard sendiri (rewrites di next.config.js
// translate /rest/v1/<table> → /api/pgrest/<table> yang konek langsung ke
// twitterdood schema via direct PostgreSQL).
//
// Resolve URL otomatis (urutan prioritas):
// 1. window.location.origin di BROWSER — selalu match dengan origin yang user
//    akses, jadi gak ada CORS issue meski deploy ke custom domain
// 2. NEXT_PUBLIC_SUPABASE_URL (eksplisit di env, override khusus)
// 3. NEXT_PUBLIC_VERCEL_URL (server-side / SSR fallback ke auto Vercel host)
// 4. http://localhost:3000 (dev fallback)
//
// PENTING: Jangan PRIORITASKAN VERCEL_URL di browser karena value-nya =
// auto-generated host (e.g. doodstream-xxx.vercel.app), bukan custom domain
// (e.g. doodstream.emojiroket.com) → fetch ke beda origin = CORS blocked.
function resolveUrl(): string {
  // Browser: always use current origin (handles custom domain correctly)
  if (typeof window !== "undefined") return window.location.origin;
  // Server-side (SSR/build): explicit env > VERCEL_URL > localhost
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) return process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (process.env.NEXT_PUBLIC_VERCEL_URL) return `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`;
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
