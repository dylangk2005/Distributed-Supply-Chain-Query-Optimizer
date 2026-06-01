import { shardDrivers } from "../config/neo4j-shards";
import { QueryRequest } from "../types/query";
import { ExecutionPlanService } from "./execution-plan.service";
import { FactoryEnrichmentService } from "./factory-enrichment.service";
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
  private plans = new ExecutionPlanService();

  async run(request: QueryRequest) {
    const started = Date.now();
    const queryId = `Q_${Date.now()}`;
    const route = await this.router.route(request.partitionMode, request.queryMode, request.materialName);
    const factoryIds = new Set<string>();
    const bfsCounts: Record<string, number> = { RawMaterial: 0, Component: 0, Part: 0, Product: 0, Factory: 0 };

    for (const shardId of route.visitedShards) {
      const driver = shardDrivers[shardId];
      const session = driver.session();
      try {
        const params = { materialName: request.materialName, partitionMode: request.partitionMode };
        const factories = await session.run(FACTORY_QUERY, params);
        factories.records.forEach((record) => factoryIds.add(record.get("factoryId")));
        const bfs = await session.run(BFS_QUERY, params);
        if (bfs.records[0]) {
          for (const key of Object.keys(bfsCounts)) {
            bfsCounts[key] += numberValue(bfs.records[0].get(key));
          }
        }
      } finally {
        await session.close();
      }
    }

    const affectedFactories = await this.enrichment.enrich([...factoryIds]);
    const executionTimeMs = Date.now() - started;
    const estimatedDistributedCostMs = executionTimeMs + route.visitedShards.length * 60;
    const cypherParams = { materialName: request.materialName, partitionMode: request.partitionMode };
    const executionPlan = this.plans.build({
      queryId,
      partitionMode: request.partitionMode,
      queryMode: request.queryMode,
      materialName: request.materialName,
      visitedShards: route.visitedShards,
      prunedShards: route.prunedShards,
      bfsCounts,
      cypherQuery: FACTORY_QUERY.trim(),
      cypherParams,
      directoryQuery: request.queryMode === "OPTIMIZED" ? DIRECTORY_QUERY.trim() : undefined,
      directoryParams: request.queryMode === "OPTIMIZED" ? { partitionMode: request.partitionMode, materialName: request.materialName } : undefined,
      reason: route.reason
    });
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
        affectedFactoryCount: affectedFactories.length
      }
    };
  }
}
