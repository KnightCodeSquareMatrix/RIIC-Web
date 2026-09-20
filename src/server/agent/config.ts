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
  return process.env.AGENT_KB_DIR?.trim() || "E:/arknights-infra-project/RIIC-knowledge";
}
