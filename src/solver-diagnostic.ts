import type { DisplayError } from "./types.ts";

export interface SolverDiagnostic { title: string; suggestion: string }

export function solverDiagnosticFor(error: DisplayError): SolverDiagnostic {
  if (error.code === "AIC-BOX-1101") return { title: "干员数据需要处理", suggestion: "重新导入 BOX，并确认文件来自受支持的导出格式。" };
  if (error.code === "AIC-LAYOUT-1201") return { title: "基建配置存在冲突", suggestion: "检查设施等级、产物配方和供电是否有效。" };
  if (error.code === "AIC-PLAN-3002" || error.code === "AIC-RATE-6001") return { title: "请求正在排队", suggestion: "等待几秒后重试，请勿连续点击生成。" };
  if (error.code === "AIC-PLAN-3003") return { title: "本次计算超时", suggestion: "稍后重试；持续出现时请复制诊断信息反馈。" };
  if (["AIC-PLAN-3001", "AIC-PLAN-3004", "AIC-SYS-5000"].includes(error.code)) return { title: "排班服务暂时异常", suggestion: "可以重试；若仍失败，请复制诊断信息交给维护者。" };
  if (error.code.startsWith("AIC-AUTH-")) return { title: "账号状态需要处理", suggestion: "重新登录或刷新账号状态后再生成排班。" };
  return { title: "请求未能完成", suggestion: error.retryable ? "请稍后重试，并保留诊断编号。" : "请按错误提示修正输入后重试。" };
}

export function formatSolverDiagnostic(error: DisplayError) {
  const diagnostic = solverDiagnosticFor(error);
  return [diagnostic.title, error.message, `错误码：${error.code}`, ...(error.requestId ? [`请求编号：${error.requestId}`] : []), `建议：${diagnostic.suggestion}`].join("\n");
}
