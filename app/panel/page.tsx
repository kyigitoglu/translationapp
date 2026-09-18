"use client";

import { useEffect, useState } from "react";

interface Site { id: string; displayName: string; }
interface Locale { id: string; cmsLocaleId: string; displayName: string; tag: string; primary: boolean; }
interface Collection { id: string; displayName: string; slug: string; }
interface CmsField { id: string; slug: string; displayName: string; type: string; }
interface CmsItem { id: string; fieldData: Record<string, string>; }

type Step = "auth" | "site" | "locale" | "collection" | "items" | "translating" | "done" | "error";

const TEXT_FIELD_TYPES = ["PlainText", "RichText"];

function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] uppercase tracking-widest text-[#666] mb-1">{children}</p>;
}

function Select({ value, onChange, children, disabled }: {
  value: string; onChange: (v: string) => void; children: React.ReactNode; disabled?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="w-full bg-[#2a2a2a] border border-white/10 rounded px-2 py-1.5 text-white text-sm focus:outline-none focus:border-[#0073e6] disabled:opacity-50"
    >
      {children}
    </select>
  );
}

function Btn({ onClick, disabled, children, variant = "secondary" }: {
  onClick: () => void; disabled?: boolean; children: React.ReactNode; variant?: "primary" | "secondary";
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full rounded px-3 py-2 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
        variant === "primary"
          ? "bg-[#0073e6] hover:bg-[#0066cc] text-white"
          : "bg-[#2a2a2a] hover:bg-[#333] border border-white/10 text-white"
      }`}
    >
      {children}
    </button>
  );
}

export default function PanelPage() {
  const [step, setStep] = useState<Step>("auth");
  const [error, setError] = useState("");

  const [sites, setSites] = useState<Site[]>([]);
  const [selectedSite, setSelectedSite] = useState("");

  const [locales, setLocales] = useState<Locale[]>([]);
  const [selectedLocale, setSelectedLocale] = useState<Locale | null>(null);

  const [collections, setCollections] = useState<Collection[]>([]);
  const [selectedCollection, setSelectedCollection] = useState("");

  const [fields, setFields] = useState<CmsField[]>([]);
  const [items, setItems] = useState<CmsItem[]>([]);
  const [selectedFields, setSelectedFields] = useState<string[]>([]);

  const [progress, setProgress] = useState({ done: 0, total: 0 });

  const apiFetch = async (url: string, opts?: RequestInit) => {
    const res = await fetch(url, { credentials: "include", ...opts });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? `HTTP ${res.status}`);
    }
    return res.json();
  };

  // 1. Check auth
  useEffect(() => {
    apiFetch("/api/auth/status")
      .then((d) => {
        if (d.authenticated) loadSites();
        else setStep("auth");
      })
      .catch(() => setStep("auth"));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadSites = async () => {
    try {
      const data = await apiFetch("/api/sites");
      const list: Site[] = data.sites ?? [];
      setSites(list);
      if (list.length === 1) {
        setSelectedSite(list[0].id);
        loadLocales(list[0].id);
      } else {
        setStep("site");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load sites");
      setStep("error");
    }
  };

  const loadLocales = async (siteId: string) => {
    try {
      const data = await apiFetch(`/api/locales?siteId=${siteId}`);
      const secondary = (data.secondaryLocales ?? []) as Locale[];
      setLocales(secondary);
      setStep("locale");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load locales");
      setStep("error");
    }
  };

  const loadCollections = async (siteId: string) => {
    try {
      const data = await apiFetch(`/api/collections?siteId=${siteId}`);
      setCollections(data.collections ?? []);
      setStep("collection");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load collections");
      setStep("error");
    }
  };

  const loadItems = async () => {
    if (!selectedCollection || !selectedLocale) return;
    try {
      const data = await apiFetch(
        `/api/items?collectionId=${selectedCollection}&cmsLocaleId=${selectedLocale.cmsLocaleId}`
      );
      const itemList: CmsItem[] = data.items ?? [];
      setItems(itemList);

      // Detect text fields from first item
      if (itemList.length > 0) {
        const firstFields = Object.entries(itemList[0].fieldData)
          .filter(([, v]) => typeof v === "string" && v.length > 0)
          .map(([k]) => k)
          .filter((k) => !["slug", "name", "_archived", "_draft"].includes(k));
        setSelectedFields(firstFields.slice(0, 3));

        const col = collections.find((c) => c.id === selectedCollection);
        setFields(firstFields.map((k) => ({ id: k, slug: k, displayName: k, type: "PlainText" })));
        void col;
      }

      setStep("items");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load items");
      setStep("error");
    }
  };

  const handleTranslate = async () => {
    if (!selectedLocale || !selectedCollection || items.length === 0 || selectedFields.length === 0) return;
    setStep("translating");
    setProgress({ done: 0, total: items.length });
    setError("");

    try {
      const translatedItems = [];

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const textsToTranslate = selectedFields
          .map((f) => item.fieldData[f])
          .filter(Boolean);

        if (textsToTranslate.length === 0) {
          setProgress({ done: i + 1, total: items.length });
          continue;
        }

        const res = await apiFetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            texts: textsToTranslate,
            targetLanguage: selectedLocale.displayName,
          }),
        });

        const translations: string[] = res.translations;
        const fieldData: Record<string, string> = {};
        selectedFields.forEach((f, idx) => {
          if (translations[idx]) fieldData[f] = translations[idx];
        });

        translatedItems.push({ itemId: item.id, fieldData });
        setProgress({ done: i + 1, total: items.length });
      }

      await apiFetch("/api/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          collectionId: selectedCollection,
          cmsLocaleId: selectedLocale.cmsLocaleId,
          items: translatedItems,
        }),
      });

      setStep("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Translation failed");
      setStep("error");
    }
  };

  const toggleField = (slug: string) => {
    setSelectedFields((prev) =>
      prev.includes(slug) ? prev.filter((f) => f !== slug) : [...prev, slug]
    );
  };

  return (
    <div className="flex flex-col h-screen bg-[#1a1a1a] text-[#e8e8e8] font-sans text-sm">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10 shrink-0">
        <span className="text-base">🌐</span>
        <span className="font-semibold text-white">Auto Translate</span>
      </div>

      <div className="flex flex-col gap-4 p-4 flex-1 overflow-auto">

        {/* Not authenticated */}
        {step === "auth" && (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-[#999]">Connect your Webflow account to get started.</p>
            <a
              href={`${process.env.NEXT_PUBLIC_APP_URL ?? "https://translationapp-ivory.vercel.app"}/install`}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full text-center bg-[#0073e6] hover:bg-[#0066cc] rounded px-3 py-2 text-sm font-medium text-white transition-colors"
            >
              Connect with Webflow →
            </a>
          </div>
        )}

        {/* Site selector */}
        {step === "site" && (
          <div className="flex flex-col gap-3">
            <div>
              <Label>Site</Label>
              <Select value={selectedSite} onChange={setSelectedSite}>
                <option value="">Select a site…</option>
                {sites.map((s) => <option key={s.id} value={s.id}>{s.displayName}</option>)}
              </Select>
            </div>
            <Btn
              variant="primary"
              onClick={() => { loadLocales(selectedSite); }}
              disabled={!selectedSite}
            >
              Continue
            </Btn>
          </div>
        )}

        {/* Locale + Collection */}
        {(step === "locale" || step === "collection" || step === "items") && (
          <div className="flex flex-col gap-3">
            <div>
              <Label>Target Language</Label>
              <Select
                value={selectedLocale?.id ?? ""}
                onChange={(v) => setSelectedLocale(locales.find((l) => l.id === v) ?? null)}
              >
                <option value="">Select locale…</option>
                {locales.map((l) => (
                  <option key={l.id} value={l.id}>{l.displayName} ({l.tag})</option>
                ))}
              </Select>
            </div>

            {step === "locale" && (
              <Btn
                variant="primary"
                onClick={() => loadCollections(selectedSite)}
                disabled={!selectedLocale}
              >
                Load Collections
              </Btn>
            )}

            {(step === "collection" || step === "items") && (
              <>
                <div>
                  <Label>Collection</Label>
                  <Select value={selectedCollection} onChange={setSelectedCollection}>
                    <option value="">Select collection…</option>
                    {collections.map((c) => (
                      <option key={c.id} value={c.id}>{c.displayName}</option>
                    ))}
                  </Select>
                </div>
                <Btn onClick={loadItems} disabled={!selectedCollection || !selectedLocale}>
                  Load Items
                </Btn>
              </>
            )}

            {step === "items" && fields.length > 0 && (
              <>
                <div>
                  <Label>Fields to translate</Label>
                  <div className="flex flex-col gap-1">
                    {fields.map((f) => (
                      <label key={f.slug} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedFields.includes(f.slug)}
                          onChange={() => toggleField(f.slug)}
                          className="accent-[#0073e6]"
                        />
                        <span className="text-xs text-[#ccc]">{f.displayName}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="text-xs text-[#666]">{items.length} items found</div>
                <Btn
                  variant="primary"
                  onClick={handleTranslate}
                  disabled={selectedFields.length === 0}
                >
                  Translate {items.length} items → {selectedLocale?.displayName}
                </Btn>
              </>
            )}
          </div>
        )}

        {/* Translating */}
        {step === "translating" && (
          <div className="flex flex-col gap-3">
            <div className="text-xs text-[#999]">
              Translating {progress.done} / {progress.total} items…
            </div>
            <div className="w-full bg-[#2a2a2a] rounded-full h-1.5">
              <div
                className="bg-[#0073e6] h-1.5 rounded-full transition-all"
                style={{ width: `${progress.total > 0 ? (progress.done / progress.total) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}

        {/* Done */}
        {step === "done" && (
          <div className="flex flex-col gap-3">
            <div className="bg-green-900/30 border border-green-700/40 rounded px-3 py-2 text-xs text-green-400">
              ✓ {progress.total} items translated to {selectedLocale?.displayName}
            </div>
            <Btn onClick={() => setStep("items")}>Translate Again</Btn>
          </div>
        )}

        {/* Error */}
        {step === "error" && (
          <div className="flex flex-col gap-3">
            <div className="bg-red-900/30 border border-red-700/40 rounded px-3 py-2 text-xs text-red-400">
              {error}
            </div>
            <Btn onClick={() => { setStep("auth"); setError(""); }}>Retry</Btn>
          </div>
        )}
      </div>

      <div className="px-4 py-2 border-t border-white/10 text-[10px] text-[#555] shrink-0">
        Powered by OpenAI gpt-4o-mini
      </div>
    </div>
  );
}
