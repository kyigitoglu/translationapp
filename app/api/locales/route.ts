import { NextRequest, NextResponse } from "next/server";
import { getWfToken } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const siteId = searchParams.get("siteId");
  if (!siteId) return NextResponse.json({ error: "siteId is required" }, { status: 400 });

  const token = await getWfToken();
  if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  // Try all known Webflow locale endpoint variants
  const endpoints = [
    `https://api.webflow.com/v2/sites/${siteId}/locales`,
    `https://api.webflow.com/beta/sites/${siteId}/locales`,
    `https://api.webflow.com/sites/${siteId}/locales`,
  ];

  for (const url of endpoints) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, "accept-version": "2.0.0" },
    });
    if (res.ok) {
      const data = await res.json();
      // Normalise v1 vs v2 response shapes
      const secondary = data.secondaryLocales ?? data.locales?.filter((l: { primary?: boolean }) => !l.primary) ?? [];
      return NextResponse.json({ secondaryLocales: secondary });
    }
  }

  // No endpoint worked — return empty so panel shows manual input
  return NextResponse.json({ secondaryLocales: [], manualRequired: true });
}
