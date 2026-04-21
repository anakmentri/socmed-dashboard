import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const error = req.nextUrl.searchParams.get("error");

  const baseUrl = process.env.TWITTER_CALLBACK_URL
    ? new URL(process.env.TWITTER_CALLBACK_URL).origin
    : "https://socmedanalytics.com";

  if (error) {
    return NextResponse.redirect(
      `${baseUrl}/dashboard/autopost?error=${encodeURIComponent(error)}`
    );
  }
  if (!code || !state) {
    return NextResponse.redirect(
      `${baseUrl}/dashboard/autopost?error=missing_code_or_state`
    );
  }

  const supabase = getSupabase();

  const { data: oauthState } = await supabase
    .from("twitter_oauth_states")
    .select("*")
    .eq("state", state)
    .maybeSingle();

  if (!oauthState) {
    return NextResponse.redirect(
      `${baseUrl}/dashboard/autopost?error=invalid_state`
    );
  }

  const clientId = process.env.TWITTER_CLIENT_ID!;
  const clientSecret = process.env.TWITTER_CLIENT_SECRET!;
  const callbackUrl =
    process.env.TWITTER_CALLBACK_URL ||
    "https://socmedanalytics.com/api/twitter/callback";

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const body = new URLSearchParams({
    code,
    grant_type: "authorization_code",
    client_id: clientId,
    redirect_uri: callbackUrl,
    code_verifier: oauthState.code_verifier,
  });

  const tokenRes = await fetch("https://api.twitter.com/2/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  const tokenJson = await tokenRes.json();
  if (!tokenRes.ok || !tokenJson.access_token) {
    return NextResponse.redirect(
      `${baseUrl}/dashboard/autopost?error=${encodeURIComponent(
        JSON.stringify(tokenJson).slice(0, 200)
      )}`
    );
  }

  // Fetch user info
  const userRes = await fetch("https://api.twitter.com/2/users/me", {
    headers: { Authorization: `Bearer ${tokenJson.access_token}` },
  });
  const userJson = await userRes.json();
  const twitterUser = userJson.data || {};

  const expiresAt = new Date(
    Date.now() + (tokenJson.expires_in || 7200) * 1000
  ).toISOString();

  // Cek apakah akun Twitter ini sudah terhubung ke owner yang sama
  const ownerName = oauthState.owner_name || "admin";
  const { data: existing } = await supabase
    .from("twitter_connections")
    .select("id")
    .eq("owner_name", ownerName)
    .eq("twitter_user_id", twitterUser.id || "")
    .maybeSingle();

  const payload = {
    owner_name: ownerName,
    twitter_user_id: twitterUser.id || null,
    twitter_username: twitterUser.username || null,
    access_token: tokenJson.access_token,
    refresh_token: tokenJson.refresh_token || null,
    expires_at: expiresAt,
    scope: tokenJson.scope || null,
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    // Refresh token untuk akun yg sudah ada
    await supabase.from("twitter_connections").update(payload).eq("id", existing.id);
  } else {
    // Insert akun baru (user bisa punya banyak akun)
    await supabase.from("twitter_connections").insert(payload);
  }

  // Cleanup state
  await supabase.from("twitter_oauth_states").delete().eq("state", state);

  return NextResponse.redirect(
    `${baseUrl}/dashboard/autopost?connected=${encodeURIComponent(
      twitterUser.username || "ok"
    )}`
  );
}
