"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function InstallContent() {
  const params = useSearchParams();
  const success = params.get("success");
  const error = params.get("error");

  const clientId = process.env.NEXT_PUBLIC_WEBFLOW_CLIENT_ID ?? "";
  const redirectUri = `${typeof window !== "undefined" ? window.location.origin : "https://translationapp-ivory.vercel.app"}/api/auth/callback`;
  const authUrl = `https://webflow.com/oauth/authorize?client_id=${clientId}&response_type=code&scope=sites%3Aread%20sites%3Awrite%20pages%3Aread%20pages%3Awrite%20cms%3Aread%20cms%3Awrite&redirect_uri=${encodeURIComponent(redirectUri)}`;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#1a1a1a] text-white font-sans p-8">
      <div className="max-w-sm w-full flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold">Auto Translate</h1>
          <p className="text-[#666] text-sm">Webflow Designer Extension</p>
        </div>

        {success && (
          <div className="bg-green-900/30 border border-green-700/40 rounded px-4 py-3 text-sm text-green-400">
            ✓ App connected successfully. You can now use it in Webflow Designer.
          </div>
        )}

        {error && (
          <div className="bg-red-900/30 border border-red-700/40 rounded px-4 py-3 text-sm text-red-400">
            Error: {error}
          </div>
        )}

        {!success && (
          <>
            <p className="text-sm text-[#999]">
              Connect your Webflow account to allow the app to read locales and apply translations.
            </p>
            <a
              href={authUrl}
              className="flex items-center justify-center gap-2 bg-[#0073e6] hover:bg-[#0066cc] rounded px-4 py-2.5 text-sm font-medium transition-colors text-center"
            >
              Connect with Webflow
            </a>
          </>
        )}
      </div>
    </main>
  );
}

export default function InstallPage() {
  return (
    <Suspense>
      <InstallContent />
    </Suspense>
  );
}
