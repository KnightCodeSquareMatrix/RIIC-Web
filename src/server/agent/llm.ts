import "server-only";

import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

import { agentLlmSettings } from "./config.ts";

export function getAgentModel() {
  const settings = agentLlmSettings();
  if (!settings.configured) {
    throw new Error("AGENT_LLM_API_KEY 未配置，agent 聊天不可用。");
  }
  const provider = createOpenAICompatible({
    name: `riic-agent-${settings.provider}`,
    baseURL: settings.baseURL,
    apiKey: settings.apiKey,
  });
  return provider.chatModel(settings.model);
}
