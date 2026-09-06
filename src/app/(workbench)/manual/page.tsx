import { pageMetadata } from "@/i18n/metadata";
import { Construction } from "lucide-react";

import { LocalizedText } from "@/components/LocalizedText";
import { ManualScheduleRoute } from "@/components/workbench/ManualScheduleRoute";
import { isManualScheduleEnabled } from "@/deployment";

function ManualScheduleUnavailable() {
  return (
    <section
      className="flex min-h-[calc(100svh-9rem)] items-center justify-center py-8"
      aria-labelledby="manual-schedule-unavailable-title"
      data-manual-schedule-unavailable
    >
      <div className="w-full max-w-2xl border border-[#313131]/15 bg-[#F3F1EA] px-6 py-12 text-center shadow-[0_18px_45px_rgb(49_49_49/0.08)] sm:px-10">
        <span className="mx-auto grid size-12 place-items-center bg-[#313131] text-[#FFD800]" aria-hidden="true">
          <Construction />
        </span>
        <h1 id="manual-schedule-unavailable-title" className="mt-5 text-2xl font-semibold tracking-tight">
          <LocalizedText message="app__workbench__manual_page_tsx1" />
        </h1>
        <p className="mx-auto mt-3 max-w-lg text-base leading-6 text-muted-foreground">
          <LocalizedText message="app__workbench__manual_page_tsx2" />
        </p>
      </div>
    </section>
  );
}

export default function Page() {
  if (!isManualScheduleEnabled()) return <ManualScheduleUnavailable />;
  return <ManualScheduleRoute />;
}

export function generateMetadata() { return pageMetadata("manual"); }
