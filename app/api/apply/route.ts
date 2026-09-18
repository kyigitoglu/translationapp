import { NextRequest, NextResponse } from "next/server";
import { getWfToken } from "@/lib/auth";

interface TranslatedItem {
  itemId: string;
  fieldData: Record<string, string>;
}

export async function POST(req: NextRequest) {
  const { collectionId, cmsLocaleId, items } = await req.json() as {
    collectionId: string;
    cmsLocaleId: string;
    items: TranslatedItem[];
  };

  if (!collectionId || !cmsLocaleId || !items?.length) {
    return NextResponse.json({ error: "collectionId, cmsLocaleId and items are required" }, { status: 400 });
  }

  const token = await getWfToken();
  if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const results = await Promise.all(
    items.map(async ({ itemId, fieldData }) => {
      const res = await fetch(
        `https://api.webflow.com/v2/collections/${collectionId}/items/${itemId}?cmsLocaleId=${cmsLocaleId}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ fieldData }),
        }
      );

      return { itemId, ok: res.ok, status: res.status };
    })
  );

  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    return NextResponse.json({ error: "Some items failed", failed }, { status: 207 });
  }

  return NextResponse.json({ success: true, updated: results.length });
}
