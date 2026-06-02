import { Router } from "express";
import { z } from "zod";
import { QueryService } from "../services/query.service";

// Validate request từ Query Lab: user phải chọn material, partition strategy và query mode.
const schema = z.object({
  materialName: z.string().min(1),
  partitionMode: z.enum(["RANDOM", "METIS"]),
  queryMode: z.enum(["NAIVE", "OPTIMIZED"])
});

export const queryRoute = Router();
const service = new QueryService();

// POST /api/query: endpoint chính để chạy distributed Cypher query và trả execution plan.
queryRoute.post("/", async (req, res, next) => {
  try {
    const input = schema.parse(req.body);
    res.json(await service.run(input));
  } catch (error) {
    next(error);
  }
});
