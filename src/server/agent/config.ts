import "server-only";

export type AgentLlmProviderId = "deepseek" | "glm";

export interface AgentLlmSettings {
  provider: AgentLlmProviderId;
  baseURL: string;
  model: string;
  apiKey: string;
  configured: boolean;
}

const PROVIDER_PRESETS: Record<AgentLlmProviderId, { baseURL: string; model: string }> = {
  deepseek: { baseURL: "https://api.deepseek.com/v1", model: "deepseek-chat" },
  glm: { baseURL: "https://open.bigmodel.cn/api/paas/v4", model: "glm-4.6" },
};

function normalizeProvider(value: string | undefined): AgentLlmProviderId {
  const trimmed = value?.trim().toLowerCase();
  return trimmed === "glm" ? "glm" : "deepseek";
}

export function agentLlmSettings(): AgentLlmSettings {
  const provider = normalizeProvider(process.env.AGENT_LLM_PROVIDER);
  const preset = PROVIDER_PRESETS[provider];
  const baseURL = process.env.AGENT_LLM_BASE_URL?.trim() || preset.baseURL;
  const model = process.env.AGENT_LLM_MODEL?.trim() || preset.model;
  const apiKey = process.env.AGENT_LLM_API_KEY?.trim() ?? "";
  return { provider, baseURL, model, apiKey, configured: apiKey.length > 0 };
}

export function agentKnowledgeDir(): string {
  // 知识库（RIIC-knowledge）是独立的外部仓库，不随本仓库分发；
  // 克隆后把本地路径配置到 AGENT_KB_DIR（见 .env.example 与 docs/AGENT_EXPLORATION.md）。
  return process.env.AGENT_KB_DIR?.trim() ?? "";
}
