"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";

import { RichTextStatic } from "@/components/RichTextStatic";
import { parseRichText, type RichTextNode } from "@/components/skill-query/rich-text";

type TermRecord = { id: string; name: string; desc: string; descText: string };
type TermCatalog = Record<string, TermRecord>;

let termCatalogPromise: Promise<TermCatalog> | null = null;

function loadTermCatalog(): Promise<TermCatalog> {
  termCatalogPromise ??= fetch("/api/building-terms", {
    method: "GET",
    credentials: "same-origin",
    headers: { accept: "application/json" },
  })
    .then(async (response) => {
      if (!response.ok) throw new Error("Unable to load building terms");
      const payload = await response.json() as { data?: TermCatalog };
      if (!payload.data) throw new Error("Invalid building term response");
      return payload.data;
    })
    .catch((error) => {
      termCatalogPromise = null;
      throw error;
    });
  return termCatalogPromise;
}

function renderHoverNodes(
  nodes: readonly RichTextNode[],
  catalog: TermCatalog | null,
  ensureCatalog: () => void,
): ReactNode {
  return nodes.map((node, index) => {
    if (node.type === "text") return node.text;
    if (node.type === "style") {
      return (
        <span key={index} className={`riic-rt ${node.className}`}>
          {renderHoverNodes(node.children, catalog, ensureCatalog)}
        </span>
      );
    }
    const term = catalog?.[node.id];
    return (
      <span
        key={index}
        className="group/term relative inline-block"
        onPointerEnter={ensureCatalog}
        onFocus={ensureCatalog}
      >
        <span className="riic-term" tabIndex={0}>
          {renderHoverNodes(node.children, catalog, ensureCatalog)}
        </span>
        {term ? (
          <span
            className="pointer-events-none invisible absolute bottom-[calc(100%+0.5rem)] left-1/2 z-[60] w-max max-w-[min(20rem,calc(100vw-2rem))] -translate-x-1/2 translate-y-1 rounded-md border border-white/20 bg-zinc-900 px-3 py-2.5 font-normal leading-relaxed text-zinc-100 opacity-0 shadow-[0_10px_30px_rgb(0_0_0/0.38)] transition-[opacity,transform,visibility] duration-150 ease-out whitespace-normal group-hover/term:visible group-hover/term:translate-y-0 group-hover/term:opacity-100 group-focus-within/term:visible group-focus-within/term:translate-y-0 group-focus-within/term:opacity-100"
            role="tooltip"
          >
            <strong className="block font-semibold">{term.name}</strong>
            <span className="mt-1 block font-normal">
              <RichTextStatic text={term.desc} />
            </span>
          </span>
        ) : null}
      </span>
    );
  });
}

/** 紧凑 tooltip 富文本：仅在首次悬停或聚焦词条时加载词条目录。 */
export function RichTextHoverTerms({ text }: { text: string }) {
  const nodes = useMemo(() => parseRichText(text), [text]);
  const [catalog, setCatalog] = useState<TermCatalog | null>(null);
  const ensureCatalog = useCallback(() => {
    if (catalog) return;
    void loadTermCatalog().then(setCatalog, () => undefined);
  }, [catalog]);

  return (
    <span className="whitespace-pre-line">
      {renderHoverNodes(nodes, catalog, ensureCatalog)}
    </span>
  );
}
