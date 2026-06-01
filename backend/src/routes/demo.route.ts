import { Router } from "express";
import { z } from "zod";
import { demoService } from "../services/demo.service";

export const demoRoute = Router();

demoRoute.get("/status", (_req, res) => {
  res.json(demoService.getStatus());
});

demoRoute.post("/setup", async (_req, res, next) => {
  try {
    res.json(await demoService.setup());
  } catch (error) {
    next(error);
  }
});

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
    const body = z.object({ partitionMode: z.enum(["RANDOM", "METIS", "ALL"]) }).parse(req.body);
    res.json(await demoService.importNeo4j(body.partitionMode));
  } catch (error) {
    next(error);
  }
});

demoRoute.post("/warmup", async (_req, res, next) => {
  try {
    res.json(await demoService.warmup());
  } catch (error) {
    next(error);
  }
});

demoRoute.post("/sample-query", async (_req, res, next) => {
  try {
    res.json(await demoService.sampleQuery());
  } catch (error) {
    next(error);
  }
});

demoRoute.post("/reset", (_req, res, next) => {
  try {
    res.json(demoService.reset());
  } catch (error) {
    next(error);
  }
});
