import { pool } from "../config/postgres";

export class TopologyService {
  async get() {
    // Đọc topology_metrics đã được partitioner tính trước và import vào PostgreSQL.
    const result = await pool.query("SELECT * FROM topology_metrics ORDER BY partition_mode");
    const payload: Record<string, unknown> = {};

    // Chuẩn hóa key thành random/metis để frontend truy cập trực tiếp.
    for (const row of result.rows) {
      payload[row.partition_mode.toLowerCase()] = {
        projectionNodes: row.projection_nodes,
        projectionEdges: row.projection_edges,
        crossShardEdges: row.cross_shard_edges,
        edgeCutRatio: Number(row.edge_cut_ratio),
        materialReplication: Number(row.material_replication),
        averageVisitedShardCountByMaterial: Number(row.average_visited_shard_count_by_material ?? 0),
        nodeCountByShard: row.node_count_by_shard,
        edgeCountByShard: row.edge_count_by_shard,
        clusterDensityByShard: row.cluster_density_by_shard,
        expectedVisitedShardCountByMaterial: row.expected_visited_shard_count_by_material
      };
    }
    return payload;
  }
}
