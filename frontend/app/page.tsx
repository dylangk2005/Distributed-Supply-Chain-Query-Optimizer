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
    queryId?: string;
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
  edgeCountByShard: Record<string, number>;
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
type MaterialSummary = {
  materialId: string;
  materialName: string;
  randomShards: string[];
  metisShards: string[];
  randomReplicaCount: number;
  metisReplicaCount: number;
};
type MaterialDirectoryRow = {
  materialId: string;
  materialName: string;
  partitionMode: "RANDOM" | "METIS";
  shardId: string;
  factoryCount: number;
  componentCount: number;
};

const allShards = ["shard_1", "shard_2", "shard_3", "shard_4", "shard_5"];
const fallbackMaterials = ["Steel", "Lithium", "Palladium", "Copper", "Nickel"];
const scenarios = [
  { label: "Broad Impact", materialName: "Steel", partitionMode: "RANDOM", queryMode: "NAIVE", note: "Full broadcast path across all shards." },
  { label: "Medium Impact", materialName: "Lithium", partitionMode: "METIS", queryMode: "OPTIMIZED", note: "Usually visits a smaller shard set." },
  { label: "Best Pruning", materialName: "Palladium", partitionMode: "METIS", queryMode: "OPTIMIZED", note: "Clearest rare-material pruning demo." }
] as const;
const prepareSteps = [
  {
    name: "Generate Dataset",
    icon: Boxes,
    action: "/api/demo/generate",
    button: "Generate Dataset",
    theory: "Creates 1000 factories and a local 5-level supply chain tree for each factory. Region is metadata only.",
    output: "Factory metadata, graph nodes, graph relationships, and document JSON files."
  },
  {
    name: "Partition Graph",
    icon: GitBranch,
    action: "/api/demo/partition",
    button: "Partition Graph",
    theory: "Assigns every full factory-subgraph to one of 5 shards using RANDOM and METIS. Region stays metadata only.",
    output: "Factory partition maps, node assignment maps, and material replica maps."
  },
  {
    name: "Build Material Directory",
    icon: Route,
    action: "/api/demo/build-directory",
    button: "Build Directory",
    theory: "Builds the lookup table used by OPTIMIZED queries to skip irrelevant shards.",
    output: "Material directory rows and topology metrics for RANDOM vs METIS."
  },
  {
    name: "Import PostgreSQL",
    icon: Database,
    action: "/api/demo/import-postgres",
    button: "Import PostgreSQL",
    theory: "Loads metadata, JSON documents, material directory, and topology metrics.",
    output: "PostgreSQL tables ready for enrichment, routing, benchmark, topology, and material directory views."
  },
  {
    name: "Import Neo4j",
    icon: Layers3,
    action: "/api/demo/import-neo4j",
    button: "Import Neo4j",
    theory: "Loads graph data into 5 Neo4j shards so each shard can answer local Cypher traversals.",
    output: "RANDOM and METIS graph modes available inside Neo4j shards."
  },
  {
    name: "Warm Up Query Engine",
    icon: Activity,
    action: "/api/demo/warmup",
    button: "Warm Up",
    theory: "Runs small probe queries to open Bolt connections, compile Cypher plans, and load hot index/cache pages.",
    output: "First real demo query becomes more stable and benchmark numbers are less affected by cold start."
  }
];

export default function OnePageDemo() {
  const [demo, setDemo] = useState<DemoState | null>(null);
  const [logs, setLogs] = useState<Log[]>([]);
  const [topology, setTopology] = useState<Record<string, Metrics>>({});
  const [materials, setMaterials] = useState<MaterialSummary[]>([]);
  const [directoryRows, setDirectoryRows] = useState<MaterialDirectoryRow[]>([]);
  const [queryResult, setQueryResult] = useState<QueryResponse | null>(null);
  const [benchmark, setBenchmark] = useState<BenchmarkResponse | null>(null);
  const [benchmarkStatus, setBenchmarkStatus] = useState<"idle" | "running" | "done" | "failed">("idle");
  const [benchmarkRanAt, setBenchmarkRanAt] = useState("");
  const [materialName, setMaterialName] = useState("Palladium");
  const [materialSearch, setMaterialSearch] = useState("");
  const [directorySearch, setDirectorySearch] = useState("");
  const [directoryMode, setDirectoryMode] = useState<"RANDOM" | "METIS">("METIS");
  const [partitionMode, setPartitionMode] = useState("METIS");
  const [queryMode, setQueryMode] = useState("OPTIMIZED");
  const [neo4jMode, setNeo4jMode] = useState("ALL");
  const [busy, setBusy] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [error, setError] = useState("");

  async function refresh() {
    const [demoState, benchmarkLogs, topologyData, materialData, directoryData] = await Promise.allSettled([
      apiGet<DemoState>("/api/demo/status"),
      apiGet<Log[]>("/api/benchmark"),
      apiGet<Record<string, Metrics>>("/api/topology"),
      apiGet<MaterialSummary[]>("/api/materials"),
      apiGet<MaterialDirectoryRow[]>(`/api/material-directory?partitionMode=${directoryMode}`)
    ]);
    if (demoState.status === "fulfilled") setDemo(demoState.value);
    if (benchmarkLogs.status === "fulfilled") setLogs(benchmarkLogs.value);
    if (topologyData.status === "fulfilled") setTopology(topologyData.value);
    if (materialData.status === "fulfilled") {
      setMaterials(materialData.value);
      if (materialData.value.length && !materialData.value.some((material) => material.materialName === materialName)) {
        setMaterialName(materialData.value[0].materialName);
      }
    }
    if (directoryData.status === "fulfilled") setDirectoryRows(directoryData.value);
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

  async function runBenchmark() {
    setBusy(true);
    setBenchmarkStatus("running");
    setError("");
    try {
      const result = await apiPost<BenchmarkResponse>("/api/benchmark/run");
      setBenchmark(result);
      setBenchmarkStatus("done");
      setBenchmarkRanAt(new Date().toLocaleTimeString());
      await refresh();
    } catch (err) {
      setBenchmarkStatus("failed");
      setError(err instanceof Error ? err.message : "Benchmark failed");
    } finally {
      setBusy(false);
    }
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
  }, [directoryMode]);

  const running = busy || demo?.status === "running";
  const metis = topology.metis;
  const random = topology.random;
  const materialOptions = materials.length ? materials.map((material) => material.materialName) : fallbackMaterials;
  const filteredMaterialOptions = materialOptions.filter((name) => name.toLowerCase().includes(materialSearch.toLowerCase()));
  const groupedDirectoryRows = useMemo(() => groupDirectoryRows(directoryRows), [directoryRows]);
  const filteredDirectoryRows = groupedDirectoryRows.filter((row) => row.materialName.toLowerCase().includes(directorySearch.toLowerCase()));
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
          <span className="eyebrow">5-shard distributed graph demo</span>
          <h1>Distributed Supply Chain Graph Query Optimizer</h1>
          <p>Prepare the distributed data, inspect material placement, run shortage queries, and explain pruning with an execution plan.</p>
        </div>
        <aside className="panel readiness">
          <h2>System Overview</h2>
          <p><span className={`status-dot ${demo?.status}`} /> Demo status: {demo?.status ?? "loading"}</p>
          <p>Graph modes: {demo?.activePartitionMode ?? "not imported"}</p>
          <p>Active step: {demo?.activeStep ?? "idle"}</p>
          <p>Dataset target: 1000 factories, 40 raw materials, 5 shards</p>
          <button className="secondary" onClick={() => runAction(() => apiPost("/api/demo/reset"))} disabled={running}><RotateCcw size={16} />Reset View</button>
        </aside>
      </section>

      {error && <section className="empty-state error-state" style={{ marginBottom: 16 }}><strong>{error}</strong><p>Run the setup steps from top to bottom, then retry the action.</p></section>}

      <section id="prepare-data" className="panel section-panel">
        <div className="section-heading">
          <div>
            <span className="section-kicker">1. Prepare Data</span>
            <h2>Run each setup step in order</h2>
            <p>Build the 5-level supply chain JSON, partition the graph, import databases, and warm up the query engine.</p>
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

      <section id="material-directory" className="panel section-panel">
        <div className="section-heading">
          <div>
            <span className="section-kicker">2. Material Directory</span>
            <h2>Where each raw material is stored</h2>
            <p>This directory is the optimizer lookup table. OPTIMIZED mode uses it to skip shards that cannot contain the selected shortage material.</p>
          </div>
          <div className="segmented">
            <button className={directoryMode === "RANDOM" ? "" : "secondary"} onClick={() => setDirectoryMode("RANDOM")}>RANDOM</button>
            <button className={directoryMode === "METIS" ? "" : "secondary"} onClick={() => setDirectoryMode("METIS")}>METIS</button>
          </div>
        </div>
        <div className="form directory-tools">
          <label>Filter materials
            <input value={directorySearch} onChange={(event) => setDirectorySearch(event.target.value)} placeholder="Search material directory..." />
          </label>
          <MetricCard label="Rows" value={filteredDirectoryRows.length} />
          <MetricCard label="Partition Mode" value={directoryMode} />
        </div>
        <div className="table-scroll">
          <table className="directory-table" style={{ marginTop: 16 }}>
            <thead><tr><th>Material</th><th>Shards</th><th>Replica Count</th><th>Factory Count</th><th>Component Count</th></tr></thead>
            <tbody>
              {filteredDirectoryRows.map((row) => (
                <tr key={`${directoryMode}-${row.materialId}`}>
                  <td>{row.materialName}</td>
                  <td><div className="chip-row">{row.shards.map((shard) => <span className="shard-chip" key={shard}>{shard}</span>)}</div></td>
                  <td>{row.shards.length}</td>
                  <td>{row.factoryCount}</td>
                  <td>{row.componentCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section id="query-lab" className="panel section-panel query-panel">
        <div className="section-heading">
          <div>
            <span className="section-kicker">3. Query Lab</span>
            <h2>Find factories affected by a material shortage</h2>
            <p><b>NAIVE</b> broadcasts to every shard. <b>OPTIMIZED</b> uses the material directory to prune irrelevant shards before running Cypher.</p>
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
          <label>Search materials
            <input value={materialSearch} onChange={(event) => setMaterialSearch(event.target.value)} placeholder="Type Lithium, Palladium, Steel..." />
          </label>
          <label>Missing material
            <select value={materialName} onChange={(event) => setMaterialName(event.target.value)}>
              {(filteredMaterialOptions.length ? filteredMaterialOptions : materialOptions).map((name) => <option key={name}>{name}</option>)}
            </select>
          </label>
          <label>Partition strategy
            <select value={partitionMode} onChange={(event) => setPartitionMode(event.target.value)}>
              <option>RANDOM</option><option>METIS</option>
            </select>
          </label>
          <label>Query mode
            <select value={queryMode} onChange={(event) => setQueryMode(event.target.value)}>
              <option>NAIVE</option><option>OPTIMIZED</option>
            </select>
          </label>
          <button onClick={runQuery} disabled={running}><Search size={16} />Run Query</button>
        </div>
        <div className="query-preview">
          <h3>Cypher shortage query</h3>
          <pre className="query-code">{queryResult?.executionPlan.cypherQuery ?? defaultCypherQuery()}</pre>
          <p className="query-params">Params: {JSON.stringify(queryResult?.executionPlan.cypherParams ?? { materialName, partitionMode })}</p>
        </div>
        {queryResult ? (
          <div className="grid metric-grid">
            <MetricCard label="Distributed Cost" value={`${queryResult.metrics.estimatedDistributedCostMs}ms`} />
            <MetricCard label="Actual Runtime" value={`${queryResult.metrics.executionTimeMs}ms`} />
            <MetricCard label="Visited Shards" value={queryResult.metrics.visitedShardCount} />
            <MetricCard label="Pruned Shards" value={queryResult.metrics.prunedShardCount} />
          </div>
        ) : <div className="empty-state"><strong>No query yet</strong><p>Finish the prepare steps, then run Best Pruning or choose any raw material from the selector.</p></div>}
      </section>

      <section id="execution-plan" className="panel section-panel">
        <div className="section-heading">
          <div>
            <span className="section-kicker">4. Execution Plan</span>
            <h2>Visited shards, pruned shards, and traversal path</h2>
            <p>The deliverable shows which shards the coordinator queried and which shards it skipped.</p>
          </div>
        </div>
        {queryResult ? (
          <>
            <div className="plan-summary-grid">
              <MetricCard label="Material" value={queryResult.executionPlan.materialName} />
              <MetricCard label="Partition" value={queryResult.executionPlan.partitionMode} />
              <MetricCard label="Mode" value={queryResult.executionPlan.queryMode} />
              <MetricCard label="Affected Factories" value={queryResult.metrics.affectedFactoryCount} />
            </div>
            <div className="shard-grid">
              {allShards.map((shard) => {
                const status = queryResult.executionPlan.visitedShards.includes(shard) ? "visited" : queryResult.executionPlan.prunedShards.includes(shard) ? "pruned" : "";
                return <div className={`shard-box ${status}`} key={shard}><strong>{shard}</strong><p>{status || "idle"}</p></div>;
              })}
            </div>
            <section className="deliverable-panel">
              <div>
                <h3>Pruning reason</h3>
                <p>{queryResult.executionPlan.reason}</p>
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
            <div className="table-heading">
              <div>
                <h3>Affected Factories</h3>
                <p>Relational metadata and JSON document enrichment for factories returned by the graph traversal.</p>
              </div>
              <span className="badge green">{queryResult.affectedFactories.length} factories</span>
            </div>
            <div className="table-scroll">
              <table>
                <thead><tr><th>Factory</th><th>Name</th><th>Region</th><th>Risk</th><th>Doc Products</th></tr></thead>
                <tbody>
                  {queryResult.affectedFactories.slice(0, 25).map((factory) => (
                    <tr key={factory.factoryId}><td>{factory.factoryId}</td><td>{factory.factoryName}</td><td>{factory.region}</td><td>{factory.riskScore}</td><td>{factory.documentProductCount ?? "-"}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : <div className="empty-state"><strong>No execution plan yet</strong><p>Run a query in Query Lab to populate visited shards, pruned shards, BFS levels, and join steps.</p></div>}
      </section>

      <section id="benchmark" className="panel section-panel">
        <div className="section-heading">
          <div>
            <span className="section-kicker">5. Benchmark</span>
            <h2>Compare query behavior across modes</h2>
            <p>Benchmark runs the same materials across RANDOM+NAIVE, RANDOM+OPTIMIZED, METIS+NAIVE, and METIS+OPTIMIZED.</p>
          </div>
          <button className="secondary" onClick={runBenchmark} disabled={running}><BarChart3 size={16} />{benchmarkStatus === "running" ? "Running..." : "Run Benchmark"}</button>
        </div>
        <div className={`benchmark-status ${benchmarkStatus}`}>
          <strong>
            {benchmarkStatus === "running" && "Benchmark is running 12 comparable queries..."}
            {benchmarkStatus === "done" && `Benchmark complete: ${benchmarkRows.length} result rows${benchmarkRanAt ? ` at ${benchmarkRanAt}` : ""}.`}
            {benchmarkStatus === "failed" && "Benchmark failed. Check the error message above."}
            {benchmarkStatus === "idle" && "Click Run Benchmark to execute Steel, Lithium, and Palladium across all 4 mode combinations."}
          </strong>
          <p>NAIVE always broadcasts. The useful comparison is RANDOM+OPTIMIZED vs METIS+OPTIMIZED for the same material.</p>
        </div>
        <div className="compare-grid">
          <CompareBar title="Palladium Optimized Cost" leftLabel="RANDOM" leftValue={benchmarkValue(benchmarkRows, "Palladium", "RANDOM", "OPTIMIZED", "cost")} rightLabel="METIS" rightValue={benchmarkValue(benchmarkRows, "Palladium", "METIS", "OPTIMIZED", "cost")} suffix="ms" />
          <CompareBar title="Palladium Optimized Visits" leftLabel="RANDOM" leftValue={benchmarkValue(benchmarkRows, "Palladium", "RANDOM", "OPTIMIZED", "visited")} rightLabel="METIS" rightValue={benchmarkValue(benchmarkRows, "Palladium", "METIS", "OPTIMIZED", "visited")} suffix="" />
          <CompareBar title="Lithium Optimized Cost" leftLabel="RANDOM" leftValue={benchmarkValue(benchmarkRows, "Lithium", "RANDOM", "OPTIMIZED", "cost")} rightLabel="METIS" rightValue={benchmarkValue(benchmarkRows, "Lithium", "METIS", "OPTIMIZED", "cost")} suffix="ms" />
          <CompareBar title="Lithium Optimized Visits" leftLabel="RANDOM" leftValue={benchmarkValue(benchmarkRows, "Lithium", "RANDOM", "OPTIMIZED", "visited")} rightLabel="METIS" rightValue={benchmarkValue(benchmarkRows, "Lithium", "METIS", "OPTIMIZED", "visited")} suffix="" />
        </div>
        <div className="table-heading">
          <div>
            <h3>Benchmark Results</h3>
            <p>Same material, different routing and partition modes.</p>
          </div>
          <span className="badge green">{benchmarkRows.length} rows</span>
        </div>
        <div className="table-scroll">
          <table className="benchmark-table">
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
        </div>
      </section>

      <section id="topology" className="panel section-panel">
        <div className="section-heading">
          <div>
            <span className="section-kicker">6. Topology</span>
            <h2>Edge-Cut and cluster density insight</h2>
            <p>Topology measures partition quality on the factory-material projection graph before query execution.</p>
          </div>
        </div>
        <div className="compare-grid">
          <CompareBar title="Material Replication" leftLabel="RANDOM" leftValue={random?.materialReplication ?? 0} rightLabel="METIS" rightValue={metis?.materialReplication ?? 0} suffix="" />
          <CompareBar title="Edge-Cut Ratio" leftLabel="RANDOM" leftValue={random?.edgeCutRatio ?? 0} rightLabel="METIS" rightValue={metis?.edgeCutRatio ?? 0} suffix="" />
          <CompareBar title="Avg Visited Shards / Material" leftLabel="RANDOM" leftValue={random?.averageVisitedShardCountByMaterial ?? 0} rightLabel="METIS" rightValue={metis?.averageVisitedShardCountByMaterial ?? 0} suffix="" />
          <CompareBar title="Avg Cluster Density" leftLabel="RANDOM" leftValue={averageDensity(random)} rightLabel="METIS" rightValue={averageDensity(metis)} suffix="" />
        </div>
        <div className="topology-grid">
          <DistributionCard title="Node Count By Shard" random={random?.nodeCountByShard} metis={metis?.nodeCountByShard} />
          <DistributionCard title="Edge Count By Shard" random={random?.edgeCountByShard} metis={metis?.edgeCountByShard} />
        </div>
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

function DistributionCard({ title, random, metis }: { title: string; random?: Record<string, number>; metis?: Record<string, number> }) {
  return (
    <div className="compare-card">
      <h3>{title}</h3>
      <div className="distribution-table">
        <strong>Shard</strong><strong>RANDOM</strong><strong>METIS</strong>
        {allShards.map((shard) => (
          <div className="distribution-row" key={shard}>
            <span>{shard}</span>
            <span>{random?.[shard] ?? "-"}</span>
            <span>{metis?.[shard] ?? "-"}</span>
          </div>
        ))}
      </div>
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

function defaultCypherQuery() {
  return `MATCH (m:RawMaterial {name: $materialName, partitionMode: $partitionMode})
      <-[:USES]-(c:Component)
      <-[:HAS_COMPONENT]-(p:Part)
      <-[:CONTAINS]-(prd:Product)
      <-[:PRODUCES]-(f:Factory)
RETURN DISTINCT f.factoryId AS factoryId`;
}

function groupDirectoryRows(rows: MaterialDirectoryRow[]) {
  const byMaterial = new Map<string, { materialId: string; materialName: string; shards: string[]; factoryCount: number; componentCount: number }>();
  for (const row of rows) {
    const current = byMaterial.get(row.materialId) ?? {
      materialId: row.materialId,
      materialName: row.materialName,
      shards: [],
      factoryCount: 0,
      componentCount: 0
    };
    current.shards.push(row.shardId);
    current.factoryCount += Number(row.factoryCount ?? 0);
    current.componentCount += Number(row.componentCount ?? 0);
    byMaterial.set(row.materialId, current);
  }
  return Array.from(byMaterial.values()).map((row) => ({ ...row, shards: row.shards.sort() })).sort((left, right) => left.materialName.localeCompare(right.materialName));
}
