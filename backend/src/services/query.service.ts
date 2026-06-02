import { shardDrivers } from "../config/neo4j-shards";
import { QueryRequest } from "../types/query";
import { ExecutionPlanService } from "./execution-plan.service";
import { FactoryEnrichmentService } from "./factory-enrichment.service";
import { FailureService } from "./failure.service";
import { ShardRouterService } from "./shard-router.service";

const FACTORY_QUERY = `
MATCH (m:RawMaterial {name: $materialName, partitionMode: $partitionMode})
      <-[:USES]-(c:Component)
      <-[:HAS_COMPONENT]-(p:Part)
      <-[:CONTAINS]-(prd:Product)
      <-[:PRODUCES]-(f:Factory)
RETURN DISTINCT f.factoryId AS factoryId
`;

const BFS_QUERY = `
MATCH (m:RawMaterial {name: $materialName, partitionMode: $partitionMode})
OPTIONAL MATCH (m)<-[:USES]-(c:Component)
OPTIONAL MATCH (c)<-[:HAS_COMPONENT]-(p:Part)
OPTIONAL MATCH (p)<-[:CONTAINS]-(prd:Product)
OPTIONAL MATCH (prd)<-[:PRODUCES]-(f:Factory)
RETURN count(DISTINCT m) AS RawMaterial,
       count(DISTINCT c) AS Component,
       count(DISTINCT p) AS Part,
       count(DISTINCT prd) AS Product,
       count(DISTINCT f) AS Factory
`;

const DIRECTORY_QUERY = `
SELECT DISTINCT shard_id
FROM material_directory
WHERE partition_mode = $1
  AND lower(material_name) = lower($2)
ORDER BY shard_id
`;

function numberValue(value: unknown): number {
  if (typeof value === "number") return value;
  if (value && typeof value === "object" && "toNumber" in value && typeof value.toNumber === "function") {
    return value.toNumber();
  }
  return Number(value ?? 0);
}

export class QueryService {
  private router = new ShardRouterService();
  private enrichment = new FactoryEnrichmentService();
  private failure = new FailureService();
  private plans = new ExecutionPlanService();

  async run(request: QueryRequest) {
    const started = Date.now();
    const queryId = `Q_${Date.now()}`;

    // 1. Coordinator chọn shards cần query. NAIVE sẽ broadcast, OPTIMIZED sẽ prune bằng material_directory.
    const route = await this.router.route(request.partitionMode, request.queryMode, request.materialName);
    const factoryIds = new Set<string>();
    const bfsCounts: Record<string, number> = { RawMaterial: 0, Component: 0, Part: 0, Product: 0, Factory: 0 };
    const failedShards: Array<{ shardId: string; error: string }> = [];

    // 2. Chạy các shard song song. allSettled giúp execution plan ghi nhận shard bị lỗi
    // thay vì làm toàn bộ distributed query biến mất trong một lỗi chung.
    const shardResults = await Promise.allSettled(route.visitedShards.map((shardId) => this.queryShard(shardId, request)));
    for (const [index, result] of shardResults.entries()) {
      const shardId = route.visitedShards[index];
      if (result.status === "fulfilled") {
        result.value.factoryIds.forEach((factoryId) => factoryIds.add(factoryId));
        for (const key of Object.keys(bfsCounts)) {
          bfsCounts[key] += result.value.bfsCounts[key] ?? 0;
        }
      } else {
        failedShards.push({
          shardId,
          error: result.reason instanceof Error ? result.reason.message : String(result.reason)
        });
      }
    }

    // 3. Sau khi lấy factoryId từ graph, enrich bằng PostgreSQL metadata và JSONB document.
    const affectedFactories = await this.enrichment.enrich([...factoryIds]);
    const executionTimeMs = Date.now() - started;
    const estimatedDistributedCostMs = executionTimeMs + route.visitedShards.length * 60;
    const cypherParams = { materialName: request.materialName, partitionMode: request.partitionMode };

    // 4. Execution plan là deliverable chính: visited/pruned shards, BFS levels, query text và join steps.
    const executionPlan = this.plans.build({
      queryId,
      partitionMode: request.partitionMode,
      queryMode: request.queryMode,
      materialName: request.materialName,
      visitedShards: route.visitedShards,
      prunedShards: route.prunedShards,
      failedShards,
      bfsCounts,
      cypherQuery: FACTORY_QUERY.trim(),
      cypherParams,
      directoryQuery: request.queryMode === "OPTIMIZED" ? DIRECTORY_QUERY.trim() : undefined,
      directoryParams: request.queryMode === "OPTIMIZED" ? { partitionMode: request.partitionMode, materialName: request.materialName } : undefined,
      reason: route.reason
    });

    // 5. Lưu log để benchmark page có thể đọc lại những lần query gần nhất.
    await this.plans.persist({
      queryId,
      partitionMode: request.partitionMode,
      queryMode: request.queryMode,
      materialName: request.materialName,
      visitedShards: route.visitedShards,
      prunedShards: route.prunedShards,
      affectedFactoryCount: affectedFactories.length,
      executionTimeMs,
      executionPlan
    });

    return {
      queryId,
      materialName: request.materialName,
      partitionMode: request.partitionMode,
      queryMode: request.queryMode,
      affectedFactories,
      executionPlan,
      metrics: {
        executionTimeMs,
        estimatedDistributedCostMs,
        visitedShardCount: route.visitedShards.length,
        prunedShardCount: route.prunedShards.length,
        failedShardCount: failedShards.length,
        affectedFactoryCount: affectedFactories.length
      }
    };
  }

  private async queryShard(shardId: string, request: QueryRequest) {
    // Mỗi shard tự chạy local Cypher traversal. Backend chỉ merge kết quả sau khi shard trả về.
    if (this.failure.isDown(shardId)) {
      throw new Error("Simulated shard failure");
    }

    const session = shardDrivers[shardId].session();
    const params = { materialName: request.materialName, partitionMode: request.partitionMode };
    const bfsCounts: Record<string, number> = { RawMaterial: 0, Component: 0, Part: 0, Product: 0, Factory: 0 };

    try {
      // Query chính lấy factoryId bị ảnh hưởng bởi material shortage.
      const factories = await session.run(FACTORY_QUERY, params);
      const factoryIds = factories.records.map((record) => String(record.get("factoryId")));

      // Query phụ đếm số node ở từng level để frontend hiển thị BFS-style metrics.
      const bfs = await session.run(BFS_QUERY, params);
      if (bfs.records[0]) {
        for (const key of Object.keys(bfsCounts)) {
          bfsCounts[key] = numberValue(bfs.records[0].get(key));
        }
      }

      return { factoryIds, bfsCounts };
    } finally {
      await session.close();
    }
  }
}
