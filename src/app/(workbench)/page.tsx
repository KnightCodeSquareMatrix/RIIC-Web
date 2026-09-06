import { pageMetadata } from "@/i18n/metadata";
import { CalculatorRoute } from "@/components/workbench/CalculatorRoute";

export default function Page() {
  return <CalculatorRoute />;
}

export function generateMetadata() { return pageMetadata("home"); }
