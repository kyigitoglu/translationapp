"use client";

import { useEffect, useState, useCallback, useRef } from "react";

// Custom dropdown to avoid native <select> triggering Webflow Designer keyboard shortcuts
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
        <span className={selected ? "text-white" : "text-[#555]"}>{selected?.label ?? placeholder ?? "Select…"}</span>
        <span className="text-[#555] text-xs">{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-0.5 bg-[#2a2a2a] border border-white/10 rounded shadow-xl max-h-48 overflow-auto">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={(e) => { e.stopPropagation(); onChange(o.value); setOpen(false); }}
              className={`w-full text-left px-3 py-1.5 text-sm hover:bg-white/5 transition-colors ${o.value === value ? "text-[#0073e6]" : "text-[#ccc]"}`}
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

// Fields to skip (non-translatable)
const SKIP_FIELDS = new Set(["slug", "_archived", "_draft", "_id", "_cid", "updated-on", "created-on", "published-on", "updated-by", "created-by", "published-by"]);

interface Site { id: string; displayName: string; }
interface Collection { id: string; displayName: string; }
interface ItemField { slug: string; label: string; value: string; translated?: string; translating?: boolean; }
interface Item { id: string; name: string; fields: ItemField[]; expanded: boolean; translating?: boolean; }

type Stage = "auth" | "sites" | "collections" | "items";

export default function PanelPage() {
  const [language, setLanguage] = useState("Turkish");
  const [stage, setStage] = useState<Stage>("auth");
  const [authed, setAuthed] = useState(false);
  const [error, setError] = useState("");

  const [sites, setSites] = useState<Site[]>([]);
  const [siteId, setSiteId] = useState("");

  const [locales, setLocales] = useState<{ id: string; label: string; tag: string }[]>([]);
  const [cmsLocaleId, setCmsLocaleId] = useState("");
  const [manualLocaleId, setManualLocaleId] = useState("");

  const [collections, setCollections] = useState<Collection[]>([]);
  const [collectionId, setCollectionId] = useState("");

  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [translatingAll, setTranslatingAll] = useState(false);

  // Check auth on mount
  useEffect(() => {
    fetch("/api/auth/status", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        if (d.authenticated) {
          setAuthed(true);
          setStage("sites");
        } else {
          setStage("auth");
        }
      })
      .catch(() => setStage("auth"));
  }, []);

  // Load sites when stage changes to "sites"
  useEffect(() => {
    if (stage !== "sites") return;
    setLoading(true);
    setError("");
    fetch("/api/sites", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        const list: Site[] = (d.sites ?? []).map((s: { id: string; displayName: string }) => ({ id: s.id, displayName: s.displayName }));
        setSites(list);
        if (list.length === 1) setSiteId(list[0].id);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [stage]);

  // Load collections + locales when site changes
  useEffect(() => {
    if (!siteId) return;
    setCollections([]);
    setCollectionId("");
    setItems([]);
    setLocales([]);
    setCmsLocaleId("");
    setLoading(true);
    setError("");

    Promise.all([
      fetch(`/api/collections?siteId=${siteId}`, { credentials: "include" }).then((r) => r.json()),
      fetch(`/api/locales?siteId=${siteId}`, { credentials: "include" }).then((r) => r.json()),
    ])
      .then(([colData, locData]) => {
        if (colData.error) throw new Error(colData.error);
        const list: Collection[] = (colData.collections ?? []).map((c: { id: string; displayName: string }) => ({ id: c.id, displayName: c.displayName }));
        setCollections(list);

        // Locales (secondary only — these are what we write translations to)
        const secondary = locData.secondaryLocales ?? [];
        if (secondary.length > 0) {
          const mapped = secondary.map((l: { id: string; displayName: string; tag: string; cmsId?: string }) => ({
            id: l.cmsId ?? l.id,
            label: l.displayName ?? l.tag,
            tag: l.tag,
          }));
          setLocales(mapped);
          setCmsLocaleId(mapped[0].id);
        }
        setStage("collections");
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [siteId]);

  const loadItems = useCallback(async () => {
    if (!collectionId) return;
    setLoading(true);
    setError("");
    setItems([]);
    try {
      const r = await fetch(`/api/items?collectionId=${collectionId}`, { credentials: "include" });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      const rawItems = d.items ?? [];
      const parsed: Item[] = rawItems.map((item: { id: string; fieldData: Record<string, string> }) => {
        const fd = item.fieldData ?? {};
        const fields: ItemField[] = Object.entries(fd)
          .filter(([slug, val]) => !SKIP_FIELDS.has(slug) && typeof val === "string" && val.trim().length > 0)
          .map(([slug, val]) => ({ slug, label: slug, value: String(val) }));
        return {
          id: item.id,
          name: String(fd.name ?? fd.slug ?? item.id),
          fields,
          expanded: false,
        };
      });
      setItems(parsed);
      setStage("items");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load items");
    } finally {
      setLoading(false);
    }
  }, [collectionId]);

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

  const updateItem = async (itemId: string, fieldData: Record<string, string>) => {
    const effectiveLocaleId = cmsLocaleId || manualLocaleId || undefined;
    const res = await fetch(`/api/items/update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ collectionId, itemId, fieldData, cmsLocaleId: effectiveLocaleId }),
    });
    if (!res.ok) {
      const d = await res.json();
      throw new Error(d.error ?? "Update failed");
    }
  };

  const translateItem = async (itemIndex: number) => {
    const item = items[itemIndex];
    if (!item || item.fields.length === 0) return;

    setItems((prev) => prev.map((it, i) => i === itemIndex ? { ...it, translating: true } : it));
    try {
      const texts = item.fields.map((f) => f.value);
      const translations = await callTranslate(texts);
      const fieldData: Record<string, string> = {};
      const updatedFields = item.fields.map((f, fi) => {
        fieldData[f.slug] = translations[fi];
        return { ...f, translated: translations[fi] };
      });
      await updateItem(item.id, fieldData);
      setItems((prev) => prev.map((it, i) => i === itemIndex ? { ...it, fields: updatedFields, translating: false } : it));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
      setItems((prev) => prev.map((it, i) => i === itemIndex ? { ...it, translating: false } : it));
    }
  };

  const translateAll = async () => {
    if (items.length === 0) return;
    setTranslatingAll(true);
    setError("");
    for (let i = 0; i < items.length; i++) {
      if (items[i].fields.length > 0) {
        await translateItem(i);
      }
    }
    setTranslatingAll(false);
  };

  const toggleExpand = (i: number) => setItems((prev) => prev.map((it, idx) => idx === i ? { ...it, expanded: !it.expanded } : it));

  const anyTranslated = items.some((it) => it.fields.some((f) => f.translated));

  return (
    <div className="flex flex-col h-screen bg-[#1a1a1a] text-[#e8e8e8] text-sm font-sans">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10 shrink-0">
        <span className="text-base">🌐</span>
        <span className="font-semibold text-white">Auto Translate</span>
      </div>

      <div className="flex flex-col gap-3 p-4 flex-1 overflow-auto">

        {/* Not authenticated */}
        {stage === "auth" && (
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

        {authed && (
          <>
            {/* Language */}
            <div>
              <p className="text-[10px] uppercase tracking-widest text-[#666] mb-1">Target Language</p>
              <Dropdown
                value={language}
                onChange={setLanguage}
                options={LANGUAGES}
              />
            </div>

            {/* Site */}
            {sites.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-widest text-[#666] mb-1">Site</p>
                <Dropdown
                  value={siteId}
                  onChange={(v) => { setSiteId(v); setCollectionId(""); setItems([]); }}
                  options={sites.map((s) => ({ label: s.displayName, value: s.id }))}
                  placeholder="Select a site…"
                />
              </div>
            )}

            {/* Collection */}
            {collections.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-widest text-[#666] mb-1">Collection</p>
                <Dropdown
                  value={collectionId}
                  onChange={(v) => { setCollectionId(v); setItems([]); }}
                  options={collections.map((c) => ({ label: c.displayName, value: c.id }))}
                  placeholder="Select a collection…"
                />
              </div>
            )}

            {/* Target Locale */}
            {collectionId && (
              <div>
                <p className="text-[10px] uppercase tracking-widest text-[#666] mb-1">
                  Target Locale
                  {locales.length > 0 && <span className="ml-1 text-green-400">✓ detected</span>}
                </p>
                {locales.length > 0 ? (
                  <Dropdown
                    value={cmsLocaleId}
                    onChange={setCmsLocaleId}
                    options={locales.map((l) => ({ label: `${l.label} (${l.tag})`, value: l.id }))}
                    placeholder="Select locale…"
                  />
                ) : (
                  <div className="flex flex-col gap-1">
                    <input
                      type="text"
                      placeholder="Paste FR locale ID (from Webflow)"
                      value={manualLocaleId}
                      onChange={(e) => setManualLocaleId(e.target.value)}
                      className="w-full bg-[#2a2a2a] border border-white/10 rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:border-[#0073e6] placeholder:text-[#444]"
                    />
                    <p className="text-[9px] text-[#444]">Leave empty to overwrite primary (EN) content</p>
                  </div>
                )}
              </div>
            )}

            {/* Load items button */}
            {collectionId && (
              <button
                onClick={loadItems}
                disabled={loading}
                className="w-full bg-[#2a2a2a] hover:bg-[#333] border border-white/10 rounded px-3 py-2 text-sm text-white transition-colors disabled:opacity-40"
              >
                {loading ? "Loading…" : "Load Items"}
              </button>
            )}

            {/* Items list */}
            {items.length > 0 && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] uppercase tracking-widest text-[#666]">{items.length} items</p>
                  {anyTranslated && <span className="text-[10px] text-green-400">✓ updated</span>}
                </div>

                <div className="flex flex-col gap-1 max-h-64 overflow-auto pr-0.5">
                  {items.map((item, i) => (
                    <div key={item.id} className="bg-[#242424] rounded overflow-hidden">
                      <div className="flex items-center gap-2 px-2 py-1.5">
                        <button
                          onClick={() => toggleExpand(i)}
                          className="text-[10px] text-[#555] shrink-0"
                        >
                          {item.expanded ? "▾" : "▸"}
                        </button>
                        <span className="text-xs flex-1 truncate text-[#ccc]">{item.name}</span>
                        <button
                          onClick={() => translateItem(i)}
                          disabled={translatingAll || item.translating}
                          className="shrink-0 text-[10px] text-[#0073e6] hover:text-white disabled:opacity-40 transition-colors px-1"
                        >
                          {item.translating ? "…" : "↻"}
                        </button>
                      </div>
                      {item.expanded && (
                        <div className="px-2 pb-2 flex flex-col gap-1 border-t border-white/5 pt-1">
                          {item.fields.map((f) => (
                            <div key={f.slug} className="flex flex-col gap-0.5">
                              <span className="text-[9px] text-[#555] uppercase">{f.label}</span>
                              <span className="text-[10px] text-[#888] truncate">{f.value.slice(0, 80)}</span>
                              {f.translated && (
                                <span className="text-[10px] text-green-400 truncate">→ {f.translated.slice(0, 80)}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <button
                  onClick={translateAll}
                  disabled={translatingAll || loading}
                  className="w-full bg-[#0073e6] hover:bg-[#0066cc] rounded px-3 py-2 text-sm text-white font-medium transition-colors disabled:opacity-40"
                >
                  {translatingAll ? "Translating…" : `Translate All to ${language}`}
                </button>
              </div>
            )}

            {stage === "items" && items.length === 0 && !loading && (
              <p className="text-xs text-[#555]">No items found in this collection.</p>
            )}
          </>
        )}

        {/* Loading spinner */}
        {loading && (
          <div className="text-xs text-[#555] text-center py-2">Loading…</div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-900/30 border border-red-700/40 rounded px-3 py-2 text-xs text-red-400">
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
