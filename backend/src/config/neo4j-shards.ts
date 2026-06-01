import neo4j, { Driver } from "neo4j-driver";
import { ShardConfig } from "../types/shard";

const user = process.env.NEO4J_USER ?? "neo4j";
const password = process.env.NEO4J_PASSWORD ?? "password123";

export const shardConfigs: ShardConfig[] = [1, 2, 3, 4, 5].map((index) => ({
  id: `shard_${index}`,
  uri: process.env[`NEO4J_SHARD_${index}_URI`] ?? `bolt://localhost:768${index}`
}));

export const shardDrivers: Record<string, Driver> = Object.fromEntries(
  shardConfigs.map((shard) => [shard.id, neo4j.driver(shard.uri, neo4j.auth.basic(user, password))])
);

