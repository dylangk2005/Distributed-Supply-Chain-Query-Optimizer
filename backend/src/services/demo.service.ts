import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { QueryService } from "./query.service";
import { DemoState, DemoStep } from "../types/demo";
import { WarmupService } from "./warmup.service";

const ROOT = process.cwd();
const MAX_LOGS = 240;
const PYTHON = process.platform === "win32" ? "python" : "python3";

const initialSteps: DemoStep[] = [
  { name: "Generate Dataset", status: "pending", summary: "Create 1000 factories and 5-level supply chains." },
  { name: "Partition Graph", status: "pending", summary: "Build RANDOM and METIS factory-subgraph partitions." },
  { name: "Build Material Directory", status: "pending", summary: "Map materials to shards for pruning." },
  { name: "Import PostgreSQL", status: "pending", summary: "Load metadata, documents, material directory, and topology metrics." },
  { name: "Import Neo4j", status: "pending", summary: "Load RANDOM and METIS graph data into 5 Neo4j shards." },
  { name: "Warm Up Query Engine", status: "pending", summary: "Prime Neo4j connections, query plans, and cache before demo queries." },
  { name: "Run Demo Query", status: "pending", summary: "Run Palladium / METIS / OPTIMIZED." },
  { name: "Review Benchmark", status: "pending", summary: "Benchmark is ready after setup." },
  { name: "Review Topology", status: "pending", summary: "Topology metrics are ready after setup." }
];

class DemoService {
  // State này chỉ phục vụ UI demo: step nào đang chạy, log gần nhất, lỗi gần nhất.
  private state: DemoState = {
    status: "idle",
    activeStep: null,
    activePartitionMode: null,
    steps: initialSteps.map((step) => ({ ...step })),
    logs: []
  };

  private running = false;
  private query = new QueryService();
  private warmupService = new WarmupService();

  getStatus(): DemoState {
    // Trả bản copy để route không vô tình mutate state nội bộ.
    return {
      ...this.state,
      steps: this.state.steps.map((step) => ({ ...step })),
      logs: [...this.state.logs]
    };
  }

  reset() {
    // Reset trạng thái demo trên UI, không xóa dữ liệu PostgreSQL/Neo4j.
    if (this.running) {
      const error = new Error("A demo job is already running.");
      (error as Error & { statusCode?: number }).statusCode = 409;
      throw error;
    }
    this.state = {
      status: "idle",
      activeStep: null,
      activePartitionMode: null,
      steps: initialSteps.map((step) => ({ ...step })),
      logs: []
    };
    return this.getStatus();
  }

  async setup() {
    // Chạy full pipeline bất đồng bộ để frontend có thể poll status trong lúc job chạy.
    this.ensureIdle();
    this.running = true;
    this.state.status = "running";
    this.state.logs = [];
    this.state.lastError = undefined;
    this.state.steps = initialSteps.map((step) => ({ ...step, status: "pending" }));

    this.runSetup().catch((error: unknown) => {
      this.state.status = "failed";
      this.state.lastError = error instanceof Error ? error.message : "Demo setup failed.";
      this.log(`FAILED: ${this.state.lastError}`);
    }).finally(() => {
      this.running = false;
      this.state.activeStep = null;
    });

    return this.getStatus();
  }

  async importNeo4j(mode: "RANDOM" | "METIS" | "ALL") {
    // Import graph data vào Neo4j theo mode được chọn.
    await this.runExclusive(() => this.importNeo4jStep(mode));
    return this.getStatus();
  }

  async generateDataset() {
    // Chạy generator để tạo nodes/edges/documents.
    await this.runExclusive(() => this.generateDatasetStep());
    return this.getStatus();
  }

  async partitionGraph() {
    // Chạy cả RANDOM và METIS partitioners.
    await this.runExclusive(() => this.partitionGraphStep());
    return this.getStatus();
  }

  async buildMaterialDirectory() {
    // Build Material Directory và topology metrics từ partition output.
    await this.runExclusive(() => this.buildMaterialDirectoryStep());
    return this.getStatus();
  }

  async importPostgres() {
    // Import metadata, JSONB documents, directory và topology vào PostgreSQL.
    await this.runExclusive(() => this.importPostgresStep());
    return this.getStatus();
  }

  async warmup() {
    // Warm up query engine để query đầu tiên ổn định hơn.
    await this.runExclusive(() => this.warmupStep());
    return this.getStatus();
  }

  async importNeo4jStep(mode: "RANDOM" | "METIS" | "ALL") {
    // Step thực thi thật cho Import Neo4j, dùng được cả trong full setup và nút riêng.
    this.setStep("Import Neo4j", "running", `Importing ${mode === "ALL" ? "RANDOM + METIS" : mode} graph into 5 Neo4j shards.`);
    await this.runCommand(PYTHON, ["importer/import_to_neo4j.py"], { PARTITION_MODE: mode });
    this.state.activePartitionMode = mode === "ALL" ? "BOTH" : mode;
    this.setStep("Import Neo4j", "done", `${mode === "ALL" ? "RANDOM + METIS are" : `${mode} is`} active in Neo4j.`);
    this.state.status = "ready";
  }

  async sampleQuery() {
    // Query mẫu dùng Palladium/METIS/OPTIMIZED vì thường prune rõ nhất.
    const result = await this.query.run({ materialName: "Palladium", partitionMode: "METIS", queryMode: "OPTIMIZED" });
    this.setStep("Run Demo Query", "done", `Palladium visited ${result.metrics.visitedShardCount} shard(s) and pruned ${result.metrics.prunedShardCount}.`);
    return result;
  }

  private async runExclusive(action: () => Promise<void>) {
    // Đảm bảo không có hai job prepare data chạy đồng thời gây race condition trên output/database.
    this.ensureIdle();
    this.running = true;
    this.state.status = "running";
    this.state.lastError = undefined;
    try {
      await action();
    } catch (error) {
      this.state.status = "failed";
      this.state.lastError = error instanceof Error ? error.message : "Demo step failed.";
      if (this.state.activeStep) {
        this.setStep(this.state.activeStep, "failed", this.state.lastError);
      }
      throw error;
    } finally {
      this.running = false;
      this.state.activeStep = null;
    }
  }

  private async runSetup() {
    // Full setup dùng cho demo nhanh: tạo data -> partition -> import -> warmup -> sample query.
    await this.generateDatasetStep();
    await this.partitionGraphStep();
    await this.buildMaterialDirectoryStep();
    await this.importPostgresStep();
    await this.importNeo4jStep("ALL");
    await this.warmupStep();

    const sample = await this.sampleQuery();
    this.setStep("Review Benchmark", "done", "Benchmark can run the prepared scenarios.");
    this.setStep("Review Topology", "done", `METIS sample pruned ${sample.metrics.prunedShardCount} shard(s).`);
    this.state.status = "ready";
  }

  private async generateDatasetStep() {
    // Gọi Python generator và đọc lại số factory sinh ra để cập nhật summary.
    this.setStep("Generate Dataset", "running", "Generating 1000 factories.");
    await this.runCommand(PYTHON, ["generator/generate_dataset.py"]);
    const docsPath = path.join(ROOT, "generator", "output", "supply_chain_documents.json");
    const factoryCount = fs.existsSync(docsPath) ? JSON.parse(fs.readFileSync(docsPath, "utf-8")).length : 0;
    this.setStep("Generate Dataset", "done", `${factoryCount} factories generated.`);
    this.state.status = "ready";
  }

  private async partitionGraphStep() {
    // RANDOM là baseline, METIS là optimized partition.
    this.setStep("Partition Graph", "running", "Running RANDOM and METIS partitioners.");
    await this.runCommand(PYTHON, ["partitioner/random_partition.py"]);
    await this.runCommand(PYTHON, ["partitioner/metis_partition.py"]);
    this.setStep("Partition Graph", "done", "RANDOM and METIS partition maps created.");
    this.state.status = "ready";
  }

  private async buildMaterialDirectoryStep() {
    // Directory dùng cho pruning; topology dùng cho phần phân tích partition.
    this.setStep("Build Material Directory", "running", "Building directory and topology metrics.");
    await this.runCommand(PYTHON, ["partitioner/material_directory_builder.py"]);
    await this.runCommand(PYTHON, ["partitioner/topology_metrics.py"]);
    this.setStep("Build Material Directory", "done", "Material directory and topology metrics are ready.");
    this.state.status = "ready";
  }

  private async importPostgresStep() {
    // PostgreSQL là nơi lưu metadata/document/directory/topology cho backend đọc.
    this.setStep("Import PostgreSQL", "running", "Importing PostgreSQL metadata, directory, and topology metrics.");
    await this.runCommand(PYTHON, ["importer/import_to_postgres.py"]);
    this.setStep("Import PostgreSQL", "done", "PostgreSQL metadata, directory, and topology are loaded.");
    this.state.status = "ready";
  }

  private async warmupStep() {
    // Warmup prime PostgreSQL lookup và Neo4j Cypher/Bolt trước demo query.
    this.setStep("Warm Up Query Engine", "running", "Priming Neo4j Bolt connections, Cypher plans, indexes, and PostgreSQL directory lookup.");
    const result = await this.warmupService.run();
    this.setStep("Warm Up Query Engine", "done", `Warm-up finished in ${result.elapsedMs}ms across ${result.neo4jQueries} Neo4j probe queries.`);
    this.state.status = "ready";
  }

  private ensureIdle() {
    // Nếu job đang chạy, trả 409 để frontend không khởi động job khác.
    if (this.running) {
      const error = new Error("A demo job is already running.");
      (error as Error & { statusCode?: number }).statusCode = 409;
      throw error;
    }
  }

  private setStep(name: string, status: DemoStep["status"], summary: string) {
    // Cập nhật trạng thái step và ghi log để dashboard hiển thị tiến trình.
    this.state.activeStep = status === "running" ? name : this.state.activeStep;
    this.state.steps = this.state.steps.map((step) => step.name === name ? { ...step, status, summary } : step);
    this.log(`${name}: ${summary}`);
  }

  private log(line: string) {
    // Giữ log ngắn gọn để response /status không phình quá lớn.
    this.state.logs.push(`[${new Date().toISOString()}] ${line}`);
    this.state.logs = this.state.logs.slice(-MAX_LOGS);
  }

  private runCommand(command: string, args: string[], extraEnv: Record<string, string> = {}) {
    // Chạy Python scripts từ backend, stream stdout/stderr vào demo logs.
    this.log(`$ ${command} ${args.join(" ")}`);
    return new Promise<void>((resolve, reject) => {
      const child = spawn(command, args, {
        cwd: ROOT,
        env: { ...process.env, ...extraEnv, GENERATOR_OUTPUT_DIR: path.join(ROOT, "generator", "output"), PARTITIONER_OUTPUT_DIR: path.join(ROOT, "partitioner", "output") },
        shell: process.platform === "win32"
      });

      child.stdout.on("data", (data) => this.log(data.toString().trim()));
      child.stderr.on("data", (data) => this.log(data.toString().trim()));
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
        }
      });
    });
  }
}

export const demoService = new DemoService();
