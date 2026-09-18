import { NextRequest, NextResponse } from "next/server";
import { getToken } from "@/lib/tokenStore";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const siteId = searchParams.get("siteId");

  if (!siteId) {
    return NextResponse.json({ error: "siteId is required" }, { status: 400 });
  }

  const token = getToken(siteId) ?? process.env.WEBFLOW_API_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "Not authenticated. Visit /install to connect." }, { status: 401 });
  }

  const res = await fetch(`https://api.webflow.com/v2/sites/${siteId}/locales`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "accept-version": "2.0.0",
    },
  });

  if (!res.ok) {
    const error = await res.text();
    return NextResponse.json({ error }, { status: res.status });
  }

  const data = await res.json();
  return NextResponse.json(data);
}
