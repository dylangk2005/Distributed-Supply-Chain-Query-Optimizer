// Cấu hình một Neo4j shard mà backend coordinator có thể kết nối.
export interface ShardConfig {
  id: string;
  uri: string;
}
