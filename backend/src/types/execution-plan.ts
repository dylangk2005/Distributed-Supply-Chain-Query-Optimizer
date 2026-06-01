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
  cypherQuery: string;
  cypherParams: Record<string, string>;
  directoryQuery?: string;
  directoryParams?: Record<string, string>;
  reason: string;
}
