import { pool } from "../config/postgres";

export class TopologyService {
  async get() {
    const result = await pool.query("SELECT * FROM topology_metrics ORDER BY partition_mode");
    const payload: Record<string, unknown> = {};
    for (const row of result.rows) {
      payload[row.partition_mode.toLowerCase()] = {
        projectionNodes: row.projection_nodes,
        projectionEdges: row.projection_edges,
        crossShardEdges: row.cross_shard_edges,
        edgeCutRatio: Number(row.edge_cut_ratio),
        materialReplication: Number(row.material_replication),
        nodeCountByShard: row.node_count_by_shard,
        edgeCountByShard: row.edge_count_by_shard,
        expectedVisitedShardCountByMaterial: row.expected_visited_shard_count_by_material
      };
    }
    return payload;
  }
}

