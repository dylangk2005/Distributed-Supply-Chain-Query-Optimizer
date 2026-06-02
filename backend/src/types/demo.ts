export type DemoStepStatus = "pending" | "running" | "done" | "failed";
export type DemoStatus = "idle" | "running" | "ready" | "failed";

export interface DemoStep {
  name: string;
  status: DemoStepStatus;
  summary: string;
}

export interface DemoState {
  status: DemoStatus;
  activeStep: string | null;
  activePartitionMode: "RANDOM" | "METIS" | "BOTH" | null;
  steps: DemoStep[];
  logs: string[];
  lastError?: string;
}
