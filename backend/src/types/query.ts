export type PartitionMode = "RANDOM" | "METIS";
export type QueryMode = "NAIVE" | "OPTIMIZED";

export interface QueryRequest {
  materialName: string;
  partitionMode: PartitionMode;
  queryMode: QueryMode;
}

export interface AffectedFactory {
  factoryId: string;
  factoryName: string;
  region: string;
  riskScore?: number;
  documentProductCount?: number;
}

