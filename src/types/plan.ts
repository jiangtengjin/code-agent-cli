export type PlanStepStatus = "pending" | "running" | "done" | "failed";

export interface PlanStep {
  title: string;
  prompt: string;
  status: PlanStepStatus;
  error?: string;
}

export interface PlanState {
  originalTask: string;
  summary: string;
  steps: PlanStep[];
}
