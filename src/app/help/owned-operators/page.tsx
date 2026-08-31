import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CircleAlert, Database, FileJson, MousePointerClick, Play, RefreshCcw, ScanLine, Settings2, TriangleAlert, Upload, UsersRound } from "lucide-react";

import { IssueSolutionPicker } from "@/components/help/IssueSolutionPicker";

export const metadata: Metadata = {
  title: "切换已有干员 · 使用帮助",
  description: "把全角色示例切换为自己的森空岛或 MAA 干员 Box。",
};

const steps = [
  {
    title: "打开排班设置",
    description: "回到基建计算器。电脑端点顶部「配置Box与布局」；手机端先点「更多工具」，再点同名按钮。",
    icon: Settings2,
  },
  {
    title: "回到第 1 步「干员数据」",
    description: "如果弹窗直接显示布局或设施，不用关闭。点顶部进度条最左侧的「干员数据」。",
    icon: MousePointerClick,
  },
  {
    title: "点当前数据右侧的「更换」",
    description: "展开数据来源选项。不要点页面外面的「全角色导入」，它只会载入体验用的全精二示例。",
    icon: UsersRound,
  },
  {
    title: "导入你自己的 Box",
    description: "选择森空岛同步，或上传 MAA 导出的 Arknights_OperBox_Export.json。两种方式选一种即可。",
    icon: Upload,
  },
  {
    title: "完成设置并重新生成",
    description: "按界面提示点「继续」或「检查设施」，核对布局与设施，再点「完成」。回到计算器后重新生成排班。",
    icon: Play,
  },
];

export default function OwnedOperatorsHelpPage() {
  return (
    <article className="overflow-hidden rounded-3xl border border-border/80 bg-background/95 shadow-[0_26px_80px_-48px_rgba(0,0,0,0.45)]">
      <header className="relative overflow-hidden border-b border-border/80 bg-gradient-to-br from-background via-background to-muted/60 px-5 py-6 sm:px-8 sm:py-8 lg:px-10 lg:py-9">
        <div aria-hidden="true" className="absolute -right-24 -top-32 size-80 rounded-full border-[52px] border-amber-300/20" />
        <Link className="relative inline-flex min-h-11 items-center gap-2 rounded-lg text-base font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring" href="/help">
          <ArrowLeft className="size-4" aria-hidden="true" />返回帮助首页
        </Link>
        <div className="relative mt-4 flex items-start gap-4 sm:mt-5">
          <span className="mt-1 hidden size-12 shrink-0 place-items-center rounded-2xl bg-foreground text-background shadow-lg sm:grid">
            <UsersRound className="size-6" aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs font-semibold tracking-[0.18em] text-muted-foreground">OPERATOR BOX · 数据切换</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl lg:text-[2.75rem]">切换成自己已有的干员</h1>
            <p className="mt-3 max-w-3xl text-lg leading-8 text-muted-foreground sm:text-xl">适用于误点「全角色导入」、方案出现未拥有干员，或练完新干员后想更新 Box 的情况。</p>
          </div>
        </div>
      </header>

      <IssueSolutionPicker>
      <div className="grid gap-9 px-5 py-7 sm:px-8 sm:py-9 lg:px-10 lg:py-10">
        <section className="rounded-xl border border-amber-300 bg-amber-50 p-5 text-amber-950" aria-labelledby="sample-warning-title">
          <div className="flex items-start gap-3">
            <TriangleAlert className="mt-0.5 size-5 shrink-0 text-amber-700" aria-hidden="true" />
            <div>
              <h2 id="sample-warning-title" className="text-xl font-semibold sm:text-2xl">先看当前来源是不是「243 全精二示例」</h2>
              <p className="mt-2 text-lg leading-8 text-amber-900">如果是，排出你没有的干员属于预期现象。无需清浏览器缓存，也不用删除账号；按下面步骤更换即可。</p>
            </div>
          </div>
        </section>

        <section aria-labelledby="switch-steps-title">
          <div className="flex items-center gap-2">
            <Database className="size-5 text-primary" aria-hidden="true" />
            <h2 id="switch-steps-title" className="text-3xl font-semibold sm:text-4xl">逐步切换</h2>
          </div>
          <ol className="mt-5 grid gap-4">
            {steps.map(({ title, description, icon: Icon }, index) => (
              <li key={title} className="grid gap-5 rounded-xl border border-border p-5 sm:grid-cols-[3.5rem_minmax(0,1fr)] sm:p-6">
                <span className="grid size-14 place-items-center rounded-full bg-foreground text-background" aria-hidden="true">
                  <span className="font-number text-base font-semibold">{String(index + 1).padStart(2, "0")}</span>
                </span>
                <div className="min-w-0">
                  <h3 className="flex items-center gap-2 text-2xl font-semibold leading-tight"><Icon className="size-6 shrink-0 text-primary" aria-hidden="true" />{title}</h3>
                  <p className="mt-3 text-lg leading-8 text-muted-foreground sm:text-xl">{description}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="import-method-title" className="hidden">
          <h2 id="import-method-title" className="text-3xl font-semibold sm:text-4xl">两种导入方式</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <section className="rounded-xl border border-border bg-card p-5" aria-labelledby="skland-method-title">
              <ScanLine className="size-6 text-primary" aria-hidden="true" />
              <h3 id="skland-method-title" className="mt-3 text-2xl font-semibold">森空岛同步</h3>
              <ol className="mt-4 grid gap-3 text-lg leading-8 text-muted-foreground">
                <li><strong className="text-foreground">1.</strong> 点「前往森空岛同步」。</li>
                <li><strong className="text-foreground">2.</strong> 勾选并确认两项协议。</li>
                <li><strong className="text-foreground">3.</strong> 二维码显示后，用森空岛 App 扫码并在 App 内确认。</li>
                <li><strong className="text-foreground">4.</strong> 授权成功后 Box 自动应用；再点「继续配置布局」或「前往生成排班」。</li>
              </ol>
              <p className="mt-5 rounded-lg bg-muted/60 p-4 text-base leading-7 text-muted-foreground">二维码过期时刷新二维码；同步暂不可用时可改用 MAA。</p>
            </section>

            <section className="rounded-xl border border-border bg-card p-5" aria-labelledby="maa-method-title">
              <FileJson className="size-6 text-primary" aria-hidden="true" />
              <h3 id="maa-method-title" className="mt-3 text-2xl font-semibold">MAA 文件导入</h3>
              <ol className="mt-4 grid gap-3 text-lg leading-8 text-muted-foreground">
                <li><strong className="text-foreground">1.</strong> 在 MAA 导出干员数据文件。</li>
                <li><strong className="text-foreground">2.</strong> 上传 <code className="break-all rounded bg-muted px-1 py-0.5 text-foreground">Arknights_OperBox_Export.json</code>。</li>
                <li><strong className="text-foreground">3.</strong> 也可展开「粘贴 JSON」，粘贴完整内容后导入。</li>
              </ol>
              <p className="mt-5 rounded-lg bg-muted/60 p-4 text-base leading-7 text-muted-foreground">不要上传排班文件或本站导出的 MAA 排班 JSON。当前 MAA 导入需要已验证的网站账号。</p>
            </section>
          </div>
          <Link className="mt-5 inline-flex min-h-12 items-center gap-2 rounded-lg border border-border px-5 text-lg font-semibold text-primary outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring" href="/help/import-operators">
            查看含截图位的详细导入教程<ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </section>

        <section aria-labelledby="source-check-title" className="hidden">
          <div className="flex items-center gap-2">
            <CircleAlert className="size-5 text-primary" aria-hidden="true" />
            <h2 id="source-check-title" className="text-3xl font-semibold sm:text-4xl">怎么判断切换成功</h2>
          </div>
          <div className="mt-4 overflow-hidden rounded-xl border border-border">
            <table className="w-full border-collapse text-left text-base sm:text-lg">
              <thead className="bg-muted/70 text-muted-foreground"><tr><th className="px-4 py-3 font-medium">当前数据显示</th><th className="px-4 py-3 font-medium">代表什么</th></tr></thead>
              <tbody className="divide-y divide-border">
                <tr><td className="px-4 py-3 font-medium">243 全精二示例</td><td className="px-4 py-3 text-muted-foreground">仍是体验数据，还没换成自己的 Box。</td></tr>
                <tr><td className="px-4 py-3 font-medium">森空岛 / 上次同步的森空岛数据</td><td className="px-4 py-3 text-muted-foreground">正在使用森空岛角色数据。</td></tr>
                <tr><td className="px-4 py-3 font-medium">JSON 文件名 / MAA 导入</td><td className="px-4 py-3 text-muted-foreground">正在使用 MAA 干员数据。</td></tr>
              </tbody>
            </table>
          </div>
          <div className="mt-5 rounded-xl border border-sky-200 bg-sky-50 p-5 text-lg leading-8 text-sky-950">
            <strong className="text-xl">数量不完全一致不一定是失败。</strong>
            <p className="mt-2 text-sky-900">使用 MAA 文件时先对比“名可用”，不要拿文件总条目数当持有数。游戏内概况总数可能不计部分联动干员，而导入数据会包含你实际拥有的联动干员。建议再抽查具体干员。</p>
          </div>
        </section>

        <section aria-labelledby="recovery-title" className="hidden">
          <div className="flex items-center gap-2">
            <RefreshCcw className="size-5 text-primary" aria-hidden="true" />
            <h2 id="recovery-title" className="text-3xl font-semibold sm:text-4xl">切换后仍出现未拥有干员</h2>
          </div>
          <ol className="mt-5 grid gap-3 text-lg leading-8 text-muted-foreground">
            <li><strong className="text-foreground">1.</strong> 确认弹窗里的当前数据不再是全精二示例。</li>
            <li><strong className="text-foreground">2.</strong> 确认“名可用”不是 <span className="font-number">0</span>。若只差联动干员数量，通常不代表导入失败。</li>
            <li><strong className="text-foreground">3.</strong> 点完「完成」后重新生成，不要继续查看旧排班。</li>
            <li><strong className="text-foreground">4.</strong> 仍有问题时重新导出最新 Box，并在反馈中写明异常干员名称与当前数据来源。</li>
          </ol>
        </section>

        <section className="hidden flex-wrap items-center justify-between gap-4 rounded-xl bg-foreground p-5 text-background" aria-label="返回计算器">
          <div><strong className="block text-2xl">准备好了</strong><p className="mt-2 text-lg text-background/75">回到计算器，按步骤更换并重新生成。</p></div>
          <Link className="inline-flex min-h-12 items-center gap-2 rounded-lg bg-background px-5 text-lg font-semibold text-foreground outline-none hover:bg-background/90 focus-visible:ring-2 focus-visible:ring-background" href="/">
            <Settings2 className="size-4" aria-hidden="true" />返回基建计算器
          </Link>
        </section>
      </div>
      </IssueSolutionPicker>
    </article>
  );
}
