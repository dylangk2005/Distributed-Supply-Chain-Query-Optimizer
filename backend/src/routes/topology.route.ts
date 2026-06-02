import { Router } from "express";
import { TopologyService } from "../services/topology.service";

export const topologyRoute = Router();
const service = new TopologyService();

// GET /api/topology: trả metrics so sánh chất lượng partition RANDOM vs METIS.
topologyRoute.get("/", async (_req, res, next) => {
  try {
    res.json(await service.get());
  } catch (error) {
    next(error);
  }
});
