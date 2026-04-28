"use client";
import { createClient } from "@supabase/supabase-js";

// supabaseUrl arah ke domain dashboard sendiri (https://socmedanalytics.com).
// Next.js rewrite di next.config.js translate /rest/v1/<table> → /api/pgrest/<table>
// yang konek langsung ke twitterdood schema via direct PostgreSQL.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    // Disable auto-refresh + persistSession karena kita tidak pakai Supabase Auth
    // (custom session di localStorage)
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});
