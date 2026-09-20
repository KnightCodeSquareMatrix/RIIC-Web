"use client";

import { useEffect, useRef, useState } from "react";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";

type AgentStatus = "loading" | "ready" | "unconfigured" | "unauthenticated";

interface AgentRuntimeInfo {
  provider: string;
  model: string;
  baseURL: string;
}

const TOOL_LABELS: Record<string, string> = {
  diagnose_account: "账号诊断",
  solve_schedule: "排班求解",
  query_skills: "技能查询",
  kb_route: "知识库导诊",
  kb_read: "知识库阅读",
};

function toolLabel(name: string): string {
  return TOOL_LABELS[name] ?? name;
}

interface AgentToolPartView {
  type: string;
  state: "input-streaming" | "input-available" | "output-available" | "output-error";
  output?: unknown;
  errorText?: string;
}

function isToolPart(part: { type: string }): part is AgentToolPartView {
  return part.type.startsWith("tool-");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function ToolResultSummary({ name, output }: { name: string; output: unknown }) {
  const record = asRecord(output);
  if (!record) return null;
  if (name === "solve_schedule" && record.plan) {
    const plan = asRecord(record.plan);
    const summary = plan ? asRecord(plan.summary) : null;
    const production = plan ? asRecord(plan.dailyProduction) : null;
    const plans = plan && Array.isArray(plan.plans) ? plan.plans : [];
    return (
      <div className="grid gap-2 text-xs">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
          <span>布局 {String(plan?.layoutLabel ?? record.layoutPreset ?? "?")}</span>
          <span>干员 {String(record.operatorCount ?? "?")}</span>
          <span>精二池就绪 {String(summary?.tier_up_owned ?? "?")}</span>
          {production?.daily_gold != null ? <span>赤金/日 {String(production.daily_gold)}</span> : null}
          {production?.daily_lmd != null ? <span>龙门币/日 {String(production.daily_lmd)}</span> : null}
        </div>
        <div className="grid gap-1">
          {plans.slice(0, 3).map((shift, shiftIndex) => {
            const shiftRecord = asRecord(shift);
            const rooms = shiftRecord && Array.isArray(shiftRecord.rooms) ? shiftRecord.rooms : [];
            return (
              <details key={shiftIndex} className="rounded border bg-muted/40 px-2 py-1">
                <summary className="cursor-pointer select-none">
                  第 {String(shiftRecord?.shift ?? shiftIndex + 1)} 班 · {String(shiftRecord?.name ?? "")}（{rooms.length} 个房间）
                </summary>
                <ul className="mt-1 grid gap-0.5">
                  {rooms.map((room, roomIndex) => {
                    const roomRecord = asRecord(room);
                    const operators = roomRecord && Array.isArray(roomRecord.operators) ? roomRecord.operators : [];
                    return (
                      <li key={roomIndex} className="font-number">
                        {String(roomRecord?.room ?? "?")}：{operators.map((operator) => String(asRecord(operator)?.name ?? operator)).join("、") || "（空）"}
                      </li>
                    );
                  })}
                </ul>
              </details>
            );
          })}
        </div>
        {Array.isArray(record.factoryRecipes) && record.factoryRecipes.length > 0 ? (
          <p className="text-muted-foreground">制造站配方：{record.factoryRecipes.join(" / ")}</p>
        ) : null}
      </div>
    );
  }
  if (name === "diagnose_account") {
    const skland = asRecord(record.skland);
    if (!skland) return null;
    if (skland.connected !== true) {
      return <p className="text-xs text-muted-foreground">森空岛未连接：{String(skland.reason ?? "")}</p>;
    }
    const player = asRecord(skland.player);
    const operbox = asRecord(skland.operbox);
    return (
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>{String(player?.nickname ?? "?")}（{player?.level != null ? `Lv.${String(player.level)}` : "等级未知"}）</span>
        <span>干员 {String(operbox?.owned ?? "?")} / 精二 {String(operbox?.elite2 ?? "?")}</span>
        {Array.isArray(operbox?.elite2SixStarNames) ? <span>精二六星 {operbox.elite2SixStarNames.length} 名</span> : null}
      </div>
    );
  }
  if (name === "kb_read") {
    return <p className="text-xs text-muted-foreground">《{String(record.title ?? record.path ?? "?")}》{record.truncated === true ? "（已截断）" : ""}</p>;
  }
  if (name === "kb_route" && Array.isArray(record.matched)) {
    return (
      <ul className="grid gap-0.5 text-xs text-muted-foreground">
        {record.matched.slice(0, 5).map((entry, index) => {
          const entryRecord = asRecord(entry);
          return <li key={index}>《{String(entryRecord?.label ?? "")}》 {String(entryRecord?.path ?? "")}</li>;
        })}
      </ul>
    );
  }
  if (name === "query_skills" && Array.isArray(record.skills)) {
    return (
      <ul className="grid gap-0.5 text-xs text-muted-foreground">
        {record.skills.slice(0, 5).map((skill, index) => {
          const skillRecord = asRecord(skill);
          return <li key={index}>{String(skillRecord?.name ?? "?")}：{String(skillRecord?.description ?? "").slice(0, 60)}…</li>;
        })}
      </ul>
    );
  }
  if (record.error) {
    return <p className="text-xs text-destructive">{String(record.error)}</p>;
  }
  return null;
}

export function AgentChat() {
  const [agentStatus, setAgentStatus] = useState<AgentStatus>("loading");
  const [agentInfo, setAgentInfo] = useState<AgentRuntimeInfo | null>(null);
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const { messages, sendMessage, status, error, stop } = useChat({
    transport: new DefaultChatTransport({ api: "/api/agent/chat" }),
  });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/agent/chat", { credentials: "same-origin" })
      .then(async (response) => {
        if (response.status === 401) {
          if (!cancelled) setAgentStatus("unauthenticated");
          return;
        }
        const payload = (await response.json()) as {
          success?: boolean;
          data?: { enabled?: boolean; provider?: string | null; model?: string | null; baseURL?: string | null };
        };
        if (!cancelled) {
          if (payload.data?.enabled) {
            setAgentStatus("ready");
            setAgentInfo({
              provider: payload.data.provider ?? "?",
              model: payload.data.model ?? "?",
              baseURL: payload.data.baseURL ?? "?",
            });
          } else {
            setAgentStatus("unconfigured");
          }
        }
      })
      .catch(() => {
        if (!cancelled) setAgentStatus("unconfigured");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const busy = status === "submitted" || status === "streaming";

  const submit = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy || agentStatus !== "ready") return;
    setDraft("");
    sendMessage({ text: trimmed });
  };

  return (
    <section className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-3 px-4 pb-28 pt-6" data-agent-chat>
      <header className="flex items-center gap-2.5">
        <span className="h-7 w-1.5 shrink-0 bg-[#FFD501]" aria-hidden="true" />
        <div className="min-w-0">
          <h1 className="truncate text-[21px] font-medium leading-none">可露希尔助理</h1>
          <p className="mt-1 text-xs text-muted-foreground">实验性 agent 入口 · 串联账号诊断、排班求解、技能查询与知识库</p>
          {agentInfo ? (
            <p className="mt-0.5 break-all font-number text-[11px] text-muted-foreground" data-agent-runtime-info>
              {agentInfo.provider} · {agentInfo.model} · {agentInfo.baseURL}
            </p>
          ) : null}
        </div>
      </header>

      {agentStatus === "loading" ? <p className="text-sm text-muted-foreground">正在检查助理配置……</p> : null}
      {agentStatus === "unconfigured" ? (
        <div className="rounded-lg border bg-muted/40 p-3 text-sm">
          <p>助理的大模型接口尚未配置。在 <code className="rounded bg-muted px-1">riicweb/.env.local</code> 中设置：</p>
          <pre className="mt-2 overflow-x-auto rounded bg-muted px-2 py-1 font-number text-xs">{`AGENT_LLM_PROVIDER=deepseek   # 或 glm
AGENT_LLM_API_KEY=你的密钥`}</pre>
          <p className="mt-2 text-xs text-muted-foreground">保存后重启开发服务即可。站点其他功能不受影响。</p>
        </div>
      ) : null}
      {agentStatus === "unauthenticated" ? (
        <div className="rounded-lg border bg-muted/40 p-3 text-sm">
          <p>请先登录网站账号再使用助理。</p>
          <a className="mt-2 inline-block text-sm underline underline-offset-4" href="/">返回首页登录</a>
        </div>
      ) : null}

      {messages.length === 0 && agentStatus === "ready" ? (
        <div className="grid gap-2 rounded-lg border bg-muted/30 p-4">
          <p className="text-sm text-muted-foreground">嘿，博士，需要我帮你算点什么？比如——</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {["我想搓玉，但不知道自己库存适不适合", "帮我看看账号现在什么水平", "243 和 252 布局我该用哪个？"].map((prompt) => (
              <button
                key={prompt}
                type="button"
                className="rounded-lg border bg-background px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
                onClick={() => submit(prompt)}
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="grid gap-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={message.role === "user" ? "ml-auto max-w-[85%] rounded-lg bg-[#FFD501]/90 px-3 py-2 text-sm" : "grid gap-2"}
          >
            {message.role === "user" ? (
              <p className="whitespace-pre-wrap">{message.parts.map((part) => (part.type === "text" ? part.text : "")).join("")}</p>
            ) : (
              message.parts.map((part, partIndex) => {
                if (part.type === "text") {
                  return part.text.trim() ? (
                    <p key={partIndex} className="whitespace-pre-wrap rounded-lg border bg-muted/30 px-3 py-2 text-sm leading-6">
                      {part.text}
                    </p>
                  ) : null;
                }
                if (isToolPart(part)) {
                  const toolName = part.type.slice("tool-".length);
                  const running = part.state === "input-streaming" || part.state === "input-available";
                  const failed = part.state === "output-error";
                  return (
                    <div
                      key={partIndex}
                      className={`rounded-lg border px-3 py-2 text-sm ${failed ? "border-destructive/60" : "bg-muted/20"}`}
                      data-agent-tool={toolName}
                    >
                      <div className="flex items-center gap-2 text-xs font-medium">
                        <span className={running ? "animate-pulse text-muted-foreground" : failed ? "text-destructive" : ""}>
                          {running ? `正在调用 ${toolLabel(toolName)}…` : failed ? `${toolLabel(toolName)} 出错` : `${toolLabel(toolName)} 完成`}
                        </span>
                      </div>
                      {part.state === "output-available" ? <div className="mt-1.5"><ToolResultSummary name={toolName} output={part.output} /></div> : null}
                      {failed ? <p className="mt-1 text-xs text-destructive">{String(part.errorText ?? "工具调用失败")}</p> : null}
                    </div>
                  );
                }
                return null;
              })
            )}
          </div>
        ))}
        {error ? <p className="rounded-lg border border-destructive/60 px-3 py-2 text-sm text-destructive">{error.message}</p> : null}
        <div ref={bottomRef} />
      </div>

      {agentStatus === "ready" ? (
        <div className="fixed inset-x-0 bottom-0 border-t bg-background/95 backdrop-blur">
          <div className="mx-auto flex w-full max-w-3xl items-end gap-2 px-4 py-3">
            <textarea
              className="max-h-40 min-h-11 w-full resize-none rounded-lg border bg-background px-3 py-2.5 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder="和可露希尔聊聊你的基建需求（Enter 发送，Shift+Enter 换行）"
              rows={1}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  submit(draft);
                }
              }}
            />
            {busy ? (
              <button type="button" className="h-11 shrink-0 rounded-lg border px-4 text-sm hover:bg-muted" onClick={() => stop()}>
                停止
              </button>
            ) : (
              <button
                type="button"
                className="h-11 shrink-0 rounded-lg bg-[#FFD501] px-4 text-sm font-medium text-black transition-opacity disabled:opacity-40"
                disabled={!draft.trim()}
                onClick={() => submit(draft)}
              >
                发送
              </button>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
