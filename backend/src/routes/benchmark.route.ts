import { Router } from "express";
import { BenchmarkService } from "../services/benchmark.service";

export const benchmarkRoute = Router();
const service = new BenchmarkService();

benchmarkRoute.post("/run", async (_req, res, next) => {
  try {
    res.json(await service.run());
  } catch (error) {
    next(error);
  }
});

benchmarkRoute.get("/", async (_req, res, next) => {
  try {
    res.json(await service.list());
  } catch (error) {
    next(error);
  }
});

