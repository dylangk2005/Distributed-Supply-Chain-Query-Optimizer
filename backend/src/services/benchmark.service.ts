import { pool } from "../config/postgres";
import { QueryService } from "./query.service";
import { WarmupService } from "./warmup.service";

export class BenchmarkService {
  private queryService = new QueryService();
  private warmupService = new WarmupService();

  async run() {
    // Benchmark luôn warmup trước để kết quả không bị ảnh hưởng quá nhiều bởi cold-start.
    await this.warmupService.run();

    // Chọn 3 materials đại diện: phổ biến, trung bình và hiếm để thấy khác biệt pruning.
    const materials = ["Steel", "Lithium", "Palladium"];

    // 4 tổ hợp dùng để so sánh partitioning và query routing.
    const combos = [
      { partitionMode: "RANDOM", queryMode: "NAIVE" },
      { partitionMode: "RANDOM", queryMode: "OPTIMIZED" },
      { partitionMode: "METIS", queryMode: "NAIVE" },
      { partitionMode: "METIS", queryMode: "OPTIMIZED" }
    ] as const;
    const results = [];

    // Chạy tuần tự từng case để benchmark table dễ đọc và log không bị lẫn.
    for (const materialName of materials) {
      for (const combo of combos) {
        const response = await this.queryService.run({ materialName, ...combo });
        results.push({
          materialName,
          partitionMode: combo.partitionMode,
          queryMode: combo.queryMode,
          executionTimeMs: response.metrics.executionTimeMs,
          estimatedDistributedCostMs: response.metrics.estimatedDistributedCostMs,
          visitedShardCount: response.metrics.visitedShardCount,
          prunedShardCount: response.metrics.prunedShardCount,
          affectedFactoryCount: response.metrics.affectedFactoryCount
        });
      }
    }
    return { materials, results };
  }

  async list() {
    // Đọc query_execution_logs mới nhất để frontend có dữ liệu ngay cả sau khi refresh page.
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
      estimatedDistributedCostMs: row.execution_time_ms + row.visited_shards.length * 60,
      createdAt: row.created_at
    }));
  }
}
