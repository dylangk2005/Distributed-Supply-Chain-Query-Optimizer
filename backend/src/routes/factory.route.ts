import { Router } from "express";
import { FactoryEnrichmentService } from "../services/factory-enrichment.service";

export const factoryRoute = Router();
const service = new FactoryEnrichmentService();

factoryRoute.get("/:factoryId", async (req, res, next) => {
  try {
    const detail = await service.detail(req.params.factoryId);
    if (!detail) {
      res.status(404).json({ message: "Factory not found" });
      return;
    }
    res.json({
      factoryId: detail.factory_id,
      factoryName: detail.factory_name,
      region: detail.region,
      country: detail.country,
      employeeCount: detail.employee_count,
      riskScore: Number(detail.risk_score),
      supplyChainJson: detail.supply_chain_json
    });
  } catch (error) {
    next(error);
  }
});

