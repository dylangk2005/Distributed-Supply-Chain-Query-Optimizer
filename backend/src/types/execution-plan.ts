export interface BfsLevel {
  level: number;
  nodeType: string;
  count: number;
}

export interface ExecutionPlan {
  queryId: string;
  partitionMode: string;
  queryMode: string;
  materialName: string;
  steps: string[];
  visitedShards: string[];
  prunedShards: string[];
  bfsLevels: BfsLevel[];
  reason: string;
}

