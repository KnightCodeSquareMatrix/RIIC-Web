"use client";

import { useEffect, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

type IssueId = "unexpected-operators" | "saved-box" | "box-not-applied" | "busy";

const issues: Array<{ id: IssueId; label: string; solution: ReactNode }> = [
  { id: "unexpected-operators", label: "结果里有我没有的干员", solution: null },
  { id: "saved-box", label: "配置弹窗直接到了第 2 步", solution: <p>浏览器已保存过 Box。点弹窗顶部第 1 步「干员数据」，即可回到数据来源选择。</p> },
  { id: "box-not-applied", label: "换过 Box，结果却没变化", solution: <p>确认当前数据不再是全精二示例，点「完成」保存后回到计算器重新生成；旧方案不会自动更新。</p> },
  { id: "busy", label: "提示请求过多或并发已满", solution: <p>停止连续点击，按提示等待；仍繁忙时换一个时间段。已导入的 Box 会保存在浏览器，不用重新导入。</p> },
];

function parseIssue(value: string | null): IssueId | null {
  return issues.some((issue) => issue.id === value) ? value as IssueId : null;
}

export function IssueSolutionPicker({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useState<IssueId | null>(null);

  useEffect(() => {
    const sync = () => setSelected(parseIssue(new URL(window.location.href).searchParams.get("issue")));
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  function selectIssue(id: IssueId) {
    setSelected(id);
    const url = new URL(window.location.href);
    url.searchParams.set("issue", id);
    window.history.replaceState({}, "", url);
  }

  const issue = issues.find((item) => item.id === selected);

  return (
    <section className="grid gap-8" data-help-issue-picker>
      <fieldset className="grid gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
        <legend className="px-1 text-2xl font-semibold">你遇到什么问题？</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {issues.map((item) => (
            <label className={cn("cursor-pointer rounded-xl border border-border p-4 text-lg font-semibold transition-colors hover:bg-muted has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring", selected === item.id && "border-foreground bg-foreground text-background")} key={item.id}>
              <input checked={selected === item.id} className="sr-only" name="help-issue" onChange={() => selectIssue(item.id)} type="radio" value={item.id} />
              {item.label}
            </label>
          ))}
        </div>
      </fieldset>

      {selected === "unexpected-operators" ? children : null}
      {issue && selected !== "unexpected-operators" ? <section className="rounded-2xl border border-border bg-card p-6 text-xl leading-8 shadow-sm" data-help-issue-solution>{issue.solution}</section> : null}
      {!selected ? <p className="rounded-xl border border-dashed border-border px-5 py-10 text-center text-lg text-muted-foreground">选择一个问题，查看对应解决方案。</p> : null}
    </section>
  );
}
