"use client";

import { useEffect, useRef, useState } from "react";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";

import { PlanArtifactView } from "@/components/agent/PlanArtifactView";
import { AGENT_BROADCAST_CHANNEL, agentArtifactFromOutput, requestAgentArtifactOpen } from "@/agent-artifact-bridge";
import type { AgentPlanProjection } from "@/server/agent/plan-artifact";

type AgentStatus = "loading" | "ready" | "unconfigured" | "unauthenticated";

interface AgentRuntimeInfo {
  provider: string;
  model: string;
  baseURL: string;
}

const TOOL_LABELS: Record<string, string> = {
  resolve_operator: "干员核实",
  calculate_mastery: "专精训练",
  calculate_recruitment: "公招词条计算",
  preview_solve_defaults: "排班配置预览",
  diagnose_account: "账号诊断",
  solve_schedule: "排班求解",
  query_skills: "技能查询",
  kb_route: "知识库导诊",
  kb_read: "知识库阅读",
  load_agent_skill: "任务指引",
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

export function formatEnvironmentSummary(environment: Record<string, unknown>, sources: Record<string, unknown>) {
  const labels: Record<string, string> = { sami: "萨米", abyssal: "深海猎人", knights: "骑士", defence: "防守方", attack: "进攻方", siracusa: "叙拉古", fireworks: "人间烟火" };
  const groups = new Map<string, string[]>();
  for (const [key, value] of Object.entries(environment)) {
    const raw = String(sources[key] ?? "默认值");
    const source = raw.startsWith("默认值") ? "默认" : raw === "手动指定" ? "用户指定" : raw;
    groups.set(source, [...(groups.get(source) ?? []), `${labels[key] ?? key} ${value}`]);
  }
  return [...groups].map(([source, values]) => `${source}：${values.join("、")}`).join("；");
}

function MasteryWarnings({ warnings }: { warnings: unknown }) {
  if (!Array.isArray(warnings)) return null;
  return <>{warnings.map((value, index) => {
    const warning = asRecord(value);
    return typeof warning?.message === "string" ? <p key={index} role="status" className="text-amber-600 dark:text-amber-300">{warning.message}</p> : null;
  })}</>;
}

export function ToolResultSummary({ name, output }: { name: string; output: unknown }) {
  const [handoffError, setHandoffError] = useState<string | null>(null);
  const handoff = agentArtifactFromOutput(output);
  const record = asRecord(output);
  if (!record) return null;
  if (name === "solve_schedule" && record.plan) {
    const plan = asRecord(record.plan) as unknown as AgentPlanProjection;
    const summary = asRecord(plan.summary);
    return (
      <div className="grid gap-2 text-xs">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
          <span>布局 {String(plan.layoutLabel ?? record.layoutPreset ?? "?")}</span>
          <span>干员 {String(record.operatorCount ?? "?")}</span>
          <span>精二池就绪 {String(summary?.tier_up_owned ?? "?")}</span>
          {Array.isArray(record.tradeOrders) && record.tradeOrders.length > 0 ? (
            <span>
              贸易订单 {record.tradeOrders.map((order) => (order === "originium" ? "开采协力" : "龙门商法")).join(" / ")}
            </span>
          ) : null}
        </div>
        {handoff ? (
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="w-fit rounded-md bg-[#FFD501] px-3 py-1.5 text-xs font-medium text-black transition-opacity hover:opacity-90"
              onClick={() => {
                setHandoffError(null);
                try { requestAgentArtifactOpen(handoff); }
                catch (error) { setHandoffError(error instanceof Error ? error.message : "临时交接失败，请重试。"); }
              }}
            >
              在工作台中打开 →
            </button>
            {handoffError ? <p role="alert" className="text-destructive">{handoffError}</p> : null}
          </div>
        ) : null}
        <details className="rounded border bg-muted/20 px-2 py-1">
          <summary className="cursor-pointer select-none text-xs font-medium">在对话中查看完整排班（可切换班次）</summary>
          <div className="mt-2"><PlanArtifactView plan={plan} dense /></div>
        </details>
      </div>
    );
  }
  if (name === "calculate_mastery" && record.simple && record.fast) {
    const settings = asRecord(record.settings);
    const sources = asRecord(record.settingsSources);
    const observation = asRecord(record.environmentObservation);
    return <div className="grid gap-2 text-xs">
      <p>{String(asRecord(record.targetOperator)?.name)} · 干员池：{String(record.sourceName)}</p>
      <p>起始专精 {String(settings?.current)} → {String(settings?.target)} · 中枢 {settings?.controlBonus ? "+5%" : "0%"}（{String(sources?.controlBonus ?? "默认值")}） · 换人余量 {String(settings?.bufferMinutes)} 分钟</p>
      <p>{formatEnvironmentSummary(asRecord(settings?.environment) ?? {}, asRecord(sources?.environment) ?? {})}</p>
      {observation ? <><p>森空岛快照：{typeof observation.storeTs === "number" && observation.storeTs > 0 ? new Date(observation.storeTs * 1000).toLocaleString("zh-CN") : "时间未知"}</p><p className="text-amber-600 dark:text-amber-300">{String(observation.warning)}</p></> : null}
      {record.isSample === true ? <p className="text-muted-foreground">按全精二示例干员池计算，不代表个人实际持有与练度。</p> : null}
      <MasteryWarnings warnings={record.warnings} />
      {(["simple", "fast"] as const).map((mode) => {
        const plan = asRecord(record[mode]);
        return <details key={mode} className="rounded border p-2" open={mode === "simple"}>
          <summary className="cursor-pointer">{mode === "simple" ? "简单方案" : "快速方案"} · {String(plan?.totalTime)} · 换人 {String(plan?.switches)} 次</summary>
          {Array.isArray(plan?.instructions) ? plan.instructions.map((stage, index) => <ol key={index} className="mt-2 grid gap-1 border-t pt-2">
            {Array.isArray(stage) ? stage.map((step, stepIndex) => {
              const item = asRecord(step);
              const seconds = Math.ceil(Number(item?.elapsed ?? 0));
              const time = `${Math.floor(seconds / 3600)}:${String(Math.floor(seconds / 60) % 60).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
              return <li key={stepIndex}>+{time} · {String(item?.text ?? "")}</li>;
            }) : null}
          </ol>) : null}
        </details>;
      })}
      <p className="text-muted-foreground">{String(record.assumptions)}</p>
    </div>;
  }
  if (name === "calculate_recruitment" && Array.isArray(record.results)) {
    return <div className="grid gap-2 text-xs">
      <p>招聘 {String(record.minutes)} 分钟 · 干员池：{String(record.sourceName)}</p>
      {record.ownershipKnown === false ? <p className="text-muted-foreground">示例干员池：个人拥有状态未知。</p> : null}
      {record.results.length === 0 ? <p>没有符合当前词条和筛选条件的组合。</p> : null}
      {record.results.map((value, index) => {
        const result = asRecord(value);
        return <details key={index} className="rounded border p-2">
          <summary className="cursor-pointer">{Array.isArray(result?.tags) ? result.tags.join(" + ") : ""} · 最低 {String(result?.minimumRarity)}★</summary>
          <p className="mt-1 leading-5">{Array.isArray(result?.operators) ? result.operators.map((value) => {
            const operator = asRecord(value);
            return `${operator?.name} ${operator?.rarity}★${operator?.ownership === "missing" ? "（未拥有）" : ""}`;
          }).join("、") : ""}</p>
        </details>;
      })}
      <p className="text-muted-foreground">{String(record.assumptions)}</p>
    </div>;
  }
  if (name === "diagnose_account") {
    const skland = asRecord(record.skland);
    if (!skland) return null;
    const pool = asRecord(record.operatorPool);
    if (skland.connected !== true) {
      return <div className="grid gap-1 text-xs text-muted-foreground"><p>森空岛未连接：{String(skland.reason ?? "")}</p><p>干员池：{String(pool?.sourceName ?? "未知")} · 干员 {String(pool?.owned ?? "?")} / 精二 {String(pool?.elite2 ?? "?")}</p></div>;
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
  if (name === "resolve_operator" && record.operator) return <div className="grid gap-2 text-xs"><p className="text-muted-foreground">{String(asRecord(record.operator)?.name)}</p><MasteryWarnings warnings={record.warnings} /></div>;
  if (["kb_read", "kb_route", "query_skills", "load_agent_skill"].includes(name)) return null;
  return null;
}

export function AgentToolCard({ part }: { part: AgentToolPartView }) {
  const name = part.type.slice("tool-".length);
  const record = asRecord(part.output);
  const running = part.state === "input-streaming" || part.state === "input-available";
  const failed = part.state === "output-error" || !!record?.error;
  const knowledge = ["query_skills", "kb_route", "kb_read", "load_agent_skill"].includes(name);
  const object = name === "query_skills" ? record?.query : name === "kb_route" ? "" : record?.title;
  const safeObject = typeof object === "string" && !/[\\/\n\r]/.test(object) ? object.slice(0, 100) : "";
  const label = toolLabel(name);
  const suffix = knowledge && safeObject ? name === "kb_read" || name === "load_agent_skill" ? `《${safeObject}》` : ` · ${safeObject}` : "";
  return <div className={`rounded-lg border px-3 py-2 text-sm ${failed ? "border-destructive/60" : "bg-muted/20"}`} data-agent-tool={name}>
    <div className="flex items-center gap-2 text-xs font-medium"><span className={running ? "animate-pulse text-muted-foreground" : failed ? "text-destructive" : ""}>
      {running ? `正在调用 ${label}…` : failed ? `${label} 出错` : `${label} 完成${suffix}`}
    </span></div>
    {!failed && part.state === "output-available" && !knowledge ? <div className="mt-1.5"><ToolResultSummary name={name} output={part.output} /></div> : null}
    {failed ? <p className="mt-1 text-xs text-destructive">{knowledge ? "本次查询暂未完成，请稍后重试。" : String(part.errorText ?? record?.error ?? "工具调用失败")}</p> : null}
  </div>;
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

  // 求解完成时通知同浏览器内已打开的工作台标签页（幂等，每个工具结果只广播一次）。
  const broadcastRef = useRef<Set<string>>(new Set());
  const channelRef = useRef<BroadcastChannel | null>(null);
  useEffect(() => {
    if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return;
    channelRef.current ??= new BroadcastChannel(AGENT_BROADCAST_CHANNEL);
    for (const message of messages) {
      message.parts.forEach((part, partIndex) => {
        if (!isToolPart(part) || part.type !== "tool-solve_schedule" || part.state !== "output-available") return;
        const handoff = agentArtifactFromOutput(part.output);
        if (!handoff) return;
        const key = `${message.id}:${partIndex}`;
        if (broadcastRef.current.has(key)) return;
        broadcastRef.current.add(key);
        channelRef.current?.postMessage({
          type: "plan-ready",
          ...handoff,
        });
      });
    }
  }, [messages]);

  useEffect(() => () => {
    channelRef.current?.close();
    channelRef.current = null;
  }, []);

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
          <p className="mt-1 text-xs text-muted-foreground">实验性 agent 入口 · 账号诊断、排班、专精训练、公招计算与知识库</p>
          {agentInfo ? (
            <p className="mt-0.5 break-all font-number text-[11px] text-muted-foreground" data-agent-runtime-info>
              {agentInfo.model}
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
            {["我想搓玉，但不知道自己干员池适不适合", "帮我看看账号现在什么水平", "帮我算能天使从未专精到专三的训练方案", "公招有高级资深干员、狙击干员、远程位，九小时怎么选？"].map((prompt) => (
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
                  return <AgentToolCard key={partIndex} part={part} />;
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
