import { Router } from "express";
import { BenchmarkService } from "../services/benchmark.service";

export const benchmarkRoute = Router();
const service = new BenchmarkService();

// POST /api/benchmark/run: chạy bộ benchmark cố định cho RANDOM/METIS và NAIVE/OPTIMIZED.
benchmarkRoute.post("/run", async (_req, res, next) => {
  try {
    res.json(await service.run());
  } catch (error) {
    next(error);
  }
});

// GET /api/benchmark: đọc các query logs gần nhất để dashboard hiển thị lại kết quả.
benchmarkRoute.get("/", async (_req, res, next) => {
  try {
    res.json(await service.list());
  } catch (error) {
    next(error);
  }
});
