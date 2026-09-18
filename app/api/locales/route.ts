import { NextRequest, NextResponse } from "next/server";
import { getWfToken } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const siteId = searchParams.get("siteId");
  if (!siteId) return NextResponse.json({ error: "siteId is required" }, { status: 400 });

  const token = await getWfToken();
  if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const res = await fetch(`https://api.webflow.com/v2/sites/${siteId}/locales`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "accept-version": "2.0.0",
    },
  });

  // If v2 locales endpoint not found, try beta
  if (res.status === 404) {
    const betaRes = await fetch(`https://api.webflow.com/beta/sites/${siteId}/locales`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (betaRes.ok) return NextResponse.json(await betaRes.json());

    // Fall back to v1
    const v1Res = await fetch(`https://api.webflow.com/sites/${siteId}/locales`, {
      headers: { Authorization: `Bearer ${token}`, "accept-version": "1.0.0" },
    });
    if (v1Res.ok) return NextResponse.json(await v1Res.json());
    return NextResponse.json({ error: "Locales endpoint not found. Check your Webflow plan supports Localization." }, { status: 404 });
  }

  if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: res.status });
  return NextResponse.json(await res.json());
}
