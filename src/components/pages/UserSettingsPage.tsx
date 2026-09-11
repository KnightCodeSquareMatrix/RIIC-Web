"use client";

import { useLocale } from "next-intl";
import { RotateCcw, Settings2, SlidersHorizontal } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { DEFAULT_USER_SETTINGS, type UserSettings } from "@/user-settings";

interface UserSettingsPageProps {
  settings: UserSettings;
  onSettingsChange: (settings: UserSettings) => void;
}

export function UserSettingsPage({ settings, onSettingsChange }: UserSettingsPageProps) {
  const en = useLocale() === "en";
  const [viewControlDetailsOpen, setViewControlDetailsOpen] = useState(!settings.linkShiftViewControl);
  const resetViewControls = () => onSettingsChange({
    ...settings,
    scheduleViewControl: DEFAULT_USER_SETTINGS.scheduleViewControl,
    linkShiftViewControl: DEFAULT_USER_SETTINGS.linkShiftViewControl,
    shiftViewControl: DEFAULT_USER_SETTINGS.shiftViewControl,
  });
  return (
    <div className="min-h-[calc(100svh-9rem)] py-5" data-user-settings-page>
      <header className="mb-6 flex items-center gap-3 border-b border-border/70 pb-5">
        <div className="flex size-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Settings2 className="size-5" aria-hidden="true" />
        </div>
        <div>
          <h1 className="font-heading text-2xl font-semibold">{en ? "Settings" : "设置"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{en ? "Personalize scheduling behavior." : "调整排班和操作行为。"}</p>
        </div>
      </header>

      <div className="grid max-w-3xl gap-4">
        <Card>
          <CardHeader>
            <CardTitle>{en ? "Manual scheduling" : "手动排班"}</CardTitle>
            <CardDescription>
              {en ? "Choose how operator conflicts are handled." : "选择干员冲突时的处理方式。"}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="flex items-center justify-between gap-6 border-t border-border/60 pt-4">
              <Label htmlFor="strict-maa-operator-order" className="grid min-w-0 gap-1">
                <span>{en ? "Strict operator order" : "严格按照顺序入驻"}</span>
                <span className="font-normal text-sm text-muted-foreground">
                  {en
                    ? "Export operators in the same order shown in the schedule. Enabling this can make MAA take longer to fill rooms."
                    : "导出到 MAA 时，按前端排班中显示的顺序依次入驻；开启后 MAA 填写时间可能变长。"}
                </span>
              </Label>
              <Switch
                id="strict-maa-operator-order"
                checked={settings.strictMaaOperatorOrder}
                onCheckedChange={(checked) => onSettingsChange({
                  ...settings,
                  strictMaaOperatorOrder: checked,
                })}
                aria-label={en ? "Strict operator order" : "严格按照顺序入驻"}
              />
            </div>
            <div className="grid gap-3 border-t border-border/60 pt-4">
              <div className="flex items-center justify-between gap-6">
              <Label htmlFor="schedule-view-control" className="grid min-w-0 gap-1">
                <span>{en ? "Schedule view control" : "排班视图切换方式"}</span>
                <span className="font-normal text-sm text-muted-foreground">
                  {en ? "Choose buttons or a dropdown for overview and list." : "选择“一图流 / 列表式”使用按钮还是下拉表单。"}
                </span>
              </Label>
              <div className="flex shrink-0 items-center gap-2">
                <Button type="button" variant="outline" size="icon" className="size-9" onClick={() => setViewControlDetailsOpen((open) => !open)} aria-label={en ? "Detailed controls" : "细致调整"} title={en ? "Detailed controls" : "细致调整"}>
                  <SlidersHorizontal />
                </Button>
              </div>
              </div>
              {viewControlDetailsOpen ? (
                <div className="grid gap-3 rounded-md border border-border/70 bg-muted/20 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-sm font-medium">{en ? "Detailed controls" : "细致调整"}</div>
                    <Button type="button" variant="ghost" size="sm" onClick={resetViewControls}>
                      <RotateCcw />{en ? "Restore defaults" : "恢复默认"}
                    </Button>
                  </div>
                  <div className="flex items-center justify-between gap-6">
                    <Label htmlFor="link-shift-view-control" className="grid min-w-0 gap-1">
                      <span>{en ? "Use one setting for all" : "统一使用总设置"}</span>
                      <span className="font-normal text-sm text-muted-foreground">
                        {en ? "Disable this to tune overview/list and shift switching separately." : "关闭后可分别调整“一图流 / 列表式”和“多班制”。"}
                      </span>
                    </Label>
                    <Switch
                      id="link-shift-view-control"
                      checked={settings.linkShiftViewControl}
                      onCheckedChange={(checked) => onSettingsChange({
                        ...settings,
                        linkShiftViewControl: checked,
                        shiftViewControl: checked ? settings.scheduleViewControl : settings.shiftViewControl,
                      })}
                      aria-label={en ? "Use one setting for all" : "统一使用总设置"}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-6">
                    <Label htmlFor="schedule-view-control-detail" className="grid min-w-0 gap-1">
                      <span>{en ? "Overview / list" : "一图流 / 列表式"}</span>
                    </Label>
                    <select
                      id="schedule-view-control-detail"
                      value={settings.scheduleViewControl}
                      onChange={(event) => {
                        const control = event.target.value === "select" ? "select" : "tabs";
                        onSettingsChange({
                          ...settings,
                          scheduleViewControl: control,
                          shiftViewControl: settings.linkShiftViewControl ? control : settings.shiftViewControl,
                        });
                      }}
                      className="h-9 min-w-32 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={en ? "Overview and list control" : "一图流和列表式控件"}
                    >
                      <option value="tabs">{en ? "Buttons" : "按钮"}</option>
                      <option value="select">{en ? "Dropdown" : "下拉表单"}</option>
                    </select>
                  </div>
                  <div className="flex items-center justify-between gap-6">
                    <Label htmlFor="shift-view-control" className="grid min-w-0 gap-1">
                      <span>{en ? "Shift view control" : "多班制切换方式"}</span>
                      <span className="font-normal text-sm text-muted-foreground">
                        {en ? "Choose buttons or a dropdown for switching between shifts." : "单独选择“第 1 班 / 第 2 班…”使用按钮还是下拉表单。"}
                      </span>
                    </Label>
                    <select
                      id="shift-view-control"
                      value={settings.linkShiftViewControl ? settings.scheduleViewControl : settings.shiftViewControl}
                      disabled={settings.linkShiftViewControl}
                      onChange={(event) => onSettingsChange({
                        ...settings,
                        shiftViewControl: event.target.value === "select" ? "select" : "tabs",
                      })}
                      className="h-9 min-w-32 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                      aria-label={en ? "Shift view control" : "多班制切换方式"}
                    >
                      <option value="tabs">{en ? "Buttons" : "按钮"}</option>
                      <option value="select">{en ? "Dropdown" : "下拉表单"}</option>
                    </select>
                  </div>
                </div>
              ) : null}
            </div>
            <div className="flex items-center justify-between gap-6 border-t border-border/60 pt-4">
              <Label htmlFor="image-export-scope" className="grid min-w-0 gap-1">
                <span>{en ? "Image export scope" : "导出图片范围"}</span>
                <span className="font-normal text-sm text-muted-foreground">
                  {en ? "Choose one shift or all shifts. All-shift export is currently under maintenance." : "选择导出一班或全班；全班导出目前维护中。"}
                </span>
              </Label>
              <select
                id="image-export-scope"
                value={settings.imageExportScope}
                onChange={(event) => onSettingsChange({
                  ...settings,
                  imageExportScope: event.target.value === "all" ? "all" : "single",
                })}
                className="h-9 min-w-24 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={en ? "Image export scope" : "导出图片范围"}
              >
                <option value="single">{en ? "One shift" : "一班"}</option>
                <option value="all">{en ? "All shifts" : "全班"}</option>
              </select>
            </div>
            <div className="flex items-center justify-between gap-6 border-t border-border/60 pt-4">
              <Label htmlFor="show-progression-recalculate" className="grid min-w-0 gap-1">
                <span>{en ? "Show progression recalculation" : "显示修改练度并重算"}</span>
                <span className="font-normal text-sm text-muted-foreground">
                  {en ? "Show the button for simulating higher operator levels." : "控制“修改练度并重算”按钮是否显示。"}
                </span>
              </Label>
              <Switch
                id="show-progression-recalculate"
                checked={settings.showProgressionRecalculate}
                onCheckedChange={(checked) => onSettingsChange({ ...settings, showProgressionRecalculate: checked })}
                aria-label={en ? "Show progression recalculation" : "显示修改练度并重算"}
              />
            </div>
            <div className="flex items-center justify-between gap-6 border-t border-border/60 pt-4">
              <Label htmlFor="show-manual-schedule-edit" className="grid min-w-0 gap-1">
                <span>{en ? "Show current plan editor" : "显示基于当前方案编辑"}</span>
                <span className="font-normal text-sm text-muted-foreground">
                  {en ? "Show the button for opening the manual schedule editor." : "控制“基于当前方案编辑”按钮是否显示。"}
                </span>
              </Label>
              <Switch
                id="show-manual-schedule-edit"
                checked={settings.showManualScheduleEdit}
                onCheckedChange={(checked) => onSettingsChange({ ...settings, showManualScheduleEdit: checked })}
                aria-label={en ? "Show current plan editor" : "显示基于当前方案编辑"}
              />
            </div>
            <div className="flex items-center justify-between gap-6 border-t border-border/60 pt-4">
              <Label htmlFor="load-english-resources" className="grid min-w-0 gap-1">
                <span>{en ? "Load English resources" : "加载英文资源"}</span>
                <span className="font-normal text-sm text-muted-foreground">{en ? "When off, English game data is not requested." : "关闭后不请求英文干员名、房间名和技能数据。"}</span>
              </Label>
              <Switch id="load-english-resources" checked={settings.loadEnglishResources} onCheckedChange={(checked) => onSettingsChange({ ...settings, loadEnglishResources: checked })} aria-label={en ? "Load English resources" : "加载英文资源"} />
            </div>
            <div className="flex items-center justify-between gap-6 border-t border-border/60 pt-4">
              <Label htmlFor="skill-pagination" className="grid min-w-0 gap-1">
                <span>{en ? "Skill page loading" : "技能页加载方式"}</span>
                <span className="font-normal text-sm text-muted-foreground">{en ? "Infinite scroll or click after ten results." : "无限下滚，或每显示十条后点击继续下滚。"}</span>
              </Label>
              <select id="skill-pagination" value={settings.skillPagination} onChange={(event) => onSettingsChange({ ...settings, skillPagination: event.target.value === "manual" ? "manual" : "infinite" })} className="h-9 min-w-32 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={en ? "Skill page loading" : "技能页加载方式"}>
                <option value="infinite">{en ? "Infinite scroll" : "无限下滚"}</option>
                <option value="manual">{en ? "Click every ten" : "每十条点击加载"}</option>
              </select>
            </div>
            <div className="flex items-center justify-between gap-6 border-t border-border/60 pt-4">
              <Label htmlFor="show-feedback" className="grid min-w-0 gap-1">
                <span>{en ? "Show feedback buttons" : "显示反馈按钮"}</span>
                <span className="font-normal text-sm text-muted-foreground">{en ? "Show issue and performance feedback actions." : "控制排班结果中的问题反馈和性能反馈按钮。"}</span>
              </Label>
              <Switch id="show-feedback" checked={settings.showFeedback} onCheckedChange={(checked) => onSettingsChange({ ...settings, showFeedback: checked })} aria-label={en ? "Show feedback buttons" : "显示反馈按钮"} />
            </div>
            <div className="flex items-center justify-between gap-6 border-t border-border/60 pt-4">
              <Label htmlFor="show-images" className="grid min-w-0 gap-1">
                <span>{en ? "Load operator images" : "加载干员图片"}</span>
                <span className="font-normal text-sm text-muted-foreground">{en ? "When off, show names without loading portraits." : "关闭后只显示干员名字，不加载头像图片。"}</span>
              </Label>
              <Switch id="show-images" checked={settings.showImages} onCheckedChange={(checked) => onSettingsChange({ ...settings, showImages: checked })} aria-label={en ? "Load operator images" : "加载干员图片"} />
            </div>
            <div className="border-t border-border/60 pt-4">
              <div className="flex items-center justify-between gap-4">
                <div className="grid min-w-0 gap-1">
                  <span className="font-medium">{en ? "Clear local cache data" : "清除本地缓存数据"}</span>
                  <span className="text-sm text-muted-foreground">{en ? "Clears schedules, drafts, BOX/layout data, settings, onboarding state, and browser cache. You may need to import and configure again." : "清除本地排班、草稿、BOX/布局数据、设置、引导状态和浏览器缓存；之后可能需要重新导入和配置。"}</span>
                </div>
                <Button type="button" variant="destructive" size="sm" onClick={() => {
                  const message = en ? "This clears all local app data and browser cache entries. Continue?" : "将清除全部本地应用数据和浏览器缓存，之后可能需要重新导入和配置。继续吗？";
                  if (!window.confirm(message)) return;
                  window.localStorage.clear();
                  window.sessionStorage.clear();
                  void window.caches?.keys().then((keys) => Promise.all(keys.map((key) => window.caches.delete(key))));
                  window.location.reload();
                }}>
                  <RotateCcw />{en ? "Clear data" : "清除数据"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
