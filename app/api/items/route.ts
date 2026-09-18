import { NextRequest, NextResponse } from "next/server";
import { getWfToken } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const collectionId = searchParams.get("collectionId");
  const cmsLocaleId = searchParams.get("cmsLocaleId");
  if (!collectionId) return NextResponse.json({ error: "collectionId is required" }, { status: 400 });

  const token = await getWfToken();
  if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const url = new URL(`https://api.webflow.com/v2/collections/${collectionId}/items`);
  if (cmsLocaleId) url.searchParams.set("cmsLocaleId", cmsLocaleId);
  url.searchParams.set("limit", "100");

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: res.status });
  return NextResponse.json(await res.json());
}
