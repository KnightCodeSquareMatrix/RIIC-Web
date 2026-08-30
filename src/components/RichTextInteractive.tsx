"use client";

import { useMemo, useState, type ReactNode } from "react";

import { parseRichText, type RichTextNode } from "@/components/skill-query/rich-text";
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import termCatalogJson from "@/generated/arkntools/term-catalog.json" with { type: "json" };

type TermRecord = { id: string; name: string; desc: string; descText: string };
const TERM_CATALOG = termCatalogJson as Record<string, TermRecord>;

function renderNodes(nodes: readonly RichTextNode[], onTermOpen: (id: string) => void): ReactNode {
  return nodes.map((node, index) => {
    if (node.type === "text") return node.text;
    if (node.type === "style") {
      return (
        <span key={index} className={`riic-rt ${node.className}`}>
          {renderNodes(node.children, onTermOpen)}
        </span>
      );
    }
    const term = TERM_CATALOG[node.id];
    if (!term) {
      return <span key={index}>{renderNodes(node.children, onTermOpen)}</span>;
    }
    return (
      <button
        key={index}
        type="button"
        className="riic-term"
        onClick={() => onTermOpen(node.id)}
      >
        {renderNodes(node.children, onTermOpen)}
      </button>
    );
  });
}

/** 交互式富文本：包含词条目录、点击处理和词条详情弹窗。 */
export function RichTextInteractive({
  text,
  onTermOpen,
}: {
  text: string;
  onTermOpen?: (id: string) => void;
}) {
  const [termStack, setTermStack] = useState<string[]>([]);
  const nodes = useMemo(() => parseRichText(text), [text]);

  const openTerm = (id: string) => {
    if (onTermOpen) {
      onTermOpen(id);
      return;
    }
    setTermStack((current) => (current.includes(id) ? current : [...current, id]));
  };

  const dialogOpen = termStack.length > 0;
  return (
    <>
      <span className="whitespace-pre-line">{renderNodes(nodes, openTerm)}</span>
      {!onTermOpen ? (
        <Dialog open={dialogOpen} onOpenChange={(next) => { if (!next) setTermStack([]); }}>
          <DialogContent>
            <DialogHeader className="pb-0 sm:pb-0">
              <DialogTitle>基建词条</DialogTitle>
            </DialogHeader>
            <DialogBody className="gap-3">
              {termStack.map((id) => {
                const term = TERM_CATALOG[id];
                if (!term) return null;
                return (
                  <div key={id} className="min-w-0">
                    <h4 className="font-semibold">{term.name}</h4>
                    <RichTextInteractive text={term.desc} onTermOpen={openTerm} />
                  </div>
                );
              })}
            </DialogBody>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}
