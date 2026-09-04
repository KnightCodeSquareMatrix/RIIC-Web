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
          <LocalizedText zh="手动排班待开发" en="Manual scheduling is under development" />
        </h1>
        <p className="mx-auto mt-3 max-w-lg text-base leading-6 text-muted-foreground">
          <LocalizedText
            zh="该功能正在继续完善，开放后可在这里手动编辑基建排班。"
            en="This feature is still being refined. Once available, you will be able to edit infrastructure schedules here."
          />
        </p>
      </div>
    </section>
  );
}

export default function Page() {
  if (!isManualScheduleEnabled()) return <ManualScheduleUnavailable />;
  return <ManualScheduleRoute />;
}
