import { NextRequest, NextResponse } from "next/server";
import { getWfToken } from "@/lib/auth";

// Extract all text strings from Webflow DOM node tree (walks all levels including components/slots)
function extractTextNodes(nodes: WFNode[]): TextEntry[] {
  const results: TextEntry[] = [];
  const seen = new Set<string>();

  function walk(node: WFNode) {
    // Text node with actual content
    if (node.text?.text) {
      const text = node.text.text.trim();
      if (text.length > 1 && !seen.has(text)) {
        seen.add(text);
        results.push({ nodeId: node.id, text, type: node.type ?? "text" });
      }
    }
    // Recurse into children (covers components, slots, divs, etc.)
    if (Array.isArray(node.children)) {
      for (const child of node.children) walk(child);
    }
    // Some node shapes use "nodes" instead of "children"
    if (Array.isArray(node.nodes)) {
      for (const child of node.nodes) walk(child);
    }
  }

  for (const node of nodes) walk(node);
  return results;
}

interface WFNode {
  id: string;
  type?: string;
  text?: { text: string };
  children?: WFNode[];
  nodes?: WFNode[];
}

interface TextEntry {
  nodeId: string;
  text: string;
  type: string;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const pageId = searchParams.get("pageId");
  const localeId = searchParams.get("localeId") ?? undefined;
  if (!pageId) return NextResponse.json({ error: "pageId is required" }, { status: 400 });

  const token = await getWfToken();
  if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const url = localeId
    ? `https://api.webflow.com/v2/pages/${pageId}/dom?localeId=${localeId}`
    : `https://api.webflow.com/v2/pages/${pageId}/dom`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, "accept-version": "2.0.0" },
  });

  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json({ error: err, status: res.status }, { status: res.status });
  }

  const data = await res.json();
  const nodes: WFNode[] = data.nodes ?? data.dom ?? [];
  const textNodes = extractTextNodes(nodes);

  return NextResponse.json({ textNodes, raw: data });
}

export async function PATCH(req: NextRequest) {
  const { pageId, nodes, localeId } = await req.json() as {
    pageId: string;
    nodes: { nodeId: string; text: string }[];
    localeId?: string;
  };

  if (!pageId || !nodes?.length) {
    return NextResponse.json({ error: "pageId and nodes are required" }, { status: 400 });
  }

  const token = await getWfToken();
  if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const url = localeId
    ? `https://api.webflow.com/v2/pages/${pageId}/dom?localeId=${localeId}`
    : `https://api.webflow.com/v2/pages/${pageId}/dom`;

  const body = {
    nodes: nodes.map((n) => ({
      nodeId: n.nodeId,
      text: { text: n.text },
    })),
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "accept-version": "2.0.0",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json({ error: err }, { status: res.status });
  }

  return NextResponse.json({ success: true });
}
