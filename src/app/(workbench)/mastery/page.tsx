import { pageMetadata } from "@/i18n/metadata";
import { MasteryRoute } from "@/components/workbench/MasteryRoute";

export default function Page() { return <MasteryRoute />; }

export function generateMetadata() { return pageMetadata("mastery"); }
