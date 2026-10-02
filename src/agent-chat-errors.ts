export const AGENT_TIMEOUT_ERROR = "AGENT_RESPONSE_TIMEOUT";

export function agentChatErrorMessage(message: string, en: boolean): string {
  if (message === AGENT_TIMEOUT_ERROR) {
    return en
      ? "The model response timed out. You can retry your last question; your question and attachments are still here."
      : "模型响应超时，请稍后重试。你的问题和附件仍保留在对话中。";
  }
  return message;
}
