import cors from "cors";
import express from "express";
import { ZodError } from "zod";
import { benchmarkRoute } from "./routes/benchmark.route";
import { factoryRoute } from "./routes/factory.route";
import { queryRoute } from "./routes/query.route";
import { topologyRoute } from "./routes/topology.route";

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "supply-chain-map-backend" });
});

app.use("/api/query", queryRoute);
app.use("/api/topology", topologyRoute);
app.use("/api/benchmark", benchmarkRoute);
app.use("/api/factories", factoryRoute);

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof ZodError) {
    res.status(400).json({ message: "Invalid request", issues: error.issues });
    return;
  }
  const message = error instanceof Error ? error.message : "Internal server error";
  res.status(500).json({ message });
});

const port = Number(process.env.PORT ?? 8080);
app.listen(port, () => {
  console.log(`Backend listening on ${port}`);
});

