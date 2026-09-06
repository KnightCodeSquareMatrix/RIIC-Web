import { Skeleton } from "@/components/ui/skeleton";
export default function Loading() {
  return <div role="status" aria-label="Loading mastery planner" className="grid gap-5 pt-5"><Skeleton className="h-7 w-32" /><Skeleton className="h-80 w-full" /><Skeleton className="h-40 w-full" /></div>;
}
