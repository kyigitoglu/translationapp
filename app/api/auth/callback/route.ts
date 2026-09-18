import { NextRequest, NextResponse } from "next/server";
import { setToken } from "@/lib/tokenStore";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  if (error || !code) {
    return NextResponse.redirect(new URL(`/install?error=${error ?? "missing_code"}`, req.url));
  }

  // Exchange code for access token
  const tokenRes = await fetch("https://api.webflow.com/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.WEBFLOW_CLIENT_ID,
      client_secret: process.env.WEBFLOW_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
      redirect_uri: `${process.env.NEXTAUTH_URL}/api/auth/callback`,
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    console.error("[oauth] token exchange failed:", err);
    return NextResponse.redirect(new URL("/install?error=token_exchange_failed", req.url));
  }

  const { access_token } = await tokenRes.json();

  // Fetch the site ID this token belongs to
  const sitesRes = await fetch("https://api.webflow.com/v2/sites", {
    headers: { Authorization: `Bearer ${access_token}` },
  });

  if (!sitesRes.ok) {
    return NextResponse.redirect(new URL("/install?error=sites_fetch_failed", req.url));
  }

  const { sites } = await sitesRes.json();

  // Store token for each site this user has access to
  for (const site of sites ?? []) {
    setToken(site.id, access_token);
  }

  return NextResponse.redirect(new URL("/install?success=true", req.url));
}
