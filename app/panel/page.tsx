"use client";

import { useEffect, useState, useCallback } from "react";

interface Locale {
  id: string;
  cmsLocaleId: string;
  displayName: string;
  shortName: string;
  tag: string;
  enabled: boolean;
  primary: boolean;
}

interface ElementText {
  elementId: string;
  label: string;
  text: string;
}

type Status = "idle" | "loading" | "translating" | "applying" | "done" | "error";

const LANGUAGE_MAP: Record<string, string> = {
  tr: "Turkish",
  de: "German",
  fr: "French",
  es: "Spanish",
  it: "Italian",
  nl: "Dutch",
  pt: "Portuguese",
  pl: "Polish",
  ru: "Russian",
  ja: "Japanese",
  zh: "Chinese (Simplified)",
  ar: "Arabic",
  sv: "Swedish",
  da: "Danish",
  fi: "Finnish",
  nb: "Norwegian",
  ko: "Korean",
};

function getLanguageName(tag: string): string {
  const base = tag.split("-")[0].toLowerCase();
  return LANGUAGE_MAP[base] ?? tag;
}

export default function PanelPage() {
  const [siteId, setSiteId] = useState<string>("");
  const [locales, setLocales] = useState<Locale[]>([]);
  const [selectedLocale, setSelectedLocale] = useState<Locale | null>(null);
  const [elementTexts, setElementTexts] = useState<ElementText[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [translatedCount, setTranslatedCount] = useState(0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [wf, setWf] = useState<any>(null);

  // Init Webflow Designer SDK — retry until available
  useEffect(() => {
    const init = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sdk = (typeof webflow !== "undefined" ? webflow : null) ?? (window as any).webflow ?? null;
      if (sdk) {
        setWf(sdk);
        return true;
      }
      return false;
    };

    if (!init()) {
      const interval = setInterval(() => {
        if (init()) clearInterval(interval);
      }, 200);
      return () => clearInterval(interval);
    }
  }, []);

  // Fetch site ID from Webflow and then locales
  const loadLocales = useCallback(async () => {
    if (!wf) return;
    setStatus("loading");
    setErrorMsg("");
    try {
      const info = await wf.getSiteInfo();
      setSiteId(info.siteId);

      const res = await fetch(`/api/locales?siteId=${info.siteId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to fetch locales");

      const secondary = (data.secondaryLocales ?? []) as Locale[];
      setLocales(secondary);
      if (secondary.length > 0) setSelectedLocale(secondary[0]);
      setStatus("idle");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to load locales");
      setStatus("error");
    }
  }, [wf]);

  useEffect(() => {
    loadLocales();
  }, [loadLocales]);

  // Scan selected elements for text content
  const scanElements = useCallback(async () => {
    if (!wf) return;
    setStatus("loading");
    setErrorMsg("");
    try {
      const selected = await wf.getAllElements();
      const texts: ElementText[] = [];

      for (const el of selected) {
        const tag = await el.getTag();
        if (!["h1","h2","h3","h4","h5","h6","p","a","span","button","label"].includes(tag ?? "")) continue;
        const textContent = await el.getTextContent?.();
        if (!textContent?.trim()) continue;
        texts.push({
          elementId: el.id,
          label: `<${tag}>`,
          text: textContent.trim(),
        });
      }

      setElementTexts(texts);
      setStatus("idle");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to scan elements");
      setStatus("error");
    }
  }, [wf]);

  const handleTranslate = async () => {
    if (!selectedLocale || elementTexts.length === 0) return;
    setStatus("translating");
    setErrorMsg("");
    setTranslatedCount(0);

    try {
      const texts = elementTexts.map((e) => e.text);
      const languageName = getLanguageName(selectedLocale.tag);

      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          texts,
          targetLocale: selectedLocale.cmsLocaleId,
          targetLanguage: languageName,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Translation failed");

      const translations: string[] = data.translations;
      setStatus("applying");

      // Apply translations via Webflow Designer SDK
      for (let i = 0; i < elementTexts.length; i++) {
        const { elementId } = elementTexts[i];
        const translated = translations[i];
        if (!translated) continue;

        const el = await wf?.getElementByExternalId?.(elementId);
        if (!el) continue;

        await el.setTextContent?.(translated, { locale: selectedLocale.tag });
        setTranslatedCount(i + 1);
      }

      setStatus("done");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong");
      setStatus("error");
    }
  };

  const isWorking = status === "loading" || status === "translating" || status === "applying";

  return (
    <div className="flex flex-col h-screen bg-[#1a1a1a] text-[#e8e8e8] font-sans text-sm">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10">
        <span className="text-base">🌐</span>
        <span className="font-semibold text-white">Auto Translate</span>
      </div>

      <div className="flex flex-col gap-4 p-4 flex-1 overflow-auto">
        {/* Locale selector */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-[#999] uppercase tracking-wide">Target Language</label>
          {locales.length === 0 ? (
            <p className="text-xs text-[#666]">
              {status === "loading" ? "Loading locales…" : "No secondary locales found."}
            </p>
          ) : (
            <select
              className="bg-[#2a2a2a] border border-white/10 rounded px-2 py-1.5 text-white text-sm focus:outline-none focus:border-[#0073e6]"
              value={selectedLocale?.id ?? ""}
              onChange={(e) => {
                const loc = locales.find((l) => l.id === e.target.value);
                setSelectedLocale(loc ?? null);
              }}
            >
              {locales.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.displayName} ({l.tag})
                </option>
              ))}
            </select>
          )}
        </div>

        {!wf && (
          <div className="bg-yellow-900/30 border border-yellow-700/40 rounded px-3 py-2 text-xs text-yellow-400">
            Webflow Designer SDK yükleniyor…
          </div>
        )}

        {/* Scan button */}
        <button
          onClick={scanElements}
          disabled={isWorking || !wf}
          className="bg-[#2a2a2a] hover:bg-[#333] border border-white/10 rounded px-3 py-2 text-sm text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Scan Page Elements
        </button>

        {/* Element list */}
        {elementTexts.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs text-[#999] uppercase tracking-wide">Found Texts</label>
              <span className="text-xs text-[#666]">{elementTexts.length} elements</span>
            </div>
            <div className="flex flex-col gap-1 max-h-48 overflow-auto">
              {elementTexts.map((el, i) => (
                <div
                  key={el.elementId + i}
                  className="flex gap-2 bg-[#242424] rounded px-2 py-1.5 items-start"
                >
                  <span className="text-[#0073e6] font-mono text-xs shrink-0 mt-0.5">{el.label}</span>
                  <span className="text-[#ccc] text-xs truncate">{el.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Translate button */}
        {elementTexts.length > 0 && selectedLocale && (
          <button
            onClick={handleTranslate}
            disabled={isWorking}
            className="bg-[#0073e6] hover:bg-[#0066cc] rounded px-3 py-2 text-sm text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {status === "translating"
              ? "Translating…"
              : status === "applying"
              ? `Applying (${translatedCount}/${elementTexts.length})…`
              : `Translate to ${selectedLocale.displayName}`}
          </button>
        )}

        {/* Status messages */}
        {status === "done" && (
          <div className="bg-green-900/30 border border-green-700/40 rounded px-3 py-2 text-xs text-green-400">
            ✓ {translatedCount} elements translated to {selectedLocale?.displayName}
          </div>
        )}
        {status === "error" && errorMsg && (
          <div className="bg-red-900/30 border border-red-700/40 rounded px-3 py-2 text-xs text-red-400">
            {errorMsg}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-white/10 text-[10px] text-[#555]">
        Powered by OpenAI gpt-4o-mini
      </div>
    </div>
  );
}
