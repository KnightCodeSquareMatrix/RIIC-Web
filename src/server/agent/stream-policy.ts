import { wrapLanguageModel, type UIMessageChunk } from "ai";
import type { LanguageModelV4 } from "@ai-sdk/provider";
import { AGENT_TIMEOUT_ERROR } from "../../agent-chat-errors.ts";

export const AGENT_STREAM_TIMEOUT = {
  firstChunkMs: 60_000,
  chunkMs: 60_000,
  totalMs: 10 * 60_000,
};

function isTimeout(error: unknown): boolean {
  for (let depth = 0; depth < 5 && error instanceof Error; depth++) {
    if (error.name === "TimeoutError") return true;
    error = error.cause;
  }
  return false;
}

// Guard each provider stream, not the whole SDK step: a step also includes
// potentially slow tool execution. Keepalives/metadata do not reset the timer.
export function withAgentModelTimeout(model: LanguageModelV4, timeout = AGENT_STREAM_TIMEOUT) {
  return wrapLanguageModel({ model, middleware: {
    specificationVersion: "v4",
    wrapStream: async ({ model, params }) => {
      const controller = new AbortController();
      const signal = params.abortSignal ? AbortSignal.any([params.abortSignal, controller.signal]) : controller.signal;
      let timer: ReturnType<typeof setTimeout>;
      const clear = () => { clearTimeout(timer); signal.removeEventListener("abort", clear); };
      const arm = (ms: number) => {
        clearTimeout(timer);
        timer = setTimeout(() => controller.abort(new DOMException("Model response timed out", "TimeoutError")), ms);
      };
      signal.addEventListener("abort", clear, { once: true });
      arm(timeout.firstChunkMs);
      try {
        const response = await model.doStream({ ...params, abortSignal: signal });
        const reader = response.stream.getReader();
        return { ...response, stream: new ReadableStream({
          async pull(output) {
            try {
              const { value, done } = await reader.read();
              if (done) { clear(); output.close(); return; }
              if (value.type === "finish" || value.type === "error") clear();
              else if (((value.type === "text-delta" || value.type === "reasoning-delta" || value.type === "tool-input-delta") && value.delta.length > 0) || value.type === "tool-call") arm(timeout.chunkMs);
              output.enqueue(value);
            } catch (error) {
              clear();
              output.enqueue({ type: "error", error });
              output.close();
            }
          },
          cancel(reason) { clear(); controller.abort(reason); return reader.cancel(reason); },
        }) };
      } catch (error) { clear(); throw error; }
    },
  } });
}

export function createAgentStreamPolicy(signal: AbortSignal, timeout = AGENT_STREAM_TIMEOUT) {
  let timedOut = false;
  return {
    options: {
      abortSignal: signal,
      timeout: { totalMs: timeout.totalMs },
      maxRetries: 0,
      onAbort: ({ reason }: { reason?: unknown }) => { timedOut = isTimeout(reason); },
    },
    errorText(error: unknown) {
      return isTimeout(error) ? AGENT_TIMEOUT_ERROR : `模型服务调用失败：${error instanceof Error ? error.message : String(error)}`;
    },
    // SDK timeouts are abort chunks, which useChat normally treats as a
    // successful stop. Convert only timeouts to errors so retry becomes visible.
    transform: new TransformStream<UIMessageChunk, UIMessageChunk>({
      transform(chunk, controller) {
        controller.enqueue(chunk.type === "abort" && timedOut
          ? { type: "error", errorText: AGENT_TIMEOUT_ERROR }
          : chunk);
      },
    }),
  };
}
