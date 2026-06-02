import cors from "cors";
import express from "express";
import { ZodError } from "zod";
import { benchmarkRoute } from "./routes/benchmark.route";
import { demoRoute } from "./routes/demo.route";
import { factoryRoute } from "./routes/factory.route";
import { failureRoute } from "./routes/failure.route";
import { materialDirectoryRoute, materialRoute } from "./routes/material.route";
import { queryRoute } from "./routes/query.route";
import { topologyRoute } from "./routes/topology.route";

// Entry point của backend coordinator.
// File này cấu hình Express, gắn các API route và xử lý lỗi chung cho toàn hệ thống.
const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

// Health check đơn giản để biết backend container/service đã sẵn sàng.
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "supply-chain-map-backend" });
});

// Các nhóm API chính của dự án: query optimizer, material directory, topology, benchmark và demo pipeline.
app.use("/api/query", queryRoute);
app.use("/api/materials", materialRoute);
app.use("/api/material-directory", materialDirectoryRoute);
app.use("/api/topology", topologyRoute);
app.use("/api/benchmark", benchmarkRoute);
app.use("/api/factories", factoryRoute);
app.use("/api/failure", failureRoute);
app.use("/api/demo", demoRoute);

// Middleware xử lý lỗi tập trung để route/service chỉ cần throw error.
app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const statusCode = typeof error === "object" && error && "statusCode" in error ? Number(error.statusCode) : undefined;
  if (error instanceof ZodError) {
    res.status(400).json({ message: "Invalid request", issues: error.issues });
    return;
  }
  const message = error instanceof Error ? error.message : "Internal server error";
  res.status(statusCode ?? 500).json({ message });
});

const port = Number(process.env.PORT ?? 8080);
app.listen(port, () => {
  console.log(`Backend listening on ${port}`);
});
