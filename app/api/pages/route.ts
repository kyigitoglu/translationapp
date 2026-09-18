import { NextRequest, NextResponse } from "next/server";
import { getWfToken } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const siteId = searchParams.get("siteId");
  if (!siteId) return NextResponse.json({ error: "siteId is required" }, { status: 400 });

  const token = await getWfToken();
  if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const res = await fetch(`https://api.webflow.com/v2/sites/${siteId}/pages`, {
    headers: { Authorization: `Bearer ${token}`, "accept-version": "2.0.0" },
  });

  if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: res.status });
  return NextResponse.json(await res.json());
}
