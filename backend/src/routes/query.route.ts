import { Router } from "express";
import { z } from "zod";
import { QueryService } from "../services/query.service";

const schema = z.object({
  materialName: z.string().min(1),
  partitionMode: z.enum(["RANDOM", "METIS"]),
  queryMode: z.enum(["NAIVE", "OPTIMIZED"])
});

export const queryRoute = Router();
const service = new QueryService();

queryRoute.post("/", async (req, res, next) => {
  try {
    const input = schema.parse(req.body);
    res.json(await service.run(input));
  } catch (error) {
    next(error);
  }
});

