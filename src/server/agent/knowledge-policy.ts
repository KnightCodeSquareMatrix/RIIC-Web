import { readFile } from "node:fs/promises";
import path from "node:path";

export interface AgentSkill { id: string; title: string; path: string; purpose: string }

export async function loadKnowledgePolicy(root: string): Promise<string> {
  if (!root.trim()) throw new Error("知识服务暂不可用，当前无法核实补充机制。");
  return readFile(path.join(root, "agent/KNOWLEDGE_RULES.md"), "utf8");
}

export async function loadAgentSkillManifest(root: string): Promise<AgentSkill[]> {
  if (!root.trim()) throw new Error("知识服务暂不可用。");
  const manifest = JSON.parse(await readFile(path.join(root, "skill/manifest.json"), "utf8"));
  if (manifest.version !== 1 || !Array.isArray(manifest.skills)) throw new Error("任务指引暂不可用。");
  const ids = new Set<string>();
  return manifest.skills.map((entry: AgentSkill) => {
    if (!entry || ![entry.id, entry.title, entry.path, entry.purpose].every((v) => typeof v === "string" && v.trim())
      || !/^skill\/skill-\d+-[^/\\]+\.md$/.test(entry.path) || ids.has(entry.id)) throw new Error("任务指引清单无效。");
    ids.add(entry.id);
    return entry;
  });
}

export async function readAgentSkill(root: string, id: string) {
  const entry = (await loadAgentSkillManifest(root)).find((skill) => skill.id === id);
  if (!entry) throw new Error("该任务指引尚未启用。");
  return { id: entry.id, title: entry.title, content: await readFile(path.join(root, entry.path), "utf8") };
}
