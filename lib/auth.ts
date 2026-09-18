import { cookies } from "next/headers";

export async function getWfToken(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get("wf_token")?.value ?? null;
}
