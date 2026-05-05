import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function getSupabase() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "anon-placeholder-not-used-for-auth";
  return createClient(url, key);
}

function base64URLEncode(buffer: Buffer): string {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

export async function GET(req: NextRequest) {
  const ownerName = req.nextUrl.searchParams.get("owner") || "admin";

  const codeVerifier = base64URLEncode(crypto.randomBytes(32));
  const codeChallenge = base64URLEncode(
    crypto.createHash("sha256").update(codeVerifier).digest()
  );
  const state = base64URLEncode(crypto.randomBytes(16));

  await getSupabase().from("twitter_oauth_states").insert({
    state,
    code_verifier: codeVerifier,
    owner_name: ownerName,
  });

  const clientId = process.env.TWITTER_CLIENT_ID!;
  // Resolve callback URL — PRIORITY URUTAN PENTING:
  // 1. TWITTER_CALLBACK_URL (env eksplisit, override semua)
  // 2. x-forwarded-host (custom domain, Vercel proxy)
  // 3. host header (custom domain langsung)
  // 4. VERCEL_URL (auto-generated, FALLBACK terakhir karena bukan custom domain)
  // 5. localhost (dev)
  //
  // VERCEL_URL = "doodstream-xxx.vercel.app" (auto), bukan "doodstream.emojiroket.com"
  // Twitter callback whitelist hanya kenal custom domain, jadi VERCEL_URL akan reject.
  const fwdHost = req.headers.get("x-forwarded-host");
  const host = req.headers.get("host");
  const customHost = fwdHost || host;
  const vercelHost = process.env.VERCEL_URL || process.env.NEXT_PUBLIC_VERCEL_URL;
  const callbackUrl =
    process.env.TWITTER_CALLBACK_URL ||
    (customHost ? `https://${customHost}/api/twitter/callback` : null) ||
    (vercelHost ? `https://${vercelHost}/api/twitter/callback` : null) ||
    "http://localhost:3000/api/twitter/callback";

  const authUrl = new URL("https://twitter.com/i/oauth2/authorize");
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", callbackUrl);
  authUrl.searchParams.set(
    "scope",
    // media.write WAJIB untuk upload gambar/video via /2/media/upload
    "tweet.read tweet.write users.read media.write offline.access"
  );
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  return NextResponse.redirect(authUrl.toString());
}
