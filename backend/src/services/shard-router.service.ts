import { pool } from "../config/postgres";
import { shardConfigs } from "../config/neo4j-shards";
import { PartitionMode, QueryMode } from "../types/query";

export class ShardRouterService {
  async route(partitionMode: PartitionMode, queryMode: QueryMode, materialName: string) {
    const allShards = shardConfigs.map((shard) => shard.id);
    if (queryMode === "NAIVE") {
      return { visitedShards: allShards, prunedShards: [], reason: "Naive mode broadcasts the query to all shards." };
    }

    const result = await pool.query(
      `SELECT DISTINCT shard_id FROM material_directory
       WHERE partition_mode = $1 AND lower(material_name) = lower($2)
       ORDER BY shard_id`,
      [partitionMode, materialName]
    );
    const visitedShards = result.rows.map((row) => row.shard_id);
    const prunedShards = allShards.filter((shard) => !visitedShards.includes(shard));
    return {
      visitedShards,
      prunedShards,
      reason: "Coordinator pruned shards using material_directory."
    };
  }
}

