export type DemoStepStatus = "pending" | "running" | "done" | "failed";
export type DemoStatus = "idle" | "running" | "ready" | "failed";

// Một step trong Prepare Data pipeline trên dashboard.
export interface DemoStep {
  name: string;
  status: DemoStepStatus;
  summary: string;
}

// State tổng thể mà frontend poll từ /api/demo/status để cập nhật UI.
export interface DemoState {
  status: DemoStatus;
  activeStep: string | null;
  activePartitionMode: "RANDOM" | "METIS" | "BOTH" | null;
  steps: DemoStep[];
  logs: string[];
  lastError?: string;
}
