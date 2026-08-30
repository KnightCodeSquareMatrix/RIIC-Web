"use client";

import { createContext, useContext } from "react";

import type { AccountStatusCenterProps } from "@/components/pages/AccountStatusCenter";
import type { DevelopmentSklandStatusCenterProps } from "@/components/pages/DevelopmentSklandStatusCenter";
import type { InfraCalculatorProps } from "@/components/pages/InfraCalculator";
import type { TrainingAdviceProps } from "@/components/pages/TrainingAdvice";

export interface WorkbenchContextValue {
  calculator: InfraCalculatorProps;
  training: TrainingAdviceProps;
  account: AccountStatusCenterProps & {
    authenticated: boolean;
    pending: boolean;
  };
  skland: DevelopmentSklandStatusCenterProps | null;
}

export const WorkbenchContext = createContext<WorkbenchContextValue | null>(null);

export function useWorkbench(): WorkbenchContextValue {
  const value = useContext(WorkbenchContext);
  if (!value) throw new Error("工作台页面必须渲染在 WorkbenchApp 内。");
  return value;
}
