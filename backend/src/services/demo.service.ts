import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { QueryService } from "./query.service";
import { DemoState, DemoStep } from "../types/demo";

const ROOT = process.cwd();
const MAX_LOGS = 240;
const PYTHON = process.platform === "win32" ? "python" : "python3";

const initialSteps: DemoStep[] = [
  { name: "Generate Dataset", status: "pending", summary: "Create 480 factories and 5-level supply chains." },
  { name: "Partition Graph", status: "pending", summary: "Build RANDOM and METIS factory-subgraph partitions." },
  { name: "Build Material Directory", status: "pending", summary: "Map materials to shards for pruning." },
  { name: "Import PostgreSQL", status: "pending", summary: "Load metadata, documents, material directory, and topology metrics." },
  { name: "Import Neo4j", status: "pending", summary: "Load RANDOM and METIS graph data into 4 Neo4j shards." },
  { name: "Run Demo Query", status: "pending", summary: "Run Palladium / METIS / OPTIMIZED." },
  { name: "Review Benchmark", status: "pending", summary: "Benchmark is ready after setup." },
  { name: "Review Topology", status: "pending", summary: "Topology metrics are ready after setup." }
];

class DemoService {
  private state: DemoState = {
    status: "idle",
    activeStep: null,
    activePartitionMode: null,
    steps: initialSteps.map((step) => ({ ...step })),
    logs: []
  };

  private running = false;
  private query = new QueryService();

  getStatus(): DemoState {
    return {
      ...this.state,
      steps: this.state.steps.map((step) => ({ ...step })),
      logs: [...this.state.logs]
    };
  }

  reset() {
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
    await this.runExclusive(() => this.importNeo4jStep(mode));
    return this.getStatus();
  }

  async generateDataset() {
    await this.runExclusive(() => this.generateDatasetStep());
    return this.getStatus();
  }

  async partitionGraph() {
    await this.runExclusive(() => this.partitionGraphStep());
    return this.getStatus();
  }

  async buildMaterialDirectory() {
    await this.runExclusive(() => this.buildMaterialDirectoryStep());
    return this.getStatus();
  }

  async importPostgres() {
    await this.runExclusive(() => this.importPostgresStep());
    return this.getStatus();
  }

  async importNeo4jStep(mode: "RANDOM" | "METIS" | "ALL") {
    this.setStep("Import Neo4j", "running", `Importing ${mode === "ALL" ? "RANDOM + METIS" : mode} graph into 4 Neo4j shards.`);
    await this.runCommand(PYTHON, ["importer/import_to_neo4j.py"], { PARTITION_MODE: mode });
    this.state.activePartitionMode = mode === "ALL" ? "BOTH" : mode;
    this.setStep("Import Neo4j", "done", `${mode === "ALL" ? "RANDOM + METIS are" : `${mode} is`} active in Neo4j.`);
    this.state.status = "ready";
  }

  async sampleQuery() {
    const result = await this.query.run({ materialName: "Palladium", partitionMode: "METIS", queryMode: "OPTIMIZED" });
    this.state.lastSampleQuery = result;
    this.setStep("Run Demo Query", "done", `Palladium visited ${result.metrics.visitedShardCount} shard(s) and pruned ${result.metrics.prunedShardCount}.`);
    return result;
  }

  private async runExclusive(action: () => Promise<void>) {
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
    await this.generateDatasetStep();
    await this.partitionGraphStep();
    await this.buildMaterialDirectoryStep();
    await this.importPostgresStep();
    await this.importNeo4jStep("ALL");

    const sample = await this.sampleQuery();
    this.setStep("Review Benchmark", "done", "Benchmark can run the prepared scenarios.");
    this.setStep("Review Topology", "done", `METIS sample pruned ${sample.metrics.prunedShardCount} shard(s).`);
    this.state.status = "ready";
  }

  private async generateDatasetStep() {
    this.setStep("Generate Dataset", "running", "Generating 480 factories.");
    await this.runCommand(PYTHON, ["generator/generate_dataset.py"]);
    const docsPath = path.join(ROOT, "generator", "output", "supply_chain_documents.json");
    const factoryCount = fs.existsSync(docsPath) ? JSON.parse(fs.readFileSync(docsPath, "utf-8")).length : 0;
    this.setStep("Generate Dataset", "done", `${factoryCount} factories generated.`);
    this.state.status = "ready";
  }

  private async partitionGraphStep() {
    this.setStep("Partition Graph", "running", "Running RANDOM and METIS partitioners.");
    await this.runCommand(PYTHON, ["partitioner/random_partition.py"]);
    await this.runCommand(PYTHON, ["partitioner/metis_partition.py"]);
    this.setStep("Partition Graph", "done", "RANDOM and METIS partition maps created.");
    this.state.status = "ready";
  }

  private async buildMaterialDirectoryStep() {
    this.setStep("Build Material Directory", "running", "Building directory and topology metrics.");
    await this.runCommand(PYTHON, ["partitioner/material_directory_builder.py"]);
    await this.runCommand(PYTHON, ["partitioner/topology_metrics.py"]);
    this.setStep("Build Material Directory", "done", "Material directory and topology metrics are ready.");
    this.state.status = "ready";
  }

  private async importPostgresStep() {
    this.setStep("Import PostgreSQL", "running", "Importing PostgreSQL metadata, directory, and topology metrics.");
    await this.runCommand(PYTHON, ["importer/import_to_postgres.py"]);
    this.setStep("Import PostgreSQL", "done", "PostgreSQL metadata, directory, and topology are loaded.");
    this.state.status = "ready";
  }

  private ensureIdle() {
    if (this.running) {
      const error = new Error("A demo job is already running.");
      (error as Error & { statusCode?: number }).statusCode = 409;
      throw error;
    }
  }

  private setStep(name: string, status: DemoStep["status"], summary: string) {
    this.state.activeStep = status === "running" ? name : this.state.activeStep;
    this.state.steps = this.state.steps.map((step) => step.name === name ? { ...step, status, summary } : step);
    this.log(`${name}: ${summary}`);
  }

  private log(line: string) {
    this.state.logs.push(`[${new Date().toISOString()}] ${line}`);
    this.state.logs = this.state.logs.slice(-MAX_LOGS);
  }

  private runCommand(command: string, args: string[], extraEnv: Record<string, string> = {}) {
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
