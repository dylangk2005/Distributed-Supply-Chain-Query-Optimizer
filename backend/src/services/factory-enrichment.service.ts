import { pool } from "../config/postgres";
import { AffectedFactory } from "../types/query";

export class FactoryEnrichmentService {
  async enrich(factoryIds: string[]): Promise<AffectedFactory[]> {
    if (factoryIds.length === 0) {
      return [];
    }
    const result = await pool.query(
      `SELECT factory_id, factory_name, region, risk_score
       FROM factory_metadata
       WHERE factory_id = ANY($1)
       ORDER BY factory_id`,
      [factoryIds]
    );
    return result.rows.map((row) => ({
      factoryId: row.factory_id,
      factoryName: row.factory_name,
      region: row.region,
      riskScore: Number(row.risk_score)
    }));
  }

  async detail(factoryId: string) {
    const result = await pool.query(
      `SELECT m.*, d.supply_chain_json
       FROM factory_metadata m
       LEFT JOIN supply_chain_documents d ON d.factory_id = m.factory_id
       WHERE m.factory_id = $1`,
      [factoryId]
    );
    return result.rows[0] ?? null;
  }
}

