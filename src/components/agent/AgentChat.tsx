"use client";

import { useEffect, useRef, useState } from "react";

import { useChat } from "@ai-sdk/react";
import { convertFileListToFileUIParts, DefaultChatTransport, type FileUIPart } from "ai";
import { Check, Copy, FileText, Loader2, Paperclip, Send, Square, Upload, X } from "lucide-react";

import { MarkdownMessage } from "@/components/agent/MarkdownMessage";
import { PlanArtifactView } from "@/components/agent/PlanArtifactView";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { AGENT_BROADCAST_CHANNEL, agentArtifactFromOutput, requestAgentArtifactOpen } from "@/agent-artifact-bridge";
import type { AgentPlanProjection } from "@/server/agent/plan-artifact";

type AgentStatus = "loading" | "ready" | "unconfigured" | "unauthenticated";

interface AgentRuntimeInfo {
  provider: string;
  model: string;
  baseURL: string;
}

type PersonaCard = {
  id: string;
  name: string;
  description: string;
  content: string;
  kind: "upload";
  filename?: string;
};

const MAX_PERSONA_LENGTH = 36_000;
const LOCAL_PERSONA_STORAGE_KEY = "riic.agent.persona.v1";
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const MAX_ATTACHMENTS = 4;
const ACCEPTED_ATTACHMENT_TYPES = ["image/", "text/", "application/pdf", "application/json", "application/vnd.openxmlformats-officedocument", "application/vnd.ms-excel"];
const ACCEPTED_ATTACHMENT_EXTENSIONS = [".md", ".markdown", ".txt", ".json", ".pdf", ".csv", ".xlsx"];

function readLocalPersona(): PersonaCard | null {
  try {
    const raw = window.localStorage.getItem(LOCAL_PERSONA_STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (value.version !== 1 || typeof value.content !== "string" || !value.content.trim() || value.content.length > MAX_PERSONA_LENGTH) return null;
    return {
      id: typeof value.id === "string" ? value.id : `local-${Date.now()}`,
      name: typeof value.name === "string" && value.name.trim() ? value.name.slice(0, 40) : "自定义人格",
      description: typeof value.description === "string" ? value.description.slice(0, 120) : "保存在此浏览器中的人格卡。",
      content: value.content.slice(0, MAX_PERSONA_LENGTH),
      kind: "upload",
      filename: typeof value.filename === "string" ? value.filename.slice(0, 120) : undefined,
    };
  } catch {
    return null;
  }
}

function saveLocalPersona(persona: PersonaCard) {
  try {
    window.localStorage.setItem(LOCAL_PERSONA_STORAGE_KEY, JSON.stringify({
      version: 1,
      id: persona.id,
      name: persona.name,
      description: persona.description,
      content: persona.content,
      filename: persona.filename,
      savedAt: new Date().toISOString(),
    }));
    return true;
  } catch {
    return false;
  }
}

function clearLocalPersona() {
  try {
    window.localStorage.removeItem(LOCAL_PERSONA_STORAGE_KEY);
  } catch {
    return;
  }
}

const TOOL_LABELS: Record<string, string> = {
  resolve_operator: "干员身份核实",
  calculate_mastery: "专精方案计算",
  calculate_recruitment: "公招组合计算",
  analyze_stock_and_training: "库存与培养分析",
  analyze_daily_production: "日产出分析",
  diagnose_account_health: "账号体检诊断",
  preview_solve_defaults: "排班配置预览",
  diagnose_account: "账号数据诊断",
  solve_schedule: "排班求解",
  query_skills: "基建技能查询",
  kb_route: "知识库导诊",
  kb_read: "知识库阅读",
  load_agent_skill: "任务指引加载",
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

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return <Button
    type="button"
    variant="ghost"
    size="icon"
    className="size-7 text-muted-foreground"
    aria-label={copied ? "已复制" : "复制回答"}
    title={copied ? "已复制" : "复制回答"}
    onClick={() => {
      void navigator.clipboard?.writeText(value).then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      });
    }}
  >{copied ? <Check className="size-4 text-emerald-600" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}</Button>;
}

function AttachmentPreview({ file, onRemove }: { file: FileUIPart; onRemove: () => void }) {
  const image = file.mediaType.startsWith("image/");
  return <div className="group relative flex min-w-0 items-center gap-2 rounded-xl border border-border/80 bg-background/80 px-2.5 py-2 text-xs shadow-sm">
    {image ? <img src={file.url} alt={file.filename ?? "图片附件"} className="size-10 shrink-0 rounded-lg object-cover" /> : <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"><FileText className="size-5" aria-hidden="true" /></span>}
    <span className="min-w-0"><span className="block max-w-44 truncate font-medium">{file.filename ?? "未命名文件"}</span><span className="block text-[11px] text-muted-foreground">{image ? "图片" : file.mediaType || "文件"}</span></span>
    <Button type="button" variant="ghost" size="icon-xs" aria-label={`移除 ${file.filename ?? "附件"}`} className="absolute -top-2 -right-2 size-5 rounded-full border bg-background text-muted-foreground opacity-0 shadow-sm transition-opacity group-hover:opacity-100 focus-visible:opacity-100" onClick={onRemove}><X className="size-3" aria-hidden="true" /></Button>
  </div>;
}

export function AgentChat() {
  const [agentStatus, setAgentStatus] = useState<AgentStatus>("loading");
  const [agentInfo, setAgentInfo] = useState<AgentRuntimeInfo | null>(null);
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<FileUIPart[]>([]);
  const [activePersona, setActivePersona] = useState<PersonaCard | null>(null);
  const [personaHydrated, setPersonaHydrated] = useState(false);
  const [personaOpen, setPersonaOpen] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [personaError, setPersonaError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const personaInputRef = useRef<HTMLInputElement>(null);
  const { messages, sendMessage, status, error, stop } = useChat({
    transport: new DefaultChatTransport({ api: "/api/agent/chat" }),
  });

  useEffect(() => {
    const stored = readLocalPersona();
    if (stored) setActivePersona(stored);
    setPersonaHydrated(true);
  }, []);

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

  const submit = async (text: string, files = attachments) => {
    const trimmed = text.trim();
    if (!personaHydrated || (!trimmed && files.length === 0) || busy || agentStatus !== "ready") return;
    setDraft("");
    setAttachments([]);
    await sendMessage(
      { text: trimmed, files },
      activePersona?.kind === "upload" ? { body: { persona: { id: activePersona.id, name: activePersona.name, content: activePersona.content } } } : undefined,
    );
  };

  const addFiles = async (fileList: FileList | null) => {
    if (!fileList?.length) return;
    setUploadError(null);
    const incoming = Array.from(fileList);
    if (incoming.length + attachments.length > MAX_ATTACHMENTS) {
      setUploadError(`最多同时发送 ${MAX_ATTACHMENTS} 个附件。`);
      return;
    }
    const invalid = incoming.find((file) => file.size > MAX_ATTACHMENT_BYTES || !(ACCEPTED_ATTACHMENT_TYPES.some((type) => file.type.startsWith(type)) || ACCEPTED_ATTACHMENT_EXTENSIONS.some((extension) => file.name.toLowerCase().endsWith(extension))));
    if (invalid) {
      setUploadError(`${invalid.name} 不受支持，或超过 8 MB 大小限制。`);
      return;
    }
    try {
      const next = await convertFileListToFileUIParts(fileList);
      setAttachments((current) => [...current, ...next].slice(0, MAX_ATTACHMENTS));
    } catch {
      setUploadError("读取附件失败，请重试或换一个文件。");
    }
  };

  const importPersona = async (file: File) => {
    setPersonaError(null);
    if (file.size > MAX_PERSONA_LENGTH) {
      setPersonaError("人格卡需要小于 36 KB。");
      return;
    }
    try {
      const raw = await file.text();
      let content = raw.trim();
      let name = file.name.replace(/\.(md|markdown|txt|json)$/i, "") || "自定义人格";
      let description = "本次浏览器会话使用的自定义人格卡。";
      if (file.name.toLowerCase().endsWith(".json")) {
        try {
          const value = JSON.parse(raw) as Record<string, unknown>;
          name = typeof value.name === "string" ? value.name : name;
          description = typeof value.description === "string" ? value.description : description;
          content = [value.system, value.persona, value.content, value.prompt, value.scenario].find((item) => typeof item === "string") as string ?? raw;
        } catch {
          content = raw;
        }
      }
      if (!content.trim()) throw new Error("人格卡内容为空");
      const persona: PersonaCard = { id: `upload-${Date.now()}`, name: name.slice(0, 40), description, content: content.slice(0, MAX_PERSONA_LENGTH), kind: "upload", filename: file.name };
      setActivePersona(persona);
      if (!saveLocalPersona(persona)) setPersonaError("人格卡已应用，但浏览器拒绝了本地保存。");
      setPersonaOpen(false);
    } catch (error) {
      setPersonaError(error instanceof Error ? error.message : "读取人格卡失败，请重试。");
    }
  };

  const prompts = ["我想搓玉，但不知道自己干员池适不适合", "帮我看看账号现在什么水平", "帮我算能天使从未专精到专三的训练方案", "公招有高级资深干员、狙击干员、远程位，九小时怎么选？"];
  return (
    <section className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-4 px-4 pb-36 pt-0" data-agent-chat>
      <header className="fixed inset-x-0 top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex min-h-[84px] w-full max-w-3xl items-start justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-start gap-2.5"><span className="h-7 w-1.5 shrink-0 bg-[#FFD501]" aria-hidden="true" /><div className="min-w-0"><h1 className="truncate text-[21px] font-medium leading-none">可露希尔助理</h1><p className="mt-1 truncate text-xs text-muted-foreground">实验性 agent 入口 · 账号诊断、排班、专精训练、公招计算与知识库</p>{agentInfo ? <p className="mt-0.5 truncate font-number text-[11px] text-muted-foreground" data-agent-runtime-info>{agentInfo.model}</p> : null}</div></div>
          <Button type="button" variant="outline" size="sm" onClick={() => setPersonaOpen(true)}>人格卡：{activePersona?.name ?? "可露希尔"}</Button>
        </div>
      </header>
      <div className="h-[84px] shrink-0" aria-hidden="true" />

      {agentStatus === "loading" ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />正在检查助理配置……</p> : null}
      {agentStatus === "unconfigured" ? <div className="rounded-[4px] border bg-muted/40 p-3 text-sm"><p>助理的大模型接口尚未配置。在 <code className="rounded bg-muted px-1">riicweb/.env.local</code> 中设置：</p><pre className="mt-2 overflow-x-auto rounded-[4px] bg-muted px-2 py-1 font-number text-xs">{`AGENT_LLM_PROVIDER=deepseek\nAGENT_LLM_API_KEY=你的密钥`}</pre><p className="mt-2 text-xs text-muted-foreground">保存后重启开发服务即可。站点其他功能不受影响。</p></div> : null}
      {agentStatus === "unauthenticated" ? <div className="rounded-[4px] border bg-muted/40 p-3 text-sm"><p>请先登录网站账号再使用助理。</p><a className="mt-2 inline-block text-sm underline underline-offset-4" href="/">返回首页登录</a></div> : null}

      {messages.length === 0 && agentStatus === "ready" ? <div className="grid gap-3 rounded-[4px] border border-border bg-card p-4 md:p-6"><p className="text-sm text-muted-foreground">嘿，博士，需要我帮你算点什么？比如——</p><div className="grid gap-2 sm:grid-cols-2">{prompts.map((prompt) => <Button key={prompt} type="button" variant="outline" className="h-auto min-h-10 justify-start whitespace-normal px-3 py-2 text-left text-sm font-normal" onClick={() => void submit(prompt)}>{prompt}</Button>)}</div></div> : null}

      <div className="grid gap-4">
        {messages.map((message) => {
          const text = message.parts.filter((part) => part.type === "text").map((part) => part.text).join("");
          if (message.role === "user") return <div key={message.id} className="ml-auto max-w-[85%] rounded-[4px] bg-[#FFD501]/90 px-3 py-2 text-sm text-black"><div className="mb-2 flex flex-wrap gap-2">{message.parts.filter((part) => part.type === "file").map((part, index) => <AttachmentPreview key={index} file={part} onRemove={() => undefined} />)}</div>{text ? <p className="whitespace-pre-wrap">{text}</p> : null}</div>;
          return <div key={message.id} className="grid gap-2">{message.parts.map((part, partIndex) => { if (part.type === "text") return part.text.trim() ? <div key={partIndex} className="rounded-[4px] border border-border bg-card px-3 py-2 text-sm leading-6"><MarkdownMessage content={part.text} /><div className="mt-2 flex justify-end border-t border-border/60 pt-1"><CopyButton value={part.text} /></div></div> : null; if (isToolPart(part)) return <AgentToolCard key={partIndex} part={part} />; return null; })}</div>;
        })}
        {busy ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />正在整理结果……</p> : null}
        {error ? <p className="rounded-[4px] border border-destructive/60 px-3 py-2 text-sm text-destructive">{error.message}</p> : null}
        <div ref={bottomRef} />
      </div>

      {agentStatus === "ready" ? <div className="fixed inset-x-0 bottom-0 border-t bg-background/95 backdrop-blur"><div className="mx-auto w-full max-w-3xl px-4 py-3"><div className="rounded-[4px] border border-border bg-card p-2" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void addFiles(event.dataTransfer.files); }}>{attachments.length ? <div className="mb-2 flex gap-2 overflow-x-auto pb-1">{attachments.map((file, index) => <AttachmentPreview key={`${file.filename}-${index}`} file={file} onRemove={() => setAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index))} />)}</div> : null}<Textarea className="max-h-40 min-h-16 resize-none border-0 bg-transparent px-2 py-1.5 shadow-none focus-visible:ring-0" placeholder="和可露希尔聊聊你的基建需求（Enter 发送，Shift+Enter 换行）" rows={2} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void submit(draft); } }} /><div className="flex items-center justify-between gap-2 border-t border-border/60 px-1 pt-2"><div className="flex items-center gap-1"><input ref={fileInputRef} type="file" multiple accept="image/*,.md,.markdown,.txt,.json,.pdf,.csv,.xlsx" className="hidden" onChange={(event) => { void addFiles(event.target.files); event.currentTarget.value = ""; }} /><Button type="button" variant="ghost" size="sm" className="text-muted-foreground" onClick={() => fileInputRef.current?.click()}><Paperclip className="size-4" aria-hidden="true" />添加附件</Button><span className="hidden text-[11px] text-muted-foreground sm:inline">图片 / Markdown / PDF · 单个 ≤ 8 MB</span></div>{busy ? <Button type="button" variant="outline" size="sm" onClick={() => stop()}><Square className="size-3.5 fill-current" aria-hidden="true" />停止</Button> : <Button type="button" size="sm" disabled={!personaHydrated || (!draft.trim() && attachments.length === 0)} onClick={() => void submit(draft)}><Send className="size-4" aria-hidden="true" />发送</Button>}</div></div>{uploadError ? <p className="mt-1.5 px-1 text-xs text-destructive">{uploadError}</p> : <p className="mt-1.5 px-1 text-[10px] text-muted-foreground">附件会随本次消息发送；模型是否能读取图片或 PDF 取决于当前模型能力。</p>}</div></div> : null}

      <Dialog open={personaOpen} onOpenChange={setPersonaOpen}><DialogContent><DialogHeader><DialogTitle>人格卡</DialogTitle><DialogDescription>只影响表达风格；站内工具、账号权限和事实规则仍由服务端控制。</DialogDescription></DialogHeader><DialogBody><div className="grid gap-2"><Button type="button" variant={!activePersona ? "secondary" : "outline"} className="h-auto justify-start px-3 py-2 text-left" onClick={() => { clearLocalPersona(); setActivePersona(null); setPersonaOpen(false); }}><span><span className="block font-medium">可露希尔</span><span className="mt-0.5 block text-xs text-muted-foreground">使用网站服务端当前配置的人格卡</span></span></Button>{activePersona?.kind === "upload" ? <div className="rounded-[4px] border border-[#FFD501] bg-[#FFD501]/10 px-3 py-2 text-sm"><p className="font-medium">{activePersona.name}</p><p className="mt-0.5 text-xs text-muted-foreground">{activePersona.filename} · 已保存在此浏览器，下次打开优先使用</p><Button type="button" variant="link" size="sm" className="mt-1 h-auto px-0 text-xs text-muted-foreground" onClick={() => { clearLocalPersona(); setActivePersona(null); }}>清除本地人格卡</Button></div> : null}<input ref={personaInputRef} type="file" accept=".md,.markdown,.txt,.json,text/markdown,text/plain,application/json" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importPersona(file); event.currentTarget.value = ""; }} /><Button type="button" variant="outline" className="h-auto justify-start px-3 py-2 text-left" onClick={() => personaInputRef.current?.click()}><Upload className="size-4" aria-hidden="true" /><span><span className="block font-medium">上传人格卡</span><span className="mt-0.5 block text-xs font-normal text-muted-foreground">Markdown / TXT / JSON，最大 36 KB</span></span></Button>{personaError ? <p className="text-xs text-destructive">{personaError}</p> : null}</div></DialogBody><DialogFooter><Button type="button" variant="ghost" onClick={() => setPersonaOpen(false)}>关闭</Button></DialogFooter></DialogContent></Dialog>
    </section>
  );
}
