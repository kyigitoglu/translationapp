"use client";

import { useEffect, useState, useCallback, useRef } from "react";

// Custom dropdown — prevents native <select> from leaking key events to Webflow Designer
function Dropdown({ value, onChange, options, placeholder }: {
  value: string;
  onChange: (v: string) => void;
  options: { label: string; value: string }[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  return (
    <div ref={ref} className="relative w-full">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="w-full bg-[#2a2a2a] border border-white/10 rounded px-2 py-1.5 text-sm text-left flex items-center justify-between focus:outline-none focus:border-[#0073e6]"
      >
        <span className={selected ? "text-white truncate" : "text-[#555]"}>{selected?.label ?? placeholder ?? "Select…"}</span>
        <span className="text-[#555] text-xs ml-1 shrink-0">{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-0.5 bg-[#2a2a2a] border border-white/10 rounded shadow-xl max-h-48 overflow-auto">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={(e) => { e.stopPropagation(); onChange(o.value); setOpen(false); }}
              className={`w-full text-left px-3 py-1.5 text-sm hover:bg-white/5 transition-colors truncate ${o.value === value ? "text-[#0073e6]" : "text-[#ccc]"}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const LANGUAGES = [
  { label: "Turkish", value: "Turkish" },
  { label: "German", value: "German" },
  { label: "French", value: "French" },
  { label: "Spanish", value: "Spanish" },
  { label: "Italian", value: "Italian" },
  { label: "Dutch", value: "Dutch" },
  { label: "Portuguese", value: "Portuguese" },
  { label: "Arabic", value: "Arabic" },
  { label: "Japanese", value: "Japanese" },
  { label: "Chinese", value: "Chinese (Simplified)" },
];

interface Site { id: string; displayName: string; }
interface Page { id: string; title: string; slug: string; }
interface Locale { id: string; label: string; tag: string; }
interface TextNode { nodeId: string; text: string; translated?: string; translating?: boolean; }

export default function PanelPage() {
  const [language, setLanguage] = useState("Turkish");
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [error, setError] = useState("");

  // Manual translate
  const [manualText, setManualText] = useState("");
  const [manualResult, setManualResult] = useState("");
  const [manualBusy, setManualBusy] = useState(false);

  const [sites, setSites] = useState<Site[]>([]);
  const [siteId, setSiteId] = useState("");

  const [locales, setLocales] = useState<Locale[]>([]);
  const [localeId, setLocaleId] = useState("");

  const [pages, setPages] = useState<Page[]>([]);
  const [pageId, setPageId] = useState("");

  const [textNodes, setTextNodes] = useState<TextNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [translatingAll, setTranslatingAll] = useState(false);

  // Check auth
  useEffect(() => {
    fetch("/api/auth/status", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setAuthed(!!d.authenticated))
      .catch(() => setAuthed(false));
  }, []);

  // Load sites on auth
  useEffect(() => {
    if (!authed) return;
    fetch("/api/sites", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        const list: Site[] = (d.sites ?? []).map((s: { id: string; displayName: string }) => ({ id: s.id, displayName: s.displayName }));
        setSites(list);
        if (list.length === 1) setSiteId(list[0].id);
      })
      .catch(() => { });
  }, [authed]);

  // Load pages + locales when site changes
  useEffect(() => {
    if (!siteId) return;
    setPages([]);
    setPageId("");
    setLocales([]);
    setLocaleId("");
    setTextNodes([]);
    setLoading(true);

    Promise.all([
      fetch(`/api/pages?siteId=${siteId}`, { credentials: "include" }).then((r) => r.json()),
      fetch(`/api/locales?siteId=${siteId}`, { credentials: "include" }).then((r) => r.json()),
    ]).then(([pData, lData]) => {
      const pageList: Page[] = (pData.pages ?? []).map((p: { id: string; title: string; slug: string }) => ({
        id: p.id, title: p.title || p.slug || p.id, slug: p.slug,
      }));
      setPages(pageList);

      const secondary: Locale[] = (lData.secondaryLocales ?? []).map((l: { id: string; cmsId?: string; displayName?: string; tag: string }) => ({
        id: l.cmsId ?? l.id,
        label: l.displayName ?? l.tag,
        tag: l.tag,
      }));
      setLocales(secondary);
      if (secondary.length > 0) setLocaleId(secondary[0].id);
    }).catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [siteId]);

  // Load page DOM text nodes
  const loadPage = useCallback(async () => {
    if (!pageId) return;
    setLoading(true);
    setError("");
    setTextNodes([]);
    try {
      const params = new URLSearchParams({ pageId });
      if (localeId) params.set("localeId", localeId);
      const r = await fetch(`/api/pages/dom?${params}`, { credentials: "include" });
      const d = await r.json();
      if (d.error) throw new Error(typeof d.error === "string" ? d.error : JSON.stringify(d.error));
      setTextNodes((d.textNodes ?? []).map((n: TextNode) => ({ ...n })));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load page");
    } finally {
      setLoading(false);
    }
  }, [pageId, localeId]);

  const callTranslate = async (texts: string[]): Promise<string[]> => {
    const res = await fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ texts, targetLanguage: language }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Translation failed");
    return data.translations as string[];
  };

  const applyNodes = async (nodes: { nodeId: string; text: string }[]) => {
    const res = await fetch("/api/pages/dom", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ pageId, nodes, localeId: localeId || undefined }),
    });
    if (!res.ok) {
      const d = await res.json();
      throw new Error(d.error ?? "Apply failed");
    }
  };

  const translateNode = async (index: number) => {
    setTextNodes((prev) => prev.map((n, i) => i === index ? { ...n, translating: true } : n));
    try {
      const [translated] = await callTranslate([textNodes[index].text]);
      await applyNodes([{ nodeId: textNodes[index].nodeId, text: translated }]);
      setTextNodes((prev) => prev.map((n, i) => i === index ? { ...n, translated, translating: false } : n));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
      setTextNodes((prev) => prev.map((n, i) => i === index ? { ...n, translating: false } : n));
    }
  };

  const translateAll = async () => {
    if (textNodes.length === 0) return;
    setTranslatingAll(true);
    setError("");
    try {
      const texts = textNodes.map((n) => n.text);
      const translations = await callTranslate(texts);
      await applyNodes(textNodes.map((n, i) => ({ nodeId: n.nodeId, text: translations[i] })));
      setTextNodes((prev) => prev.map((n, i) => ({ ...n, translated: translations[i] })));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Translation failed");
    } finally {
      setTranslatingAll(false);
    }
  };

  const translateManual = async () => {
    if (!manualText.trim()) return;
    setManualBusy(true);
    setManualResult("");
    try {
      const [translated] = await callTranslate([manualText.trim()]);
      setManualResult(translated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setManualBusy(false);
    }
  };

  const anyTranslated = textNodes.some((n) => n.translated);
  const busy = loading || translatingAll;

  return (
    <div className="flex flex-col h-screen bg-[#1a1a1a] text-[#e8e8e8] text-sm font-sans">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10 shrink-0">
        <span className="text-base">🌐</span>
        <span className="font-semibold text-white">Auto Translate</span>
      </div>

      <div className="flex flex-col gap-3 p-4 flex-1 overflow-auto">

        {/* Not authenticated */}
        {authed === false && (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-[#aaa]">Connect your Webflow account to get started.</p>
            <a
              href="/install"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full bg-[#0073e6] hover:bg-[#0066cc] rounded px-3 py-2 text-sm text-white font-medium text-center transition-colors"
            >
              Connect Webflow Account
            </a>
          </div>
        )}

        {authed === null && (
          <div className="text-xs text-[#555] text-center py-4">Connecting…</div>
        )}

        {authed && (
          <>
            {/* Language */}
            <div>
              <p className="text-[10px] uppercase tracking-widest text-[#666] mb-1">Target Language</p>
              <Dropdown value={language} onChange={setLanguage} options={LANGUAGES} />
            </div>

            {/* Manual translate */}
            <div className="flex flex-col gap-1.5">
              <p className="text-[10px] uppercase tracking-widest text-[#666]">Quick Translate</p>
              <textarea
                value={manualText}
                onChange={(e) => { setManualText(e.target.value); setManualResult(""); }}
                placeholder="Paste or type text here…"
                rows={3}
                className="w-full bg-[#2a2a2a] border border-white/10 rounded px-2 py-1.5 text-white text-xs resize-none focus:outline-none focus:border-[#0073e6] placeholder:text-[#444]"
              />
              {manualResult && (
                <div className="bg-[#1e2e1e] border border-green-800/40 rounded px-2 py-1.5 text-xs text-green-400 select-all">
                  {manualResult}
                </div>
              )}
              <button
                onClick={translateManual}
                disabled={manualBusy || !manualText.trim()}
                className="w-full bg-[#0073e6] hover:bg-[#0066cc] rounded px-3 py-1.5 text-xs text-white font-medium transition-colors disabled:opacity-40"
              >
                {manualBusy ? "Translating…" : `Translate to ${language}`}
              </button>
            </div>

            <div className="border-t border-white/10" />

            {/* Site */}
            {sites.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-widest text-[#666] mb-1">Site</p>
                <Dropdown
                  value={siteId}
                  onChange={(v) => { setSiteId(v); setPageId(""); setTextNodes([]); }}
                  options={sites.map((s) => ({ label: s.displayName, value: s.id }))}
                  placeholder="Select a site…"
                />
              </div>
            )}

            {/* Locale */}
            {siteId && locales.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-widest text-[#666] mb-1">
                  Translate Into <span className="text-green-400">✓</span>
                </p>
                <Dropdown
                  value={localeId}
                  onChange={setLocaleId}
                  options={locales.map((l) => ({ label: `${l.label} (${l.tag})`, value: l.id }))}
                />
              </div>
            )}

            {/* Page */}
            {pages.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-widest text-[#666] mb-1">Page</p>
                <Dropdown
                  value={pageId}
                  onChange={(v) => { setPageId(v); setTextNodes([]); }}
                  options={pages.map((p) => ({ label: p.title, value: p.id }))}
                  placeholder="Select a page…"
                />
              </div>
            )}

            {/* Scan page button */}
            {pageId && (
              <button
                onClick={loadPage}
                disabled={busy}
                className="w-full bg-[#2a2a2a] hover:bg-[#333] border border-white/10 rounded px-3 py-2 text-sm text-white transition-colors disabled:opacity-40"
              >
                {loading ? "Scanning…" : "Scan Page Text"}
              </button>
            )}

            {/* Text nodes list */}
            {textNodes.length > 0 && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] uppercase tracking-widest text-[#666]">{textNodes.length} text elements</p>
                  {anyTranslated && <span className="text-[10px] text-green-400">✓ applied</span>}
                </div>

                <div className="flex flex-col gap-1 max-h-56 overflow-auto pr-0.5">
                  {textNodes.map((n, i) => (
                    <div key={n.nodeId} className="flex items-center gap-2 bg-[#242424] rounded px-2 py-1.5">
                      <span className={`text-xs flex-1 truncate ${n.translated ? "text-green-400" : "text-[#aaa]"}`}>
                        {n.translated ?? n.text}
                      </span>
                      <button
                        onClick={() => translateNode(i)}
                        disabled={busy || n.translating}
                        className="shrink-0 text-[10px] text-[#0073e6] hover:text-white disabled:opacity-40 transition-colors"
                      >
                        {n.translating ? "…" : "↻"}
                      </button>
                    </div>
                  ))}
                </div>

                <button
                  onClick={translateAll}
                  disabled={busy}
                  className="w-full bg-[#0073e6] hover:bg-[#0066cc] rounded px-3 py-2 text-sm text-white font-medium transition-colors disabled:opacity-40"
                >
                  {translatingAll ? "Translating…" : `Translate All to ${language}`}
                </button>
              </div>
            )}

            {textNodes.length === 0 && pageId && !loading && (
              <p className="text-xs text-[#555]">No text elements found. Try scanning the page.</p>
            )}
          </>
        )}

        {loading && textNodes.length === 0 && (
          <div className="text-xs text-[#555] text-center py-2">Loading…</div>
        )}

        {error && (
          <div className="bg-red-900/30 border border-red-700/40 rounded px-3 py-2 text-xs text-red-400 break-words">
            {error}
          </div>
        )}
      </div>

      <div className="px-4 py-2 border-t border-white/10 text-[10px] text-[#555] shrink-0">
        Powered by OpenAI gpt-4o-mini
      </div>
    </div>
  );
}
