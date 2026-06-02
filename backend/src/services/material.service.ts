import { pool } from "../config/postgres";
import { PartitionMode } from "../types/query";

export class MaterialService {
  async listMaterials() {
    const result = await pool.query(`
      SELECT material_id, material_name, partition_mode, jsonb_agg(shard_id ORDER BY shard_id) AS shards
      FROM (
        SELECT DISTINCT material_id, material_name, partition_mode, shard_id
        FROM material_directory
      ) rows
      GROUP BY material_id, material_name, partition_mode
      ORDER BY material_name, partition_mode
    `);

    const byMaterial = new Map<string, {
      materialId: string;
      materialName: string;
      randomShards: string[];
      metisShards: string[];
    }>();

    for (const row of result.rows) {
      const current = byMaterial.get(row.material_id) ?? {
        materialId: row.material_id,
        materialName: row.material_name,
        randomShards: [],
        metisShards: []
      };
      if (row.partition_mode === "RANDOM") {
        current.randomShards = row.shards ?? [];
      }
      if (row.partition_mode === "METIS") {
        current.metisShards = row.shards ?? [];
      }
      byMaterial.set(row.material_id, current);
    }

    return Array.from(byMaterial.values())
      .sort((left, right) => left.materialName.localeCompare(right.materialName))
      .map((material) => ({
        ...material,
        randomReplicaCount: material.randomShards.length,
        metisReplicaCount: material.metisShards.length
      }));
  }

  async directory(partitionMode: PartitionMode) {
    const result = await pool.query(
      `SELECT material_id, material_name, partition_mode, shard_id, factory_count, component_count
       FROM material_directory
       WHERE partition_mode = $1
       ORDER BY material_name, shard_id`,
      [partitionMode]
    );

    return result.rows.map((row) => ({
      materialId: row.material_id,
      materialName: row.material_name,
      partitionMode: row.partition_mode,
      shardId: row.shard_id,
      factoryCount: row.factory_count,
      componentCount: row.component_count
    }));
  }
}
