import { NextRequest, NextResponse } from "next/server";
import { getWfToken } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const { collectionId, itemId, fieldData, cmsLocaleId } = await req.json() as {
    collectionId: string;
    itemId: string;
    fieldData: Record<string, string>;
    cmsLocaleId?: string;
  };

  if (!collectionId || !itemId || !fieldData) {
    return NextResponse.json({ error: "collectionId, itemId and fieldData are required" }, { status: 400 });
  }

  const token = await getWfToken();
  if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const url = cmsLocaleId
    ? `https://api.webflow.com/v2/collections/${collectionId}/items/${itemId}?cmsLocaleId=${cmsLocaleId}`
    : `https://api.webflow.com/v2/collections/${collectionId}/items/${itemId}`;

  const res = await fetch(
    url,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "accept-version": "2.0.0",
      },
      body: JSON.stringify({ fieldData }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json({ error: err }, { status: res.status });
  }

  return NextResponse.json({ success: true });
}
