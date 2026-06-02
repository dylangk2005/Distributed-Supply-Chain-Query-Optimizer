import { shardConfigs } from "../config/neo4j-shards";

const validShardIds = new Set(shardConfigs.map((shard) => shard.id));
const simulatedDownShards = new Set<string>();

function normalizeShardIds(shardIds: string[]) {
  return Array.from(new Set(shardIds)).filter((shardId) => validShardIds.has(shardId));
}

export class FailureService {
  list() {
    return Array.from(simulatedDownShards).sort();
  }

  down(shardIds: string[]) {
    for (const shardId of normalizeShardIds(shardIds)) {
      simulatedDownShards.add(shardId);
    }
    return this.list();
  }

  up(shardIds: string[]) {
    for (const shardId of normalizeShardIds(shardIds)) {
      simulatedDownShards.delete(shardId);
    }
    return this.list();
  }

  recoverAll() {
    simulatedDownShards.clear();
    return this.list();
  }

  isDown(shardId: string) {
    return simulatedDownShards.has(shardId);
  }
}
