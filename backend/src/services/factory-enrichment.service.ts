import { pool } from "../config/postgres";
import { AffectedFactory } from "../types/query";

export class FactoryEnrichmentService {
  async enrich(factoryIds: string[]): Promise<AffectedFactory[]> {
    // Nếu graph query không tìm thấy factory nào thì bỏ qua bước join PostgreSQL.
    if (factoryIds.length === 0) {
      return [];
    }

    // Join relational metadata với JSONB document để kết quả query có đủ thông tin hiển thị.
    const result = await pool.query(
      `SELECT m.factory_id, m.factory_name, m.region, m.risk_score,
              COALESCE(jsonb_array_length(d.supply_chain_json->'products'), 0) AS document_product_count
       FROM factory_metadata m
       LEFT JOIN supply_chain_documents d ON d.factory_id = m.factory_id
       WHERE m.factory_id = ANY($1)
       ORDER BY m.factory_id`,
      [factoryIds]
    );
    return result.rows.map((row) => ({
      factoryId: row.factory_id,
      factoryName: row.factory_name,
      region: row.region,
      riskScore: Number(row.risk_score),
      documentProductCount: Number(row.document_product_count)
    }));
  }

  async detail(factoryId: string) {
    // Endpoint detail dùng để xem toàn bộ metadata và Supply_Chain_JSON gốc của một factory.
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
