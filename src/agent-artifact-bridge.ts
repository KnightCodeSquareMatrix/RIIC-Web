// 浏览器端桥接：agent 聊天页与工作台（计算器）之间交接排班产物。
// - 跨页面导航：sessionStorage 交接（聊天页点击"在工作台中打开"→ 跳转 / 后工作台自动注入）
// - 同浏览器已开标签：BroadcastChannel 通知（工作台顶部弹横幅，一键注入）
export const AGENT_BROADCAST_CHANNEL = "riic-agent";

const HANDOFF_STORAGE_KEY = "riic-agent-artifact-handoff";

export interface AgentArtifactHandoff {
  artifactId: string;
  preset: string;
}

export function requestAgentArtifactOpen(artifactId: string, preset: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(HANDOFF_STORAGE_KEY, JSON.stringify({ artifactId, preset } satisfies AgentArtifactHandoff));
  } catch {
    // sessionStorage 不可用时仅靠跳转，工作台无法自动注入，仍可从聊天页链接查看。
  }
  if (window.location.pathname !== "/") {
    window.location.assign("/");
  }
}

export function consumeAgentArtifactHandoff(): AgentArtifactHandoff | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(HANDOFF_STORAGE_KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(HANDOFF_STORAGE_KEY);
    const parsed = JSON.parse(raw) as Partial<AgentArtifactHandoff>;
    if (typeof parsed.artifactId !== "string") return null;
    return { artifactId: parsed.artifactId, preset: typeof parsed.preset === "string" ? parsed.preset : "" };
  } catch {
    return null;
  }
}
