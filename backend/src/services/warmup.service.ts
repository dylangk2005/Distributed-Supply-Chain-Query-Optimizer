import { pool } from "../config/postgres";
import { shardConfigs, shardDrivers } from "../config/neo4j-shards";

const MATERIALS = ["Steel", "Lithium", "Palladium"];
const PARTITION_MODES = ["RANDOM", "METIS"] as const;

const WARMUP_TRAVERSAL_QUERY = `
MATCH (m:RawMaterial {name: $materialName, partitionMode: $partitionMode})
      <-[:USES]-(c:Component)
      <-[:HAS_COMPONENT]-(p:Part)
      <-[:CONTAINS]-(prd:Product)
      <-[:PRODUCES]-(f:Factory)
RETURN f.factoryId AS factoryId
LIMIT 1
`;

export class WarmupService {
  async run() {
    const started = Date.now();
    let neo4jQueries = 0;
    let directoryLookups = 0;

    // Warmup chỉ chạy một lần trước demo/benchmark để giảm cold-start của PostgreSQL và Neo4j.
    for (const partitionMode of PARTITION_MODES) {
      for (const materialName of MATERIALS) {
        // Prime material_directory lookup, dùng cho OPTIMIZED routing.
        await pool.query(
          `SELECT DISTINCT shard_id
           FROM material_directory
           WHERE partition_mode = $1
             AND lower(material_name) = lower($2)
           ORDER BY shard_id`,
          [partitionMode, materialName]
        );
        directoryLookups += 1;

        // Prime Bolt session, Cypher plan và index/cache page trên từng shard.
        for (const shard of shardConfigs) {
          const session = shardDrivers[shard.id].session();
          try {
            await session.run(WARMUP_TRAVERSAL_QUERY, { materialName, partitionMode });
            neo4jQueries += 1;
          } finally {
            await session.close();
          }
        }
      }
    }

    return {
      status: "done",
      materials: MATERIALS,
      partitionModes: PARTITION_MODES,
      shards: shardConfigs.map((shard) => shard.id),
      directoryLookups,
      neo4jQueries,
      elapsedMs: Date.now() - started
    };
  }
}
