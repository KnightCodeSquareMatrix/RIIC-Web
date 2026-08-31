import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowLeft,
  BadgeCheck,
  BookOpenCheck,
  FileJson,
  MousePointerClick,
  Play,
  ScanLine,
  Settings2,
} from "lucide-react";

import { ImportGuidePager, type ImportGuidePage } from "@/components/help/ImportGuidePager";
import { ImportMethodChoice } from "@/components/help/ImportMethodChoice";
import { ScreenshotPlaceholder } from "@/components/help/ScreenshotPlaceholder";

export const metadata: Metadata = {
  title: "导入干员详细教程 · 使用帮助",
  description: "逐页学习如何用森空岛或 MAA 导入自己的干员 Box。",
};

function ResultHint({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50/75 p-4 text-sm leading-6 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/25 dark:text-emerald-100">
      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-emerald-600 text-white">
        <BadgeCheck className="size-4" aria-hidden="true" />
      </span>
      <span><strong className="font-semibold">完成标志：</strong>{children}</span>
    </div>
  );
}

const commonPages: ImportGuidePage[] = [
  {
    id: "open-settings",
    title: "打开「配置 Box 与布局」",
    summary: "从计算器进入排班设置。",
    content: (
      <section className="grid gap-4" aria-label="打开配置 Box 与布局">
        <p className="text-sm leading-6 text-muted-foreground">
          回到基建计算器。电脑端点顶部「配置Box与布局」；手机端先展开「更多工具」，再点同名按钮。
        </p>
        <ScreenshotPlaceholder
          slot="01"
          title="计算器中的配置入口"
          description="顶部工具栏里的配置 Box 与布局按钮。"
          fileName="help-import-01-open-settings.png"
          src="/images/help/help-import-01-open-settings.png"
          alt="基建计算器顶部工具栏中的配置 Box 与布局按钮"
          imageWidth={1800}
          imageHeight={958}
          highlights={[
            { x: 83.2, y: 3.1, width: 8.7, height: 6, label: "配置 Box 与布局" },
          ]}
        />
        <ResultHint>看到标题为「排班设置」的弹窗。</ResultHint>
      </section>
    ),
  },
  {
    id: "change-box",
    title: "回到「干员数据」，点「更换」",
    summary: "回到干员数据并更换当前 Box。",
    content: (
      <section className="grid gap-4" aria-label="更换当前干员数据">
        <p className="text-sm leading-6 text-muted-foreground">
          弹窗若直接进入布局或设施，点顶部第 1 步「干员数据」。已有 Box 时，点当前数据卡片右侧「更换」。
        </p>
        <ScreenshotPlaceholder
          slot="02"
          title="干员数据与更换按钮"
          description="顶部步骤、当前数据来源和更换按钮。"
          fileName="help-import-02-change-box.png"
          src="/images/help/help-import-02-change-box.png"
          alt="排班设置的干员数据步骤，显示当前 Box 信息和更换按钮"
          imageWidth={1920}
          imageHeight={1080}
          highlights={[
            { x: 6.6, y: 23.1, width: 4, height: 6.8, label: "第 1 步 · 干员数据" },
            { x: 85.2, y: 38.9, width: 6.8, height: 8.1, label: "更换" },
          ]}
        />
        <ResultHint>页面出现森空岛与 MAA 两种来源。</ResultHint>
      </section>
    ),
  },
  {
    id: "choose-source-in-app",
    title: "在设置中选择数据来源",
    summary: "到这里再按实际情况使用森空岛或 MAA。",
    content: (
      <section className="grid gap-4" aria-label="在设置中选择导入来源">
        <p className="text-sm leading-6 text-muted-foreground">
          到这里再按你实际使用的工具，点森空岛或 MAA。下一页选择同一种方式后，只显示对应教程。工具栏里的「全角色导入」会载入全精二体验示例，请注意与导入自己的 Box 区分。
        </p>
        <ScreenshotPlaceholder
          slot="03"
          title="干员数据来源选项"
          description="设置中的森空岛与 MAA 来源标签。"
          fileName="help-import-03-source-tabs.png"
          src="/images/help/help-import-03-source-tabs.png"
          alt="导入数据页面中的森空岛与 MAA 数据来源标签"
          imageWidth={1920}
          imageHeight={1080}
          highlights={[
            { x: 8.7, y: 69.4, width: 82.6, height: 7.7, label: "选择森空岛或 MAA" },
          ]}
        />
        <ResultHint>页面显示所选来源对应的导入入口。</ResultHint>
      </section>
    ),
  },
];

const importMethodsPage: ImportGuidePage = {
  id: "import-methods",
  title: "按自己的方式完成导入",
  summary: "选择 MAA 或森空岛，只显示对应的操作步骤。",
  content: (
    <ImportMethodChoice
      sklandContent={(
      <section className="grid gap-4 rounded-3xl border border-border/80 bg-card p-4 shadow-sm sm:p-6" data-help-import-method="skland" aria-labelledby="skland-method-title">
        <header className="flex items-start gap-3 border-b border-border pb-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-foreground text-background shadow-sm">
            <ScanLine className="size-5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs font-semibold tracking-[0.12em] text-primary">使用森空岛时</p>
            <h3 className="mt-1 text-xl font-semibold" id="skland-method-title">森空岛同步</h3>
          </div>
        </header>
        <div className="grid gap-2 text-sm leading-6 text-muted-foreground">
          <p><strong className="text-foreground">1.</strong> 点「前往森空岛同步」。</p>
          <p><strong className="text-foreground">2.</strong> 勾选并确认两项协议。</p>
          <p><strong className="text-foreground">3.</strong> 二维码显示后，用森空岛 App 扫码，再回到 App 内确认授权。</p>
          <p><strong className="text-foreground">注意：</strong>网页显示“已扫码”不等于完成；二维码过期时点刷新。</p>
        </div>
        <ScreenshotPlaceholder
          slot="04"
          title="先确认协议，再扫码"
          description="先勾选两项协议，二维码显示后再扫码；示例图已隐藏个人信息。"
          fileName="help-import-04-skland-scan.png"
          src="/images/help/help-import-04-skland-scan.png"
          alt="森空岛登录页面，先勾选两项协议，再扫描已替换为演示占位的二维码"
          imageWidth={2528}
          imageHeight={1576}
          highlights={[
            { x: 31.8, y: 69.6, width: 36.5, height: 14.2, label: "确认协议" },
            { x: 41.1, y: 37.2, width: 17.8, height: 28.7, label: "扫码" },
          ]}
        />
        <p className="text-sm leading-6 text-muted-foreground">
          授权成功后，森空岛 Box 会自动应用。多角色账号先确认当前同步的是目标角色，再继续配置布局。
        </p>
        <ScreenshotPlaceholder
          slot="05"
          title="森空岛同步成功状态"
          description="角色信息，以及继续配置布局与生成排班按钮。"
          fileName="help-import-05-use-skland.png"
          src="/images/help/help-import-05-use-skland.png"
          alt="森空岛数据已同步到排班助手，并显示继续配置布局与前往生成排班按钮"
          imageWidth={828}
          imageHeight={484}
          highlights={[
            { x: 3.5, y: 5.2, width: 50.5, height: 40.5, label: "确认目标角色与数量" },
            { x: 3.5, y: 50.5, width: 49.5, height: 43, label: "继续配置或生成排班" },
          ]}
        />
        <ResultHint>页面显示目标角色和已同步的干员数量。</ResultHint>
      </section>
      )}
      maaContent={(
      <section className="grid gap-4 rounded-3xl border border-border/80 bg-card p-4 shadow-sm sm:p-6" data-help-import-method="maa" aria-labelledby="maa-method-title">
        <header className="flex items-start gap-3 border-b border-border pb-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-foreground text-background shadow-sm">
            <FileJson className="size-5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs font-semibold tracking-[0.12em] text-primary">使用 MAA 时</p>
            <h3 className="mt-1 text-xl font-semibold" id="maa-method-title">MAA 文件导入</h3>
          </div>
        </header>
        <p className="text-sm leading-6 text-muted-foreground">
          先在 MAA 导出 <code className="break-all rounded bg-muted px-1 py-0.5 text-foreground">Arknights_OperBox_Export.json</code>。不要选排班文件，也不要上传本站导出的 MAA 排班 JSON。
        </p>
        <ScreenshotPlaceholder
          slot="06"
          title="MAA 中导出干员 Box"
          description="MAA 干员识别页面中的导出入口。"
          fileName="help-import-06-maa-export.png"
          src="/images/help/help-import-06-maa-export.png"
          alt="MAA 小工具的干员识别页面，显示导出入口并隐藏了干员列表"
          imageWidth={1000}
          imageHeight={562}
          highlights={[
            { x: 56.5, y: 8, width: 12.5, height: 10.5, label: "小工具" },
            { x: 34.8, y: 17.8, width: 12.5, height: 10.2, label: "干员识别" },
            { x: 28.5, y: 69.2, width: 20.5, height: 16.5, label: "选择导出方式并导出" },
          ]}
        />
        <p className="text-sm leading-6 text-muted-foreground">
          登录已验证的网站账号后，在 MAA 页签上传文件；也可展开「粘贴 JSON」，粘贴完整内容后导入。上传区同时支持一图流 XLSX。
        </p>
        <ScreenshotPlaceholder
          slot="07"
          title="上传或粘贴 MAA 数据"
          description="上传区、粘贴 JSON 入口和导入后的来源信息。"
          fileName="help-import-07-maa-upload.png"
          src="/images/help/help-import-07-maa-upload.png"
          alt="MAA 数据导入页面中的上传文件与粘贴 JSON 入口"
          imageWidth={1920}
          imageHeight={1080}
          highlights={[
            { x: 49.9, y: 70.4, width: 40.8, height: 5.6, label: "选择 MAA" },
            { x: 9, y: 80.5, width: 81.8, height: 19.3, label: "上传 JSON / XLSX" },
          ]}
        />
        <ResultHint>导入成功后自动进入「布局」，当前来源显示 MAA 或文件名。</ResultHint>
      </section>
      )}
    />
  ),
};

const sharedPages: ImportGuidePage[] = [
  {
    id: "finish",
    title: "完成设置并重新生成",
    summary: "保存配置并重新生成排班。",
    content: (
      <section className="grid gap-4" aria-label="完成设置并重新生成">
        <ol className="grid gap-3 text-sm leading-6 text-muted-foreground sm:grid-cols-3">
          <li className="rounded-2xl border border-border/80 bg-card p-4 shadow-sm"><span className="grid size-9 place-items-center rounded-xl bg-muted text-primary"><MousePointerClick className="size-4.5" aria-hidden="true" /></span><strong className="mt-3 block text-foreground">1. 继续</strong><p className="mt-1">进入布局与设施检查。</p></li>
          <li className="rounded-2xl border border-border/80 bg-card p-4 shadow-sm"><span className="grid size-9 place-items-center rounded-xl bg-muted text-primary"><Settings2 className="size-4.5" aria-hidden="true" /></span><strong className="mt-3 block text-foreground">2. 完成</strong><p className="mt-1">保存这次 Box 和布局。</p></li>
          <li className="rounded-2xl border border-border/80 bg-card p-4 shadow-sm"><span className="grid size-9 place-items-center rounded-xl bg-muted text-primary"><Play className="size-4.5" aria-hidden="true" /></span><strong className="mt-3 block text-foreground">3. 重新生成</strong><p className="mt-1">旧排班不会自动套用新 Box。</p></li>
        </ol>
      </section>
    ),
  },
];

const pages = [...commonPages, importMethodsPage, ...sharedPages];

export default function ImportOperatorsHelpPage() {
  return (
    <article className="overflow-hidden rounded-3xl border border-border/80 bg-background/95 shadow-[0_26px_80px_-48px_rgba(0,0,0,0.45)]">
      <header className="relative overflow-hidden border-b border-border/80 bg-gradient-to-br from-background via-background to-muted/60 px-5 py-6 sm:px-8 sm:py-8 lg:px-10 lg:py-9">
        <div aria-hidden="true" className="absolute -right-24 -top-32 size-80 rounded-full border-[52px] border-amber-300/20" />
        <div aria-hidden="true" className="absolute bottom-0 right-14 h-24 w-px bg-gradient-to-b from-transparent to-amber-400/70" />
        <div className="relative">
          <Link className="inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring" href="/help">
            <ArrowLeft className="size-4" aria-hidden="true" />返回帮助首页
          </Link>

          <div className="mt-4 flex items-start gap-4 sm:mt-5">
            <span className="mt-1 hidden size-12 shrink-0 place-items-center rounded-2xl bg-foreground text-background shadow-lg sm:grid">
              <BookOpenCheck className="size-6" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold tracking-[0.18em] text-muted-foreground">IMPORT GUIDE · 图文教程</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl lg:text-[2.75rem]">导入自己的干员 Box</h1>
            </div>
          </div>
        </div>
      </header>

      <ImportGuidePager pages={pages} />
    </article>
  );
}
