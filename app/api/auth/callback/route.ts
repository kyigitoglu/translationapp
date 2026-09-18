import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  if (error || !code) {
    return NextResponse.redirect(new URL(`/install?error=${error ?? "missing_code"}`, req.url));
  }

  const redirectUri = `${process.env.NEXTAUTH_URL}/api/auth/callback`;

  const tokenRes = await fetch("https://api.webflow.com/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.WEBFLOW_CLIENT_ID,
      client_secret: process.env.WEBFLOW_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    console.error("[oauth] token exchange failed:", tokenRes.status, err);
    return NextResponse.redirect(
      new URL(`/install?error=token_exchange_failed&detail=${encodeURIComponent(err)}`, req.url)
    );
  }

  const { access_token } = await tokenRes.json();

  const cookieStore = await cookies();
  cookieStore.set("wf_token", access_token, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });

  return NextResponse.redirect(new URL("/install?success=true", req.url));
}
