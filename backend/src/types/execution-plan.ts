export interface BfsLevel {
  // level 0..4 tương ứng RawMaterial -> Component -> Part -> Product -> Factory.
  level: number;
  nodeType: string;
  count: number;
}

// Object giải thích toàn bộ quá trình query để frontend hiển thị ở Execution Plan.
export interface ExecutionPlan {
  queryId: string;
  partitionMode: string;
  queryMode: string;
  materialName: string;
  steps: string[];
  visitedShards: string[];
  prunedShards: string[];
  failedShards: Array<{ shardId: string; error: string }>;
  partialResult: boolean;
  bfsLevels: BfsLevel[];
  cypherQuery: string;
  cypherParams: Record<string, string>;
  directoryQuery?: string;
  directoryParams?: Record<string, string>;
  reason: string;
}
