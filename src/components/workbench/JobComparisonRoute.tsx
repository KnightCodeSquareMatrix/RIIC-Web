"use client";
import { JobComparison } from "@/components/pages/JobComparison";
import { useWorkbench } from "@/workbench-context";

export function JobComparisonRoute() {
  const { comparison } = useWorkbench();
  return <JobComparison {...comparison} />;
}
