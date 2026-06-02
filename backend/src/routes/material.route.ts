import { Router } from "express";
import { z } from "zod";
import { MaterialService } from "../services/material.service";

export const materialRoute = Router();
export const materialDirectoryRoute = Router();
const service = new MaterialService();

materialRoute.get("/", async (_req, res, next) => {
  try {
    res.json(await service.listMaterials());
  } catch (error) {
    next(error);
  }
});

materialDirectoryRoute.get("/", async (req, res, next) => {
  try {
    const query = z.object({ partitionMode: z.enum(["RANDOM", "METIS"]).default("METIS") }).parse(req.query);
    res.json(await service.directory(query.partitionMode));
  } catch (error) {
    next(error);
  }
});
