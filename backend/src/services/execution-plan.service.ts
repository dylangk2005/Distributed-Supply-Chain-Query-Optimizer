import { pool } from "../config/postgres";
import { ExecutionPlan } from "../types/execution-plan";

export class ExecutionPlanService {
  build(input: {
    queryId: string;
    partitionMode: string;
    queryMode: string;
    materialName: string;
    visitedShards: string[];
    prunedShards: string[];
    bfsCounts: Record<string, number>;
    reason: string;
  }): ExecutionPlan {
    const names = ["RawMaterial", "Component", "Part", "Product", "Factory"];
    return {
      queryId: input.queryId,
      partitionMode: input.partitionMode,
      queryMode: input.queryMode,
      materialName: input.materialName,
      steps: [
        "Coordinator: material_directory lookup",
        "Coordinator: shard pruning",
        "Graph: distributed BFS traversal in visited Neo4j shards",
        "Relational: join factory_metadata in PostgreSQL",
        "Document: lookup supply_chain_documents JSON"
      ],
      visitedShards: input.visitedShards,
      prunedShards: input.prunedShards,
      bfsLevels: names.map((nodeType, level) => ({
        level,
        nodeType,
        count: input.bfsCounts[nodeType] ?? 0
      })),
      reason: input.reason
    };
  }

  async persist(input: {
    queryId: string;
    partitionMode: string;
    queryMode: string;
    materialName: string;
    visitedShards: string[];
    prunedShards: string[];
    affectedFactoryCount: number;
    executionTimeMs: number;
    executionPlan: ExecutionPlan;
  }) {
    await pool.query(
      `INSERT INTO query_execution_logs
       (query_id, partition_mode, query_mode, material_name, visited_shards, pruned_shards,
        affected_factory_count, execution_time_ms, execution_plan)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        input.queryId,
        input.partitionMode,
        input.queryMode,
        input.materialName,
        JSON.stringify(input.visitedShards),
        JSON.stringify(input.prunedShards),
        input.affectedFactoryCount,
        input.executionTimeMs,
        JSON.stringify(input.executionPlan)
      ]
    );
  }
}
