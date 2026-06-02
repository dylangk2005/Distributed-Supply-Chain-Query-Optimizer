import { Router } from "express";
import { z } from "zod";
import { demoService } from "../services/demo.service";

export const demoRoute = Router();

// GET /api/demo/status: frontend poll endpoint này để biết step nào đang chạy/done/failed.
demoRoute.get("/status", (_req, res) => {
  res.json(demoService.getStatus());
});

// POST /api/demo/setup: chạy toàn bộ pipeline demo từ generate data đến sample query.
demoRoute.post("/setup", async (_req, res, next) => {
  try {
    res.json(await demoService.setup());
  } catch (error) {
    next(error);
  }
});

// Các endpoint bên dưới cho phép dashboard chạy từng bước Prepare Data độc lập.
demoRoute.post("/generate", async (_req, res, next) => {
  try {
    res.json(await demoService.generateDataset());
  } catch (error) {
    next(error);
  }
});

demoRoute.post("/partition", async (_req, res, next) => {
  try {
    res.json(await demoService.partitionGraph());
  } catch (error) {
    next(error);
  }
});

demoRoute.post("/build-directory", async (_req, res, next) => {
  try {
    res.json(await demoService.buildMaterialDirectory());
  } catch (error) {
    next(error);
  }
});

demoRoute.post("/import-postgres", async (_req, res, next) => {
  try {
    res.json(await demoService.importPostgres());
  } catch (error) {
    next(error);
  }
});

demoRoute.post("/import-neo4j", async (req, res, next) => {
  try {
    // Cho phép import RANDOM, METIS hoặc cả hai graph modes vào Neo4j shards.
    const body = z.object({ partitionMode: z.enum(["RANDOM", "METIS", "ALL"]) }).parse(req.body);
    res.json(await demoService.importNeo4j(body.partitionMode));
  } catch (error) {
    next(error);
  }
});

// Warmup giúp giảm cold-start trước query đầu tiên hoặc benchmark.
demoRoute.post("/warmup", async (_req, res, next) => {
  try {
    res.json(await demoService.warmup());
  } catch (error) {
    next(error);
  }
});

// Sample query dùng Palladium/METIS/OPTIMIZED để demo pruning rõ nhất.
demoRoute.post("/sample-query", async (_req, res, next) => {
  try {
    res.json(await demoService.sampleQuery());
  } catch (error) {
    next(error);
  }
});

// Reset chỉ reset trạng thái UI/demo logs, không xóa database.
demoRoute.post("/reset", (_req, res, next) => {
  try {
    res.json(demoService.reset());
  } catch (error) {
    next(error);
  }
});
