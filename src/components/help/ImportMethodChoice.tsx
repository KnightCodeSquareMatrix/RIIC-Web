"use client";

import { useEffect, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

type ImportMethod = "skland" | "maa";

type ImportMethodChoiceProps = {
  sklandContent: ReactNode;
  maaContent: ReactNode;
};

const methods = [
  {
    id: "skland",
    label: "森空岛",
    description: "用森空岛 App 扫码并同步当前角色。",
  },
  {
    id: "maa",
    label: "MAA",
    description: "从 MAA 导出干员 Box 文件后上传。",
  },
] satisfies Array<{
  id: ImportMethod;
  label: string;
  description: string;
}>;

function parseMethod(value: string | null): ImportMethod | null {
  return value === "skland" || value === "maa" ? value : null;
}

export function ImportMethodChoice({ sklandContent, maaContent }: ImportMethodChoiceProps) {
  const [selectedMethod, setSelectedMethod] = useState<ImportMethod | null>(null);

  useEffect(() => {
    const syncFromUrl = () => {
      const url = new URL(window.location.href);
      const source = url.searchParams.get("source");
      const method = parseMethod(source);

      if (source && !method) {
        url.searchParams.delete("source");
        window.history.replaceState({}, "", url);
      }

      setSelectedMethod(method);
    };

    syncFromUrl();
    window.addEventListener("popstate", syncFromUrl);
    return () => window.removeEventListener("popstate", syncFromUrl);
  }, []);

  function selectMethod(method: ImportMethod) {
    setSelectedMethod(method);

    const url = new URL(window.location.href);
    url.searchParams.set("source", method);
    window.history.replaceState({}, "", url);
  }

  const selectedLabel = methods.find((method) => method.id === selectedMethod)?.label;

  return (
    <section className="grid gap-6" aria-labelledby="import-method-choice-title" data-help-import-method-picker>
      <fieldset className="grid gap-4 rounded-[4px] border border-border bg-card p-4 sm:p-5">
        <legend className="px-1 text-xl font-semibold" id="import-method-choice-title">选择导入方式</legend>
        <p className="text-sm leading-6 text-muted-foreground">选择你实际使用的一种方式，下方只显示对应教程；选错时可直接改选。</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {methods.map((method) => {
            const isSelected = method.id === selectedMethod;

            return (
              <label
                className={cn(
                  "relative flex min-h-24 cursor-pointer items-start rounded-[4px] border border-border bg-background p-4 outline-none transition-[background-color,border-color] hover:border-foreground/35 hover:bg-muted/50 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                  isSelected && "border-foreground bg-foreground text-background",
                )}
                data-help-import-method-option={method.id}
                key={method.id}
              >
                <input
                  checked={isSelected}
                  className="sr-only"
                  name="help-import-method"
                  onChange={() => selectMethod(method.id)}
                  type="radio"
                  value={method.id}
                />
                <span className="min-w-0">
                  <strong className="block text-lg leading-6">{method.label}</strong>
                  <span className={cn("mt-1 block text-sm leading-5 text-muted-foreground", isSelected && "text-background/75")}>{method.description}</span>
                  <span className={cn("mt-2 block text-xs font-semibold text-muted-foreground", isSelected && "text-amber-300")}>
                    {isSelected ? "当前显示" : "选择此方式"}
                  </span>
                </span>
                {isSelected ? (
                  <span className="absolute right-3 top-3 bg-[#FFD800] px-1.5 py-0.5 text-[10px] font-semibold text-black">
                    已选
                  </span>
                ) : null}
              </label>
            );
          })}
        </div>
      </fieldset>

      <p className="sr-only" aria-live="polite">
        {selectedLabel ? `已选择${selectedLabel}，下方显示${selectedLabel}教程。` : "尚未选择导入方式。"}
      </p>

      {selectedMethod ? (
        <div key={selectedMethod} data-help-import-method-panel>
          {selectedMethod === "skland" ? sklandContent : maaContent}
        </div>
      ) : (
        <div className="rounded-[4px] border border-dashed border-border bg-muted/25 px-5 py-10 text-center" data-help-import-choice-empty>
          <p className="font-semibold text-foreground">请先选择 MAA 或森空岛</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">选择后，这里会显示对应截图与操作步骤。</p>
        </div>
      )}
    </section>
  );
}
