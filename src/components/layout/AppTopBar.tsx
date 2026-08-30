"use client";

import { Button } from "@/components/ui/button";
import { RemoteAvatar } from "@/components/ui/remote-avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { SidebarTrigger } from "@/components/ui/sidebar";
import type { SklandAccountSummary, SklandStatusSnapshot } from "@/types";

const CLIENT_SKLAND_ENABLED = process.env.APP_CLIENT_SKLAND_ENABLED === "1";

export function AppTopBar() {
  return (
    <header
      className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur-sm md:hidden [padding-top:env(safe-area-inset-top)]"
      data-app-topbar
    >
      <h1 className="sr-only">可露希尔基建终端</h1>
      <div className="app-content-track flex h-14 items-center">
        <SidebarTrigger className="size-11 shrink-0" />
      </div>
    </header>
  );
}

interface SklandAccountControlProps {
  account: SklandAccountSummary;
  statusSnapshot?: SklandStatusSnapshot | null;
  onOpenSkland?: () => void;
}

export function SklandAccountControl({
  account,
  statusSnapshot,
  onOpenSkland,
}: SklandAccountControlProps) {
  if (!CLIENT_SKLAND_ENABLED) return null;

  const selectedRole = account.roles.find((role) => role.uid === account.selectedUid) ?? account.roles[0] ?? null;
  const nickname = statusSnapshot?.player.nickname ?? selectedRole?.nickname ?? null;
  const accountLabel = `${nickname ?? "已登录账号"}，进入森空岛状态中心`;

  return (
    <Button
      type="button"
      size="icon-lg"
      variant="outline"
      className="relative -ms-px size-9 overflow-hidden rounded-l-none rounded-r-lg bg-background p-0 hover:bg-muted max-sm:size-11 max-sm:rounded-lg"
      onClick={onOpenSkland}
      aria-label={accountLabel}
      title={nickname ?? "森空岛状态中心"}
      data-skland-account-control
    >
      <span
        className="grid size-full place-items-center overflow-hidden"
        aria-hidden="true"
        data-skland-account-avatar
      >
        <RemoteAvatar
          src={statusSnapshot?.player.avatarUrl}
          alt=""
          pixelSize={44}
          className="size-full"
          emptyFallback={null}
          loadingFallback={<Skeleton className="size-full rounded-none" />}
        />
      </span>
    </Button>
  );
}
