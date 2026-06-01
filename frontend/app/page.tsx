"use client";

import { Database, Play, RefreshCw, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { apiGet, apiPost } from "./api";

type Step = { name: string; status: "pending" | "running" | "done" | "failed"; summary: string };
type DemoState = {
  status: "idle" | "running" | "ready" | "failed";
  activeStep: string | null;
  activePartitionMode: "RANDOM" | "METIS" | "BOTH" | null;
  steps: Step[];
  logs: string[];
  lastError?: string;
};
type QueryResponse = {
  affectedFactories: Array<{ factoryId: string; factoryName: string; region: string; riskScore: number }>;
  executionPlan: { visitedShards: string[]; prunedShards: string[]; bfsLevels: Array<{ nodeType: string; count: number }> };
  metrics: { executionTimeMs: number; visitedShardCount: number; prunedShardCount: number; affectedFactoryCount: number };
};
type Log = {
  queryId: string;
  partitionMode: string;
  queryMode: string;
  materialName: string;
  visitedShards: string[];
  prunedShards: string[];
  affectedFactoryCount: number;
  executionTimeMs: number;
};
type Metrics = {
  projectionNodes: number;
  projectionEdges: number;
  edgeCutRatio: number;
  materialReplication: number;
  nodeCountByShard: Record<string, number>;
};

const allShards = ["shard_1", "shard_2", "shard_3", "shard_4", "shard_5"];
const scenarios = [
  { label: "Broad impact", materialName: "Steel", partitionMode: "RANDOM", queryMode: "NAIVE" },
  { label: "Medium impact", materialName: "Lithium", partitionMode: "METIS", queryMode: "OPTIMIZED" },
  { label: "Best pruning", materialName: "Palladium", partitionMode: "METIS", queryMode: "OPTIMIZED" }
];

export default function OnePageDemo() {
  const [demo, setDemo] = useState<DemoState | null>(null);
  const [logs, setLogs] = useState<Log[]>([]);
  const [topology, setTopology] = useState<Record<string, Metrics>>({});
  const [queryResult, setQueryResult] = useState<QueryResponse | null>(null);
  const [materialName, setMaterialName] = useState("Palladium");
  const [partitionMode, setPartitionMode] = useState("METIS");
  const [queryMode, setQueryMode] = useState("OPTIMIZED");
  const [busy, setBusy] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [error, setError] = useState("");

  async function refresh() {
    const [demoState, benchmarkLogs, topologyData] = await Promise.allSettled([
      apiGet<DemoState>("/api/demo/status"),
      apiGet<Log[]>("/api/benchmark"),
      apiGet<Record<string, Metrics>>("/api/topology")
    ]);
    if (demoState.status === "fulfilled") setDemo(demoState.value);
    if (benchmarkLogs.status === "fulfilled") setLogs(benchmarkLogs.value);
    if (topologyData.status === "fulfilled") setTopology(topologyData.value);
  }

  async function runAction(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      const result = await fn();
      if (result && typeof result === "object" && "metrics" in result) {
        const response = result as QueryResponse;
        setQueryResult(response);
        sessionStorage.setItem("lastExecutionPlan", JSON.stringify(response.executionPlan));
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  async function runQuery() {
    await runAction(() => apiPost<QueryResponse>("/api/query", { materialName, partitionMode, queryMode }));
  }

  function applyScenario(scenario: typeof scenarios[number]) {
    setMaterialName(scenario.materialName);
    setPartitionMode(scenario.partitionMode);
    setQueryMode(scenario.queryMode);
  }

  useEffect(() => {
    refresh().catch(() => setError("Backend is not reachable. Start Docker services first."));
    const timer = window.setInterval(() => refresh().catch(() => undefined), 2500);
    return () => window.clearInterval(timer);
  }, []);

  const running = busy || demo?.status === "running";
  const metis = topology.metis;
  const random = topology.random;

  return (
    <>
      <section className="hero">
        <div className="hero-main">
          <h1>Supply Chain Map One-Page Demo</h1>
          <p>Setup data, run Cypher shortage queries, compare Random vs METIS, and inspect topology from this single screen.</p>
          <div className="actions">
            <button onClick={() => runAction(() => apiPost("/api/demo/setup"))} disabled={running}><Play size={16} />Run Full Setup</button>
            <button className="secondary" onClick={() => runAction(() => apiPost("/api/demo/import-neo4j", { partitionMode: "ALL" }))} disabled={running}><Database size={16} />Fast Re-Import Graphs</button>
            <button className="secondary" onClick={() => runAction(() => apiPost("/api/demo/reset"))} disabled={running}><RotateCcw size={16} />Reset View</button>
          </div>
        </div>
        <aside className="panel">
          <h2>Readiness</h2>
          <p><span className={`status-dot ${demo?.status}`} /> Status: {demo?.status ?? "loading"}</p>
          <p>Graph modes: {demo?.activePartitionMode ?? "not imported"}</p>
          <p>Active step: {demo?.activeStep ?? "idle"}</p>
        </aside>
      </section>

      {error && <section className="empty-state" style={{ marginBottom: 16 }}><strong>{error}</strong><p>If setup has not run, click Run Full Setup first.</p></section>}

      <section className="panel">
        <h2>1. Setup Progress</h2>
        <div className="stepper">
          {(demo?.steps ?? []).map((step, index) => (
            <div className="demo-step" key={step.name}>
              <span className={`status-dot ${step.status}`} />
              <div>
                <strong>{index + 1}. {step.name}</strong>
                <p>{step.summary}</p>
              </div>
              <span className={`badge ${step.status === "done" ? "green" : step.status === "failed" ? "red" : step.status === "running" ? "amber" : ""}`}>{step.status}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <div className="title">
          <div>
            <h2>2. Query Optimizer</h2>
            <p>Use Palladium + METIS + OPTIMIZED for the clearest pruning demo.</p>
          </div>
          <button className="green" onClick={() => runAction(() => apiPost<QueryResponse>("/api/demo/sample-query"))} disabled={running}><RefreshCw size={16} />Sample Query</button>
        </div>
        <div className="actions" style={{ marginTop: 0 }}>
          {scenarios.map((scenario) => <button className="secondary" key={scenario.label} onClick={() => applyScenario(scenario)}>{scenario.label}</button>)}
        </div>
        <div className="form" style={{ marginTop: 12 }}>
          <label>Material
            <select value={materialName} onChange={(event) => setMaterialName(event.target.value)}>
              <option>Steel</option><option>Lithium</option><option>Palladium</option><option>Copper</option><option>Nickel</option>
            </select>
          </label>
          <label>Partition
            <select value={partitionMode} onChange={(event) => setPartitionMode(event.target.value)}>
              <option>RANDOM</option><option>METIS</option>
            </select>
          </label>
          <label>Mode
            <select value={queryMode} onChange={(event) => setQueryMode(event.target.value)}>
              <option>NAIVE</option><option>OPTIMIZED</option>
            </select>
          </label>
          <button onClick={runQuery} disabled={running}><Play size={16} />Run Query</button>
        </div>

        {queryResult ? (
          <>
            <div className="grid" style={{ marginTop: 16 }}>
              <div className="card"><div className="metric">{queryResult.metrics.executionTimeMs}ms</div><p>Time</p></div>
              <div className="card"><div className="metric">{queryResult.metrics.visitedShardCount}</div><p>Visited Shards</p></div>
              <div className="card"><div className="metric">{queryResult.metrics.prunedShardCount}</div><p>Pruned Shards</p></div>
              <div className="card"><div className="metric">{queryResult.metrics.affectedFactoryCount}</div><p>Affected Factories</p></div>
            </div>
            <div className="shard-grid" style={{ marginTop: 16 }}>
              {allShards.map((shard) => {
                const status = queryResult.executionPlan.visitedShards.includes(shard) ? "visited" : queryResult.executionPlan.prunedShards.includes(shard) ? "pruned" : "";
                return <div className={`shard-box ${status}`} key={shard}><strong>{shard}</strong><p>{status || "idle"}</p></div>;
              })}
            </div>
            <table style={{ marginTop: 16 }}>
              <thead><tr><th>Factory</th><th>Name</th><th>Region</th><th>Risk</th></tr></thead>
              <tbody>
                {queryResult.affectedFactories.slice(0, 10).map((factory) => (
                  <tr key={factory.factoryId}><td>{factory.factoryId}</td><td>{factory.factoryName}</td><td>{factory.region}</td><td>{factory.riskScore}</td></tr>
                ))}
              </tbody>
            </table>
          </>
        ) : <div className="empty-state" style={{ marginTop: 16 }}><strong>No query yet</strong><p>Run setup, then run the Best pruning scenario.</p></div>}
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <div className="title">
          <div>
            <h2>3. Benchmark and Topology</h2>
            <p>For timing, focus on visited/pruned shards. Exact milliseconds can vary because optimized mode also does a directory lookup.</p>
          </div>
          <button className="secondary" onClick={() => runAction(() => apiPost("/api/benchmark/run"))} disabled={running}>Run Benchmark</button>
        </div>
        <div className="grid">
          <div className="card"><h3>Random Replication</h3><div className="metric">{random?.materialReplication ?? "-"}</div><p>Average material shard copies</p></div>
          <div className="card"><h3>METIS Replication</h3><div className="metric">{metis?.materialReplication ?? "-"}</div><p>Lower is better for pruning</p></div>
          <div className="card"><h3>Random Edge-Cut</h3><div className="metric">{random?.edgeCutRatio ?? "-"}</div><p>Projection graph spread</p></div>
          <div className="card"><h3>METIS Edge-Cut</h3><div className="metric">{metis?.edgeCutRatio ?? "-"}</div><p>Projection graph spread</p></div>
        </div>
        <table style={{ marginTop: 16 }}>
          <thead><tr><th>Material</th><th>Partition</th><th>Mode</th><th>Time</th><th>Visited</th><th>Pruned</th><th>Factories</th></tr></thead>
          <tbody>
            {logs.slice(0, 8).map((log) => (
              <tr key={log.queryId}><td>{log.materialName}</td><td>{log.partitionMode}</td><td>{log.queryMode}</td><td>{log.executionTimeMs}ms</td><td>{log.visitedShards.length}</td><td>{log.prunedShards.length}</td><td>{log.affectedFactoryCount}</td></tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <button className="secondary" onClick={() => setShowLogs((value) => !value)}>{showLogs ? "Hide Setup Logs" : "Show Setup Logs"}</button>
        {showLogs && <pre className="log-panel">{demo?.logs.join("\n")}</pre>}
      </section>
    </>
  );
}

