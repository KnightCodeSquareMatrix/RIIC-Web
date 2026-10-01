"use client";

import { AgentChat } from "@/components/agent/AgentChat";
import { useWebsiteSession } from "@/website-session";
import { useAgentHistory } from "@/hooks/use-agent-history";
import { restoreAgentMessages } from "@/agent-history";

export function AgentRoute() {
  const { data, isPending } = useWebsiteSession();
  const { ready, history } = useAgentHistory();
  if (isPending || !ready) return null;
  const conversation = history.conversations.find((entry) => entry.id === history.activeId);
  return <AgentChat key={`${data?.user.id ?? "anonymous"}:${history.activeId}`} userId={data?.user.id} userName={data?.user.name} conversationId={history.activeId} initialMessages={conversation ? restoreAgentMessages(conversation.messages) : []} />;
}
