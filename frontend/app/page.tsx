"use client";

import { Activity, BarChart3, Boxes, Database, GitBranch, Layers3, Play, RefreshCw, RotateCcw, Route, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
  affectedFactories: Array<{ factoryId: string; factoryName: string; region: string; riskScore: number; documentProductCount?: number }>;
  executionPlan: {
    queryMode: string;
    partitionMode: string;
    materialName: string;
    steps: string[];
    visitedShards: string[];
    prunedShards: string[];
    bfsLevels: Array<{ level?: number; nodeType: string; count: number }>;
    cypherQuery: string;
    cypherParams: Record<string, string>;
    directoryQuery?: string;
    directoryParams?: Record<string, string>;
    reason: string;
  };
  metrics: { executionTimeMs: number; estimatedDistributedCostMs: number; visitedShardCount: number; prunedShardCount: number; affectedFactoryCount: number };
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
  estimatedDistributedCostMs: number;
};
type Metrics = {
  projectionNodes: number;
  projectionEdges: number;
  edgeCutRatio: number;
  materialReplication: number;
  averageVisitedShardCountByMaterial: number;
  nodeCountByShard: Record<string, number>;
  clusterDensityByShard: Record<string, number>;
};
type BenchmarkResponse = {
  results: Array<{
    materialName: string;
    partitionMode: string;
    queryMode: string;
    executionTimeMs: number;
    estimatedDistributedCostMs: number;
    visitedShardCount: number;
    prunedShardCount: number;
    affectedFactoryCount: number;
  }>;
};

const allShards = ["shard_1", "shard_2", "shard_3", "shard_4"];
const scenarios = [
  { label: "Broad Impact", materialName: "Steel", partitionMode: "RANDOM", queryMode: "NAIVE", note: "Shows the full fan-out path." },
  { label: "Medium Impact", materialName: "Lithium", partitionMode: "METIS", queryMode: "OPTIMIZED", note: "Usually visits fewer shards." },
  { label: "Best Pruning", materialName: "Palladium", partitionMode: "METIS", queryMode: "OPTIMIZED", note: "Clearest one-shard demo." }
];
const prepareSteps = [
  {
    name: "Generate Dataset",
    icon: Boxes,
    action: "/api/demo/generate",
    button: "Generate Dataset",
    theory: "Creates 500 factories and a local 5-level supply chain tree for each factory. Region is metadata only.",
    output: "Factory metadata, graph nodes, graph relationships, and document JSON files."
  },
  {
    name: "Partition Graph",
    icon: GitBranch,
    action: "/api/demo/partition",
    button: "Partition Graph",
    theory: "Assigns every full factory-subgraph to one of 4 shards using RANDOM and METIS. Region stays metadata only.",
    output: "Factory partition maps, node assignment maps, and material replica maps."
  },
  {
    name: "Build Material Directory",
    icon: Route,
    action: "/api/demo/build-directory",
    button: "Build Directory",
    theory: "Builds the lookup table used by optimized queries to skip irrelevant shards.",
    output: "Material directory rows and topology metrics for RANDOM vs METIS."
  },
  {
    name: "Import PostgreSQL",
    icon: Database,
    action: "/api/demo/import-postgres",
    button: "Import PostgreSQL",
    theory: "Loads metadata, JSON documents, material directory, and topology metrics.",
    output: "PostgreSQL tables ready for enrichment, routing, benchmark, and topology views."
  },
  {
    name: "Import Neo4j",
    icon: Layers3,
    action: "/api/demo/import-neo4j",
    button: "Import Neo4j",
    theory: "Loads graph data into 4 Neo4j shards so each shard can answer local Cypher traversals.",
    output: "RANDOM and METIS graph modes available inside Neo4j shards."
  }
];

export default function OnePageDemo() {
  const [demo, setDemo] = useState<DemoState | null>(null);
  const [logs, setLogs] = useState<Log[]>([]);
  const [topology, setTopology] = useState<Record<string, Metrics>>({});
  const [queryResult, setQueryResult] = useState<QueryResponse | null>(null);
  const [benchmark, setBenchmark] = useState<BenchmarkResponse | null>(null);
  const [materialName, setMaterialName] = useState("Palladium");
  const [partitionMode, setPartitionMode] = useState("METIS");
  const [queryMode, setQueryMode] = useState("OPTIMIZED");
  const [neo4jMode, setNeo4jMode] = useState("ALL");
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
      if (result && typeof result === "object" && "results" in result) {
        setBenchmark(result as BenchmarkResponse);
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  async function runPrepareStep(step: typeof prepareSteps[number]) {
    const body = step.name === "Import Neo4j" ? { partitionMode: neo4jMode } : undefined;
    await runAction(() => apiPost(step.action, body));
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
  const benchmarkRows = useMemo(() => {
    if (benchmark?.results?.length) return benchmark.results;
    const seen = new Set<string>();
    const rows = [];
    for (const log of logs) {
      const key = `${log.materialName}-${log.partitionMode}-${log.queryMode}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({
        materialName: log.materialName,
        partitionMode: log.partitionMode,
        queryMode: log.queryMode,
        executionTimeMs: log.executionTimeMs,
        estimatedDistributedCostMs: log.estimatedDistributedCostMs,
        visitedShardCount: log.visitedShards.length,
        prunedShardCount: log.prunedShards.length,
        affectedFactoryCount: log.affectedFactoryCount
      });
    }
    return rows;
  }, [benchmark, logs]);

  return (
    <>
      <section className="hero app-hero">
        <div className="hero-main">
          <span className="eyebrow">4-shard distributed graph demo</span>
          <h1>Supply Chain Map</h1>
          <p>Prepare data step by step, run shard-aware shortage queries, then compare RANDOM and METIS with visual metrics.</p>
        </div>
        <aside className="panel readiness">
          <h2>System Readiness</h2>
          <p><span className={`status-dot ${demo?.status}`} /> Demo status: {demo?.status ?? "loading"}</p>
          <p>Graph modes: {demo?.activePartitionMode ?? "not imported"}</p>
          <p>Active step: {demo?.activeStep ?? "idle"}</p>
          <button className="secondary" onClick={() => runAction(() => apiPost("/api/demo/reset"))} disabled={running}><RotateCcw size={16} />Reset View</button>
        </aside>
      </section>

      {error && <section className="empty-state error-state" style={{ marginBottom: 16 }}><strong>{error}</strong><p>Run the setup steps from top to bottom, then retry the action.</p></section>}

      <section className="panel section-panel">
        <div className="section-heading">
          <div>
            <span className="section-kicker">1. Prepare Data</span>
            <h2>Run each setup step in order</h2>
            <p>These steps build the dataset, partition it, create the pruning directory, and load the databases. Run them top to bottom.</p>
          </div>
          <button className="secondary" onClick={() => setShowLogs((value) => !value)}>{showLogs ? "Hide Logs" : "Show Logs"}</button>
        </div>
        <div className="prepare-grid">
          {prepareSteps.map((step, index) => {
            const state = demo?.steps.find((item) => item.name === step.name);
            const Icon = step.icon;
            return (
              <article className="step-card" key={step.name}>
                <div className="step-card-head">
                  <span className="step-icon"><Icon size={18} /></span>
                  <div>
                    <strong>{index + 1}. {step.name}</strong>
                    <p>{state?.summary ?? step.output}</p>
                  </div>
                  <span className={`badge ${state?.status === "done" ? "green" : state?.status === "failed" ? "red" : state?.status === "running" ? "amber" : ""}`}>{state?.status ?? "pending"}</span>
                </div>
                <div className="step-explain">
                  <p><b>What this does:</b> {step.theory}</p>
                  <p><b>Output:</b> {step.output}</p>
                </div>
                <div className="step-actions">
                  {step.name === "Import Neo4j" && (
                    <select value={neo4jMode} onChange={(event) => setNeo4jMode(event.target.value)} disabled={running}>
                      <option>ALL</option><option>METIS</option><option>RANDOM</option>
                    </select>
                  )}
                  <button onClick={() => runPrepareStep(step)} disabled={running}><Play size={16} />{step.button}</button>
                </div>
              </article>
            );
          })}
        </div>
        {showLogs && <pre className="log-panel">{demo?.logs.join("\n")}</pre>}
      </section>

      <section className="panel section-panel">
        <div className="section-heading">
          <div>
            <span className="section-kicker">2. Query Lab</span>
            <h2>Run a shortage query and compare modes</h2>
            <p><b>NAIVE</b> visits every shard. <b>OPTIMIZED</b> uses the material directory to skip shards that cannot contain the material.</p>
          </div>
          <button className="green" onClick={() => runAction(() => apiPost<QueryResponse>("/api/demo/sample-query"))} disabled={running}><RefreshCw size={16} />Sample Query</button>
        </div>
        <div className="scenario-grid">
          {scenarios.map((scenario) => (
            <button className="scenario-button" key={scenario.label} onClick={() => applyScenario(scenario)} disabled={running}>
              <strong>{scenario.label}</strong>
              <span>{scenario.materialName} / {scenario.partitionMode} / {scenario.queryMode}</span>
              <small>{scenario.note}</small>
            </button>
          ))}
        </div>
        <div className="form query-form">
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
          <button onClick={runQuery} disabled={running}><Search size={16} />Run Query</button>
        </div>

        {queryResult ? (
          <>
            <div className="grid metric-grid">
              <MetricCard label="Distributed Cost" value={`${queryResult.metrics.estimatedDistributedCostMs}ms`} />
              <MetricCard label="Actual Runtime" value={`${queryResult.metrics.executionTimeMs}ms`} />
              <MetricCard label="Visited Shards" value={queryResult.metrics.visitedShardCount} />
              <MetricCard label="Pruned Shards" value={queryResult.metrics.prunedShardCount} />
            </div>
            <div className="shard-grid">
              {allShards.map((shard) => {
                const status = queryResult.executionPlan.visitedShards.includes(shard) ? "visited" : queryResult.executionPlan.prunedShards.includes(shard) ? "pruned" : "";
                return <div className={`shard-box ${status}`} key={shard}><strong>{shard}</strong><p>{status || "idle"}</p></div>;
              })}
            </div>
            <section className="deliverable-panel">
              <div>
                <span className="section-kicker">Deliverable: Execution Plan</span>
                <h3>Which shards were visited, and why</h3>
                <p>{queryResult.executionPlan.reason}</p>
              </div>
              <div className="plan-summary-grid">
                <MetricCard label="Query Mode" value={queryResult.executionPlan.queryMode} />
                <MetricCard label="Visited" value={queryResult.executionPlan.visitedShards.join(", ") || "-"} />
                <MetricCard label="Pruned" value={queryResult.executionPlan.prunedShards.join(", ") || "none"} />
              </div>
              <div className="execution-flow">
                {queryResult.executionPlan.steps.map((step) => <span className="flow-step" key={step}>{step}</span>)}
              </div>
              <div className="bfs-grid">
                {queryResult.executionPlan.bfsLevels.map((level) => (
                  <div className="bfs-card" key={level.nodeType}>
                    <strong>{level.nodeType}</strong>
                    <span>{level.count}</span>
                  </div>
                ))}
              </div>
              <div className="query-text-grid">
                <div>
                  <h4>Cypher traversal query</h4>
                  <pre className="query-code">{queryResult.executionPlan.cypherQuery}</pre>
                  <p className="query-params">Params: {JSON.stringify(queryResult.executionPlan.cypherParams)}</p>
                </div>
                <div>
                  <h4>SQL directory lookup</h4>
                  <pre className="query-code">{queryResult.executionPlan.directoryQuery ?? "Skipped in NAIVE mode. NAIVE broadcasts the query to every shard."}</pre>
                  <p className="query-params">Params: {queryResult.executionPlan.directoryParams ? JSON.stringify(queryResult.executionPlan.directoryParams) : "none"}</p>
                </div>
              </div>
            </section>
            <table style={{ marginTop: 16 }}>
              <thead><tr><th>Factory</th><th>Name</th><th>Region</th><th>Risk</th><th>Doc Products</th></tr></thead>
              <tbody>
                {queryResult.affectedFactories.slice(0, 10).map((factory) => (
                  <tr key={factory.factoryId}><td>{factory.factoryId}</td><td>{factory.factoryName}</td><td>{factory.region}</td><td>{factory.riskScore}</td><td>{factory.documentProductCount ?? "-"}</td></tr>
                ))}
              </tbody>
            </table>
          </>
        ) : <div className="empty-state"><strong>No query yet</strong><p>Finish the prepare steps, then run the Best Pruning scenario.</p></div>}
      </section>

      <section className="panel section-panel">
        <div className="section-heading">
          <div>
            <span className="section-kicker">3. Benchmark & Topology</span>
            <h2>Compare RANDOM and METIS visually</h2>
            <p>Benchmark measures query behavior for the same material across modes. Topology measures partition quality before the query runs.</p>
          </div>
          <button className="secondary" onClick={() => runAction(() => apiPost<BenchmarkResponse>("/api/benchmark/run"))} disabled={running}><BarChart3 size={16} />Run Benchmark</button>
        </div>
        <div className="insight-grid">
          <div className="insight-card">
            <strong>Benchmark</strong>
            <p>Compares RANDOM and METIS using the same material and all 4 combos: RANDOM+NAIVE, RANDOM+OPTIMIZED, METIS+NAIVE, METIS+OPTIMIZED.</p>
          </div>
          <div className="insight-card">
            <strong>Topology</strong>
            <p>Explains whether the partition itself is good: lower edge-cut and replication mean dependencies are less scattered across shards.</p>
          </div>
          <div className="insight-card">
            <strong>Fair comparison</strong>
            <p>NAIVE always broadcasts. The key demo comparison is RANDOM+OPTIMIZED vs METIS+OPTIMIZED for the same raw material.</p>
          </div>
        </div>
        <div className="topology-heading">
          <span className="section-kicker">Topology Insight: Edge-Cut & Cluster Density</span>
          <h3>Partition quality before running queries</h3>
          <p>Edge-cut thấp hơn nghĩa là dependency ít bị phân tán hơn. Cluster density cao hơn nghĩa là shard gom factory-material dependency chặt hơn.</p>
        </div>
        <div className="compare-grid">
          <CompareBar title="Material Replication" leftLabel="RANDOM" leftValue={random?.materialReplication ?? 0} rightLabel="METIS" rightValue={metis?.materialReplication ?? 0} suffix="" />
          <CompareBar title="Edge-Cut Ratio" leftLabel="RANDOM" leftValue={random?.edgeCutRatio ?? 0} rightLabel="METIS" rightValue={metis?.edgeCutRatio ?? 0} suffix="" />
          <CompareBar title="Avg Visited Shards / Material" leftLabel="RANDOM" leftValue={random?.averageVisitedShardCountByMaterial ?? 0} rightLabel="METIS" rightValue={metis?.averageVisitedShardCountByMaterial ?? 0} suffix="" />
          <CompareBar title="Avg Cluster Density" leftLabel="RANDOM" leftValue={averageDensity(random)} rightLabel="METIS" rightValue={averageDensity(metis)} suffix="" />
          <CompareBar title="Palladium Optimized Cost" leftLabel="RANDOM" leftValue={benchmarkValue(benchmarkRows, "Palladium", "RANDOM", "OPTIMIZED", "cost")} rightLabel="METIS" rightValue={benchmarkValue(benchmarkRows, "Palladium", "METIS", "OPTIMIZED", "cost")} suffix="ms" />
          <CompareBar title="Palladium Optimized Visits" leftLabel="RANDOM" leftValue={benchmarkValue(benchmarkRows, "Palladium", "RANDOM", "OPTIMIZED", "visited")} rightLabel="METIS" rightValue={benchmarkValue(benchmarkRows, "Palladium", "METIS", "OPTIMIZED", "visited")} suffix="" />
        </div>
        <div className="takeaway">
          <Activity size={18} />
          <p><b>Demo takeaway:</b> NAIVE luôn query cả 4 shards. RANDOM+OPTIMIZED có thể giống RANDOM+NAIVE nếu material bị replicate ở đủ 4 shards. Điểm chính cần nhìn là RANDOM+OPTIMIZED so với METIS+OPTIMIZED cùng một material.</p>
        </div>
        <table className="benchmark-table" style={{ marginTop: 16 }}>
          <thead><tr><th>Material</th><th>Partition</th><th>Mode</th><th>Distributed Cost</th><th>Runtime</th><th>Visited</th><th>Pruned</th><th>Factories</th></tr></thead>
          <tbody>
            {benchmarkRows.slice(0, 12).map((row) => (
              <tr key={`${row.materialName}-${row.partitionMode}-${row.queryMode}`}>
                <td>{row.materialName}</td>
                <td>{row.partitionMode}</td>
                <td>{row.queryMode}</td>
                <td>{row.estimatedDistributedCostMs}ms</td>
                <td>{row.executionTimeMs}ms</td>
                <td>{row.visitedShardCount}</td>
                <td>{row.prunedShardCount}</td>
                <td>{row.affectedFactoryCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return <div className="card metric-card"><div className="metric">{value}</div><p>{label}</p></div>;
}

function CompareBar({ title, leftLabel, leftValue, rightLabel, rightValue, suffix }: { title: string; leftLabel: string; leftValue: number; rightLabel: string; rightValue: number; suffix: string }) {
  const max = Math.max(leftValue, rightValue, 1);
  return (
    <div className="compare-card">
      <h3>{title}</h3>
      <BarRow label={leftLabel} value={leftValue} max={max} suffix={suffix} />
      <BarRow label={rightLabel} value={rightValue} max={max} suffix={suffix} accent />
    </div>
  );
}

function BarRow({ label, value, max, suffix, accent = false }: { label: string; value: number; max: number; suffix: string; accent?: boolean }) {
  const width = `${Math.max((value / max) * 100, value > 0 ? 8 : 0)}%`;
  return (
    <div className="compare-row">
      <span>{label}</span>
      <div className="compare-track"><div className={accent ? "compare-fill accent" : "compare-fill"} style={{ width }} /></div>
      <strong>{value ? `${value}${suffix}` : "-"}</strong>
    </div>
  );
}

function benchmarkValue(
  rows: BenchmarkResponse["results"],
  materialName: string,
  partitionMode: string,
  queryMode: string,
  metric: "cost" | "visited"
) {
  const row = rows.find((item) => item.materialName === materialName && item.partitionMode === partitionMode && item.queryMode === queryMode);
  if (!row) return 0;
  return metric === "cost" ? row.estimatedDistributedCostMs : row.visitedShardCount;
}

function averageDensity(metrics?: Metrics) {
  const values = Object.values(metrics?.clusterDensityByShard ?? {});
  if (!values.length) return 0;
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(4));
}
