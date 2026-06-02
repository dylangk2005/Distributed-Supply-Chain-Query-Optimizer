export type PartitionMode = "RANDOM" | "METIS";
export type QueryMode = "NAIVE" | "OPTIMIZED";

// Payload mà frontend gửi khi user bấm Run Query trong Query Lab.
export interface QueryRequest {
  materialName: string;
  partitionMode: PartitionMode;
  queryMode: QueryMode;
}

// Một factory bị ảnh hưởng sau khi graph traversal tìm được factoryId và backend enrich thêm metadata.
export interface AffectedFactory {
  factoryId: string;
  factoryName: string;
  region: string;
  riskScore?: number;
  documentProductCount?: number;
}

