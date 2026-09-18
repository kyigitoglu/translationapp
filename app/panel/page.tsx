"use client";

import { useEffect, useState, useCallback } from "react";

type Status = "idle" | "scanning" | "translating-one" | "translating-all" | "error";

interface TextNode {
  id: string;
  tag: string;
  text: string;
  translating?: boolean;
  translated?: string;
}

const TARGET_TAGS = ["h1","h2","h3","h4","h5","h6","p","a","span","button","label"];

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WF = any;

export default function PanelPage() {
  const [wf, setWf] = useState<WF>(null);
  const [sdkReady, setSdkReady] = useState(false);
  const [sdkMsg, setSdkMsg] = useState("Connecting to Webflow Designer…");

  const [language, setLanguage] = useState("Turkish");
  const [selected, setSelected] = useState<TextNode | null>(null);
  const [nodes, setNodes] = useState<TextNode[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [scanDone, setScanDone] = useState(false);

  const [debugMsgs, setDebugMsgs] = useState<string[]>([]);
  const [showDebug, setShowDebug] = useState(false);

  const addDebug = (msg: string) => setDebugMsgs((p) => [...p.slice(-19), msg]);

  // Init SDK
  useEffect(() => {
    const allMessages: string[] = [];

    // Listen for ALL postMessages from parent (Webflow Designer)
    const onMessage = (ev: MessageEvent) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = window as any;
      const full = typeof ev.data === "object" ? JSON.stringify(ev.data) : String(ev.data);
      const entry = `[${new Date().toISOString().slice(11,19)}] origin=${ev.origin}\n${full.slice(0, 300)}`;
      allMessages.push(entry);
      addDebug(entry);

      // If Webflow sends the sdk object via message, capture it
      if (ev.data && typeof ev.data === "object") {
        if (ev.data.webflow) w.webflow = ev.data.webflow;
        if (ev.data.type === "webflow:sdk:ready" || ev.data.type === "sdk:ready") {
          addDebug("SDK ready message received!");
        }
      }
    };
    window.addEventListener("message", onMessage);

    // Try sending multiple ready signals to see which one triggers SDK
    const signals = [
      { type: "webflow:extension:ready" },
      { type: "extensionReady" },
      { type: "wf:ready" },
      { type: "extension:ready" },
      { action: "init" },
      { msg: "ready" },
    ];
    signals.forEach((msg) => {
      try { window.parent?.postMessage(msg, "*"); } catch { /* cross-origin */ }
    });

    // Check injected scripts after a short delay
    setTimeout(() => {
      const scripts = Array.from(document.querySelectorAll("script[src]")).map((s) => (s as HTMLScriptElement).src);
      addDebug("Scripts loaded: " + (scripts.join(", ") || "none"));
    }, 1000);

    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    const tryInit = (): boolean => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = window as any;
      const sdk = w.webflow ?? w._webflow ?? w.__webflow ?? null;
      if (sdk && typeof sdk === "object") {
        setWf(sdk);
        setSdkReady(true);
        setSdkMsg("");
        addDebug("SDK found: " + Object.keys(sdk).slice(0, 5).join(", "));
        return true;
      }
      return false;
    };

    if (!tryInit()) {
      const interval = setInterval(() => {
        if (tryInit()) clearInterval(interval);
      }, 500);
      const timeout = setTimeout(() => {
        clearInterval(interval);
        setSdkMsg("SDK not connected. See debug below.");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const w = window as any;
        const wfKeys = Object.keys(w).filter(k => k.toLowerCase().includes("webflow") || k.toLowerCase().includes("wf") || k === "designer");
        addDebug("window wf-keys: " + (wfKeys.join(", ") || "none"));
        addDebug("in iframe: " + (window.parent !== window));
        setShowDebug(true);
      }, 8000);
      return () => { clearInterval(interval); clearTimeout(timeout); };
    }
  }, []);

  // Subscribe to selected element
  useEffect(() => {
    if (!wf || !sdkReady) return;

    let unsub: (() => void) | null = null;

    const subscribe = async () => {
      try {
        if (typeof wf.subscribe === "function") {
          unsub = wf.subscribe("currentElement", async (el: WF) => {
            if (!el) { setSelected(null); return; }
            const tag = await el.getTag?.();
            if (!TARGET_TAGS.includes(tag ?? "")) { setSelected(null); return; }
            const text = await el.getTextContent?.();
            if (!text?.trim()) { setSelected(null); return; }
            setSelected({ id: el.id, tag: tag ?? "?", text: text.trim() });
          });
        } else if (typeof wf.subscribeToCurrentElement === "function") {
          unsub = wf.subscribeToCurrentElement(async (el: WF) => {
            if (!el) { setSelected(null); return; }
            const tag = await el.getTag?.();
            if (!TARGET_TAGS.includes(tag ?? "")) { setSelected(null); return; }
            const text = await el.getTextContent?.();
            if (!text?.trim()) { setSelected(null); return; }
            setSelected({ id: el.id, tag: tag ?? "?", text: text.trim() });
          });
        }
      } catch { /* ignore */ }
    };

    subscribe();
    return () => { unsub?.(); };
  }, [wf, sdkReady]);

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

  const applyToElement = async (elementId: string, text: string) => {
    const all = await wf.getAllElements();
    const el = all.find((e: WF) => e.id === elementId);
    if (el) await el.setTextContent?.(text);
  };

  // Translate selected element
  const translateSelected = async () => {
    if (!selected || !wf) return;
    setStatus("translating-one");
    setError("");
    try {
      const [translated] = await callTranslate([selected.text]);
      await applyToElement(selected.id, translated);
      setSelected((s) => s ? { ...s, text: translated } : null);
      setStatus("idle");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
      setStatus("error");
    }
  };

  // Scan all page elements
  const scan = useCallback(async () => {
    if (!wf) return;
    setStatus("scanning");
    setError("");
    setScanDone(false);
    try {
      const all = await wf.getAllElements();
      const found: TextNode[] = [];
      for (const el of all) {
        const tag = await el.getTag?.();
        if (!TARGET_TAGS.includes(tag ?? "")) continue;
        const text = await el.getTextContent?.();
        if (!text?.trim()) continue;
        found.push({ id: el.id, tag: tag ?? "?", text: text.trim() });
      }
      setNodes(found);
      setScanDone(true);
      setStatus("idle");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scan failed");
      setStatus("error");
    }
  }, [wf]);

  // Translate single node from list
  const translateNode = async (index: number) => {
    setNodes((prev) => prev.map((n, i) => i === index ? { ...n, translating: true } : n));
    try {
      const [translated] = await callTranslate([nodes[index].text]);
      await applyToElement(nodes[index].id, translated);
      setNodes((prev) => prev.map((n, i) => i === index ? { ...n, text: translated, translated, translating: false } : n));
    } catch {
      setNodes((prev) => prev.map((n, i) => i === index ? { ...n, translating: false } : n));
    }
  };

  // Translate all nodes
  const translateAll = async () => {
    if (!wf || nodes.length === 0) return;
    setStatus("translating-all");
    setError("");
    try {
      const texts = nodes.map((n) => n.text);
      const translations = await callTranslate(texts);
      for (let i = 0; i < nodes.length; i++) {
        await applyToElement(nodes[i].id, translations[i]);
        setNodes((prev) => prev.map((n, idx) => idx === i ? { ...n, text: translations[i], translated: translations[i] } : n));
      }
      setStatus("idle");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Translation failed");
      setStatus("error");
    }
  };

  const busy = status === "scanning" || status === "translating-one" || status === "translating-all";

  return (
    <div className="flex flex-col h-screen bg-[#1a1a1a] text-[#e8e8e8] text-sm font-sans">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10 shrink-0">
        <span>🌐</span>
        <span className="font-semibold text-white">Auto Translate</span>
      </div>

      <div className="flex flex-col gap-4 p-4 flex-1 overflow-auto">

        {/* SDK not ready */}
        {!sdkReady && (
          <div className="bg-yellow-900/30 border border-yellow-700/40 rounded px-3 py-2 text-xs text-yellow-300">
            {sdkMsg || "Connecting…"}
            <button onClick={() => setShowDebug((v) => !v)} className="ml-2 underline opacity-60">debug</button>
          </div>
        )}

        {/* Debug panel */}
        {showDebug && (
          <div className="bg-[#111] border border-white/10 rounded px-2 py-2 text-[10px] font-mono text-[#666] space-y-0.5 max-h-48 overflow-auto">
            {debugMsgs.length === 0 ? <div>No messages received</div> : debugMsgs.map((m, i) => <div key={i}>{m}</div>)}
          </div>
        )}

        {/* Language */}
        <div>
          <p className="text-[10px] uppercase tracking-widest text-[#666] mb-1">Target Language</p>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="w-full bg-[#2a2a2a] border border-white/10 rounded px-2 py-1.5 text-white text-sm focus:outline-none focus:border-[#0073e6]"
          >
            {LANGUAGES.map((l) => (
              <option key={l.value} value={l.value}>{l.label}</option>
            ))}
          </select>
        </div>

        {/* Selected element */}
        {selected && (
          <div className="flex flex-col gap-2">
            <p className="text-[10px] uppercase tracking-widest text-[#666]">Selected Element</p>
            <div className="bg-[#242424] rounded px-3 py-2 flex flex-col gap-1">
              <span className="text-[#0073e6] font-mono text-xs">{`<${selected.tag}>`}</span>
              <span className="text-[#ccc] text-xs leading-relaxed line-clamp-2">{selected.text}</span>
            </div>
            <button
              onClick={translateSelected}
              disabled={busy}
              className="w-full bg-[#0073e6] hover:bg-[#0066cc] rounded px-3 py-2 text-sm text-white font-medium transition-colors disabled:opacity-40"
            >
              {status === "translating-one" ? "Translating…" : `Translate to ${language}`}
            </button>
          </div>
        )}

        {/* Divider */}
        {selected && <div className="border-t border-white/10" />}

        {/* Scan all */}
        <button
          onClick={scan}
          disabled={busy || !sdkReady}
          className="w-full bg-[#2a2a2a] hover:bg-[#333] border border-white/10 rounded px-3 py-2 text-sm text-white transition-colors disabled:opacity-40"
        >
          {status === "scanning" ? "Scanning…" : "Scan All Page Elements"}
        </button>

        {/* Scanned nodes list */}
        {scanDone && nodes.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-widest text-[#666]">{nodes.length} elements</p>
            </div>
            <div className="flex flex-col gap-1 max-h-48 overflow-auto">
              {nodes.map((n, i) => (
                <div key={i} className="flex items-center gap-2 bg-[#242424] rounded px-2 py-1.5">
                  <span className="text-[#0073e6] font-mono text-[10px] shrink-0">{`<${n.tag}>`}</span>
                  <span className={`text-xs flex-1 truncate ${n.translated ? "text-green-400" : "text-[#aaa]"}`}>
                    {n.text}
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
              {status === "translating-all" ? "Translating…" : `Translate All to ${language}`}
            </button>
          </div>
        )}

        {scanDone && nodes.length === 0 && (
          <p className="text-xs text-[#555]">No text elements found on this page.</p>
        )}

        {/* Error */}
        {status === "error" && error && (
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
