import { convertToModelMessages, stepCountIs, streamText, type UIMessage } from "ai";

import { assertSameOrigin, createRequestId, failureResponse, PublicApiError, successResponse } from "@/server/api-contract";
import { websiteSession } from "@/server/auth";
import { agentLlmSettings } from "@/server/agent/config";
import { getAgentModel } from "@/server/agent/llm";
import { buildAgentSystemPrompt } from "@/server/agent/persona";
import { buildAgentTools } from "@/server/agent/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireAgentAccess(request: Request) {
  const session = await websiteSession(request);
  if (!session?.user) throw new PublicApiError("AIC-AUTH-2008");
  return { session };
}

export async function GET(request: Request) {
  const requestId = createRequestId();
  const startedAt = performance.now();
  try {
    await requireAgentAccess(request);
    const settings = agentLlmSettings();
    return successResponse(
      {
        enabled: settings.configured,
        provider: settings.configured ? settings.provider : null,
        model: settings.configured ? settings.model : null,
        baseURL: settings.configured ? settings.baseURL : null,
      },
      requestId
    );
  } catch (error) {
    return failureResponse(error, requestId, "/api/agent/chat", startedAt, "AIC-SYS-5000", request);
  }
}

export async function POST(request: Request) {
  const requestId = createRequestId();
  const startedAt = performance.now();
  try {
    assertSameOrigin(request);
    const { session } = await requireAgentAccess(request);
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
    const body = (await request.json()) as { messages?: UIMessage[]; persona?: { id?: unknown; name?: unknown; content?: unknown } };
    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      const response = failureResponse(new Error("缺少对话消息。"), requestId, "/api/agent/chat", startedAt);
      return new Response(response.body, { status: 400, headers: response.headers });
    }
    const personaContent = typeof body.persona?.content === "string" ? body.persona.content.trim().slice(0, 36_000) : undefined;
    const fileParts = body.messages.flatMap((message) => message.parts.filter((part) => part.type === "file")).map((part) => part as unknown as { url?: unknown; mediaType?: unknown; filename?: unknown });
    if (fileParts.length > 4) {
      const response = failureResponse(new Error("一次最多发送 4 个附件。"), requestId, "/api/agent/chat", startedAt);
      return new Response(response.body, { status: 413, headers: response.headers });
    }
    for (const part of fileParts) {
      if (typeof part.url !== "string" || part.url.length > 12_000_000) {
        const response = failureResponse(new Error("附件过大，请压缩后重试。"), requestId, "/api/agent/chat", startedAt);
        return new Response(response.body, { status: 413, headers: response.headers });
      }
    }
    const tools = buildAgentTools({ request, userId: session.user.id });
    const result = streamText({
      model: getAgentModel(),
      system: await buildAgentSystemPrompt(personaContent),
      messages: await convertToModelMessages(body.messages, { tools }),
      tools,
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
