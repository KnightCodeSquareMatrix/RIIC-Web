"use client";

import dynamic from "next/dynamic";

import { Skeleton } from "@/components/ui/skeleton";
import { useWorkbench } from "@/workbench-context";

function ManualScheduleLoading() {
  return (
    <section
      className="grid min-h-[calc(100svh-9rem)] content-start gap-4 py-5"
      aria-hidden="true"
      data-manual-schedule-loading
    >
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-40 w-full" />
      <div className="grid gap-3 lg:grid-cols-2">
        <Skeleton className="h-72 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    </section>
  );
}

const ManualSchedulePage = dynamic(
  () => import("@/components/pages/ManualSchedulePage").then((module) => module.ManualSchedulePage),
  { ssr: false, loading: ManualScheduleLoading },
);

export function ManualScheduleRoute() {
  const { manual } = useWorkbench();
  return <ManualSchedulePage {...manual} />;
}
