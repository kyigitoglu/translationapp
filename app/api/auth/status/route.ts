import { NextResponse } from "next/server";
import { getWfToken } from "@/lib/auth";

export async function GET() {
  const token = await getWfToken();
  return NextResponse.json({ authenticated: !!token });
}
