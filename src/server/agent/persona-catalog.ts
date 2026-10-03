import "server-only";

import { readFile } from "node:fs/promises";
import { builtinAgentPersona, BUILTIN_AGENT_PERSONAS } from "../../agent-personas.ts";

// Only configured private files may supply built-in prompts; request IDs are never paths.
const PERSONA_FILES = {
  silverash: "AGENT_PERSONA_SILVERASH_CARD",
  exusiai: "AGENT_PERSONA_EXUSIAI_CARD",
  saileach: "AGENT_PERSONA_SAILEACH_CARD",
  mountain: "AGENT_PERSONA_MOUNTAIN_CARD",
} as const;

export async function readBuiltinAgentPersona(id: unknown): Promise<string> {
  const persona = builtinAgentPersona(id);
  if (!persona) throw new Error("未找到所选人格卡，请重新选择。");
  const filename = process.env[PERSONA_FILES[persona.id]]?.trim();
  if (!filename) throw new Error("所选人格卡暂不可用，请重新选择。");
  try {
    const content = (await readFile(filename, "utf8")).trim();
    if (!content || Buffer.byteLength(content, "utf8") > 36_000) throw new Error("Invalid persona file");
    return content;
  } catch {
    throw new Error("所选人格卡暂不可用，请重新选择。");
  }
}

export async function listBuiltinAgentPersonas() {
  const cards = await Promise.all(BUILTIN_AGENT_PERSONAS.map(async persona => {
    try { await readBuiltinAgentPersona(persona.id); return persona; }
    catch { return null; }
  }));
  return cards.filter(card => card !== null);
}

export async function resolveAgentPersonaContent(persona?: { id?: unknown; kind?: unknown; content?: unknown }): Promise<string | undefined> {
  if (persona?.kind === "builtin" || builtinAgentPersona(persona?.id)) return readBuiltinAgentPersona(persona?.id);
  return typeof persona?.content === "string" ? persona.content.trim().slice(0, 36_000) || undefined : undefined;
}
