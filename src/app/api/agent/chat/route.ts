import { convertToModelMessages, stepCountIs, streamText, type UIMessage } from "ai";

import { assertSameOrigin, createRequestId, failureResponse, PublicApiError, successResponse } from "@/server/api-contract";
import { websiteSession } from "@/server/auth";
import { agentLlmSettings } from "@/server/agent/config";
import { getAgentModel } from "@/server/agent/llm";
import { buildAgentSystemPrompt } from "@/server/agent/persona";
import { buildAgentTools } from "@/server/agent/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const settings = agentLlmSettings();
  return successResponse(
    {
      enabled: settings.configured,
      provider: settings.configured ? settings.provider : null,
      model: settings.configured ? settings.model : null,
      baseURL: settings.configured ? settings.baseURL : null,
    },
    createRequestId()
  );
}

export async function POST(request: Request) {
  const requestId = createRequestId();
  const startedAt = performance.now();
  try {
    assertSameOrigin(request);
    const session = await websiteSession(request);
    if (!session?.user) {
      const response = failureResponse(new PublicApiError("AIC-AUTH-2008"), requestId, "/api/agent/chat", startedAt);
      return new Response(response.body, { status: 401, headers: response.headers });
    }
    const settings = agentLlmSettings();
    if (!settings.configured) {
      const response = failureResponse(
        new Error(`AGENT_LLM_API_KEY 未配置（provider=${settings.provider}），请在本机 .env.local 填入后重启开发服务。`),
        requestId,
        "/api/agent/chat",
        startedAt
      );
      return new Response(response.body, { status: 503, headers: response.headers });
    }
    const body = (await request.json()) as { messages?: UIMessage[] };
    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      const response = failureResponse(new Error("缺少对话消息。"), requestId, "/api/agent/chat", startedAt);
      return new Response(response.body, { status: 400, headers: response.headers });
    }
    const result = streamText({
      model: getAgentModel(),
      system: await buildAgentSystemPrompt(),
      messages: await convertToModelMessages(body.messages),
      tools: buildAgentTools({ request, userId: session.user.id }),
      stopWhen: stepCountIs(12),
    });
    return result.toUIMessageStreamResponse({
      headers: { "X-Request-Id": requestId },
      onError: (error) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error(JSON.stringify({
          level: "error",
          event: "agent_stream_error",
          requestId,
          message,
        }));
        return `模型服务调用失败：${message}`;
      },
    });
  } catch (error) {
    return failureResponse(error, requestId, "/api/agent/chat", startedAt);
  }
}
