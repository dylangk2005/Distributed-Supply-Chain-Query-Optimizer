import { pool } from "../config/postgres";
import { QueryService } from "./query.service";

export class BenchmarkService {
  private queryService = new QueryService();

  async run() {
    const materials = ["Steel", "Lithium", "Palladium"];
    const results = [];
    for (const materialName of materials) {
      const random = await this.queryService.run({ materialName, partitionMode: "RANDOM", queryMode: "NAIVE" });
      const metis = await this.queryService.run({ materialName, partitionMode: "METIS", queryMode: "OPTIMIZED" });
      results.push({
        materialName,
        randomNaiveTimeMs: random.metrics.executionTimeMs,
        metisOptimizedTimeMs: metis.metrics.executionTimeMs,
        randomVisitedShards: random.metrics.visitedShardCount,
        metisVisitedShards: metis.metrics.visitedShardCount,
        affectedFactoryCount: metis.metrics.affectedFactoryCount
      });
    }
    return { materials, results };
  }

  async list() {
    const result = await pool.query(`
      SELECT query_id, partition_mode, query_mode, material_name, visited_shards,
             pruned_shards, affected_factory_count, execution_time_ms, created_at
      FROM query_execution_logs
      ORDER BY created_at DESC
      LIMIT 50
    `);
    return result.rows.map((row) => ({
      queryId: row.query_id,
      partitionMode: row.partition_mode,
      queryMode: row.query_mode,
      materialName: row.material_name,
      visitedShards: row.visited_shards,
      prunedShards: row.pruned_shards,
      affectedFactoryCount: row.affected_factory_count,
      executionTimeMs: row.execution_time_ms,
      createdAt: row.created_at
    }));
  }
}

