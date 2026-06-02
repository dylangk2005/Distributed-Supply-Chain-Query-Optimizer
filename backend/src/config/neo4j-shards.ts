import neo4j, { Driver } from "neo4j-driver";
import { ShardConfig } from "../types/shard";

// Thông tin đăng nhập dùng chung cho cả 5 Neo4j shards.
const user = process.env.NEO4J_USER ?? "neo4j";
const password = process.env.NEO4J_PASSWORD ?? "password123";

// Danh sách 5 graph shards. Khi chạy Docker, URI lấy từ env; khi chạy local, dùng port 7681-7685.
export const shardConfigs: ShardConfig[] = [1, 2, 3, 4, 5].map((index) => ({
  id: `shard_${index}`,
  uri: process.env[`NEO4J_SHARD_${index}_URI`] ?? `bolt://localhost:768${index}`
}));

// Tạo sẵn Neo4j driver cho từng shard để QueryService có thể gọi theo shard_id.
export const shardDrivers: Record<string, Driver> = Object.fromEntries(
  shardConfigs.map((shard) => [shard.id, neo4j.driver(shard.uri, neo4j.auth.basic(user, password))])
);
