import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import { agentKnowledgeDir } from "./config.ts";

export interface KbCatalogEntry {
  path: string;
  label: string;
}

export interface KbRouteResult {
  query: string;
  matched: KbCatalogEntry[];
  hint: string;
}

const MAX_DOC_CHARS = 16_000;
const ROUTE_RESULT_LIMIT = 8;

function normalizeForMatch(value: string): string {
  return value.toLowerCase().replace(/\s+/g, "");
}

function queryTerms(query: string): string[] {
  const terms = new Set<string>();
  const trimmed = query.trim();
  if (trimmed) terms.add(normalizeForMatch(trimmed));
  for (const token of trimmed.split(/[\s,，。？?！!、/]+/)) {
    const normalized = normalizeForMatch(token);
    if (normalized.length >= 2) terms.add(normalized);
  }
  // Chinese queries are usually a single run without spaces; 2-grams widen recall.
  const compact = normalizeForMatch(trimmed);
  for (let i = 0; i + 2 <= compact.length; i += 1) terms.add(compact.slice(i, i + 2));
  return [...terms].filter((term) => term.length >= 2);
}

let catalogCache: { entries: KbCatalogEntry[]; loadedAt: number } | null = null;
const CATALOG_CACHE_TTL_MS = 60_000;

async function loadCatalog(): Promise<KbCatalogEntry[]> {
  if (catalogCache && Date.now() - catalogCache.loadedAt < CATALOG_CACHE_TTL_MS) {
    return catalogCache.entries;
  }
  const filePath = path.join(agentKnowledgeDir(), "index", "标题清单.md");
  const text = await readFile(filePath, "utf-8");
  const entries: KbCatalogEntry[] = [];
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^-\s+`([^`]+)`(?:（[^）]*）)?(.*)$/);
    if (!match) continue;
    const [, docPath, rest] = match;
    const label = rest.trim().replace(/\s+/g, " ");
    entries.push({ path: docPath, label: label || docPath });
  }
  catalogCache = { entries, loadedAt: Date.now() };
  return entries;
}

export async function searchKnowledgeBase(query: string): Promise<KbRouteResult> {
  const entries = await loadCatalog();
  const terms = queryTerms(query);
  const scored = entries
    .map((entry) => {
      const haystack = normalizeForMatch(`${entry.path}${entry.label}`);
      let score = 0;
      for (const term of terms) {
        if (haystack.includes(term)) score += term.length >= 3 ? 3 : 2;
      }
      if (normalizeForMatch(entry.path).includes(terms[0] ?? "\0")) score += 2;
      return { entry, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, ROUTE_RESULT_LIMIT)
    .map((item) => item.entry);
  return {
    query,
    matched: scored,
    hint: scored.length
      ? "以上是候选文档（path 为知识库内相对路径）。用 kb_read 读取正文；都不相关时可换关键词重试。"
      : "标题清单中没有匹配项。可换关键词重试，或直接读取 docs/1-基础设定/README.md 等模块导航。",
  };
}

export interface KbReadResult {
  path: string;
  title: string;
  content: string;
  truncated: boolean;
}

export async function readKnowledgeDoc(relativePath: string): Promise<KbReadResult> {
  const root = path.resolve(agentKnowledgeDir());
  const target = path.resolve(root, relativePath);
  const withSep = root.endsWith(path.sep) ? root : root + path.sep;
  if (target !== root && !target.startsWith(withSep)) {
    throw new Error("知识库路径越界，已拒绝读取。");
  }
  if (!target.toLowerCase().endsWith(".md")) {
    throw new Error("知识库工具只能读取 .md 文档。");
  }
  let text: string;
  try {
    text = await readFile(target, "utf-8");
  } catch {
    throw new Error(`读取失败：${relativePath} 不存在或无法读取。可用 kb_route 重新定位。`);
  }
  const frontMatterTitle = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1]?.match(/^title:\s*(.+)$/m)?.[1]?.trim();
  const headingTitle = text.match(/^#\s+(.+)$/m)?.[1]?.trim();
  const truncated = text.length > MAX_DOC_CHARS;
  return {
    path: relativePath,
    title: frontMatterTitle || headingTitle || relativePath,
    content: truncated ? text.slice(0, MAX_DOC_CHARS) : text,
    truncated,
  };
}
