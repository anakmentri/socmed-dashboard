import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
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
  // Resolve callback URL: explicit env > Vercel auto-host > request origin > localhost
  const vercelHost = process.env.VERCEL_URL || process.env.NEXT_PUBLIC_VERCEL_URL;
  const reqOrigin = req.headers.get("host")
    ? `https://${req.headers.get("host")}`
    : null;
  const callbackUrl =
    process.env.TWITTER_CALLBACK_URL ||
    (vercelHost ? `https://${vercelHost}/api/twitter/callback` : null) ||
    (reqOrigin ? `${reqOrigin}/api/twitter/callback` : null) ||
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
