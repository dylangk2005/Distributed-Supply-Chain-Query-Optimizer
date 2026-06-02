import { Router } from "express";
import { z } from "zod";
import { FailureService } from "../services/failure.service";

const shardListSchema = z.object({
  shardIds: z.array(z.string()).default([])
});

export const failureRoute = Router();
const service = new FailureService();

failureRoute.get("/", (_req, res) => {
  res.json({ downShards: service.list() });
});

failureRoute.post("/down", (req, res, next) => {
  try {
    const input = shardListSchema.parse(req.body);
    res.json({ downShards: service.down(input.shardIds) });
  } catch (error) {
    next(error);
  }
});

failureRoute.post("/up", (req, res, next) => {
  try {
    const input = shardListSchema.parse(req.body);
    res.json({ downShards: service.up(input.shardIds) });
  } catch (error) {
    next(error);
  }
});

failureRoute.post("/recover-all", (_req, res) => {
  res.json({ downShards: service.recoverAll() });
});
