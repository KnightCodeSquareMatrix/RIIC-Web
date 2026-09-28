"use client";

import { useMemo } from "react";

type MarkdownNode =
  | { kind: "paragraph"; text: string }
  | { kind: "heading"; level: number; text: string }
  | { kind: "quote"; text: string }
  | { kind: "ul" | "ol"; items: string[] }
  | { kind: "code"; language: string; text: string }
  | { kind: "rule" }
  | { kind: "table"; headers: string[]; rows: string[][] };

function splitTableRow(line: string) {
  const value = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return value.split("|").map((cell) => cell.trim());
}

function isTableDivider(line: string) {
  return splitTableRow(line).every((cell) => /^:?-{3,}:?$/.test(cell));
}

function parseMarkdown(source: string): MarkdownNode[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const nodes: MarkdownNode[] = [];
  let paragraph: string[] = [];
  let list: { kind: "ul" | "ol"; items: string[] } | null = null;
  let code: string[] | null = null;
  let codeLanguage = "";

  const flushParagraph = () => {
    if (paragraph.length) {
      nodes.push({ kind: "paragraph", text: paragraph.join(" ").trim() });
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list) nodes.push(list);
    list = null;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (code) {
      if (/^\s*```/.test(line)) {
        nodes.push({ kind: "code", language: codeLanguage, text: code.join("\n") });
        code = null;
        codeLanguage = "";
      } else {
        code.push(line);
      }
      continue;
    }
    const fence = line.match(/^\s*```\s*([\w+-]*)\s*$/);
    if (fence) {
      flushParagraph();
      flushList();
      code = [];
      codeLanguage = fence[1] ?? "";
      continue;
    }
    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }
    const tableHeader = line.includes("|") && isTableDivider(lines[index + 1] ?? "");
    if (tableHeader) {
      flushParagraph();
      flushList();
      const headers = splitTableRow(line);
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length && (lines[index] ?? "").includes("|") && (lines[index] ?? "").trim()) {
        rows.push(splitTableRow(lines[index] ?? ""));
        index += 1;
      }
      index -= 1;
      nodes.push({ kind: "table", headers, rows });
      continue;
    }
    const heading = line.match(/^\s*(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      flushParagraph();
      flushList();
      nodes.push({ kind: "heading", level: heading[1].length, text: heading[2] });
      continue;
    }
    if (/^\s*(?:---+|\*\s*\*\s*\*|___+)\s*$/.test(line)) {
      flushParagraph();
      flushList();
      nodes.push({ kind: "rule" });
      continue;
    }
    const unordered = line.match(/^\s*[-*+]\s+(.+)$/);
    const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (unordered || ordered) {
      const kind = unordered ? "ul" : "ol";
      flushParagraph();
      if (!list || list.kind !== kind) {
        flushList();
        list = { kind, items: [] };
      }
      list.items.push((unordered ?? ordered)?.[1] ?? "");
      continue;
    }
    const quote = line.match(/^\s*>\s?(.*)$/);
    if (quote) {
      flushParagraph();
      flushList();
      nodes.push({ kind: "quote", text: quote[1] });
      continue;
    }
    flushList();
    paragraph.push(line.trim());
  }
  flushParagraph();
  flushList();
  if (code) nodes.push({ kind: "code", language: codeLanguage, text: code.join("\n") });
  return nodes;
}

function safeHref(href: string) {
  if (!/^(?:https?:|mailto:)/i.test(href.trim())) return null;
  try {
    const url = new URL(href);
    return ["http:", "https:", "mailto:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function renderInline(text: string) {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_|\[[^\]]+\]\([^)]+\)|https?:\/\/[^\s<]+)/g);
  return parts.map((part, index) => {
    if (!part) return null;
    if (/^`[^`]+`$/.test(part)) return <code key={index} className="rounded-md bg-black/[0.06] px-1.5 py-0.5 font-mono text-[0.9em] dark:bg-white/[0.1]">{part.slice(1, -1)}</code>;
    if (/^\*\*[^*]+\*\*$/.test(part) || /^__[^_]+__$/.test(part)) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (/^\*[^*]+\*$/.test(part) || /^_[^_]+_$/.test(part)) return <em key={index}>{part.slice(1, -1)}</em>;
    const markdownLink = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    const href = markdownLink ? safeHref(markdownLink[2]) : safeHref(part);
    if (href) return <a key={index} href={href} target="_blank" rel="noreferrer" className="font-medium text-sky-700 underline decoration-sky-700/40 underline-offset-2 hover:decoration-sky-700 dark:text-sky-300">{markdownLink?.[1] ?? part}</a>;
    return <span key={index}>{part}</span>;
  });
}

export function MarkdownMessage({ content }: { content: string }) {
  const nodes = useMemo(() => parseMarkdown(content), [content]);
  return (
    <div className="agent-markdown min-w-0 text-[15px] leading-7">
      {nodes.map((node, index) => {
        if (node.kind === "heading") {
          const Tag = (["h1", "h2", "h3", "h4"] as const)[Math.min(node.level, 4) - 1] ?? "h4";
          return <Tag key={index} className="mt-4 mb-1.5 font-semibold tracking-tight first:mt-0">{renderInline(node.text)}</Tag>;
        }
        if (node.kind === "paragraph") return <p key={index} className="my-2 first:mt-0 last:mb-0">{renderInline(node.text)}</p>;
        if (node.kind === "quote") return <blockquote key={index} className="my-3 border-l-2 border-[#d8aa00] pl-3 text-muted-foreground">{renderInline(node.text)}</blockquote>;
        if (node.kind === "rule") return <hr key={index} className="my-4 border-border/70" />;
        if (node.kind === "code") return <pre key={index} className="my-3 overflow-x-auto rounded-xl border border-white/10 bg-[#191b1e] p-3 text-[13px] leading-6 text-slate-100 shadow-inner"><code data-language={node.language || undefined}>{node.text}</code></pre>;
        if (node.kind === "table") return <div key={index} className="my-3 overflow-x-auto rounded-xl border border-border/70"><table className="min-w-full text-left text-sm"><thead className="bg-muted/60"><tr>{node.headers.map((cell, cellIndex) => <th key={cellIndex} className="whitespace-nowrap px-3 py-2 font-semibold">{renderInline(cell)}</th>)}</tr></thead><tbody>{node.rows.map((row, rowIndex) => <tr key={rowIndex} className="border-t border-border/60">{node.headers.map((_, cellIndex) => <td key={cellIndex} className="px-3 py-2 align-top">{renderInline(row[cellIndex] ?? "")}</td>)}</tr>)}</tbody></table></div>;
        const ListTag = node.kind === "ol" ? "ol" : "ul";
        return <ListTag key={index} className={`${node.kind === "ol" ? "list-decimal" : "list-disc"} my-2 space-y-1 pl-6`}>{node.items.map((item, itemIndex) => <li key={itemIndex} className="pl-1">{renderInline(item)}</li>)}</ListTag>;
      })}
    </div>
  );
}

export function plainTextFromParts(parts: Array<{ type: string; text?: string }>) {
  return parts.filter((part) => part.type === "text").map((part) => part.text ?? "").join("");
}
