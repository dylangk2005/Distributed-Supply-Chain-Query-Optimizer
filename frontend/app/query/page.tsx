"use client";

import { Play } from "lucide-react";
import { useState } from "react";
import { apiPost } from "../api";

type QueryResponse = {
  queryId: string;
  affectedFactories: Array<{ factoryId: string; factoryName: string; region: string; riskScore: number; documentProductCount?: number }>;
  executionPlan: {
    queryMode: string;
    partitionMode: string;
    materialName: string;
    steps: string[];
    visitedShards: string[];
    prunedShards: string[];
    bfsLevels: Array<{ level: number; nodeType: string; count: number }>;
    cypherQuery: string;
    cypherParams: Record<string, string>;
    directoryQuery?: string;
    directoryParams?: Record<string, string>;
    reason: string;
  };
  metrics: {
    executionTimeMs: number;
    estimatedDistributedCostMs: number;
    visitedShardCount: number;
    prunedShardCount: number;
    affectedFactoryCount: number;
  };
};

const scenarios = [
  { label: "Broad impact", materialName: "Steel", partitionMode: "RANDOM", queryMode: "NAIVE" },
  { label: "Medium impact", materialName: "Lithium", partitionMode: "METIS", queryMode: "OPTIMIZED" },
  { label: "Best pruning", materialName: "Palladium", partitionMode: "METIS", queryMode: "OPTIMIZED" }
];

const allShards = ["shard_1", "shard_2", "shard_3", "shard_4", "shard_5"];

export default function QueryPage() {
  const [materialName, setMaterialName] = useState("Lithium");
  const [partitionMode, setPartitionMode] = useState("METIS");
  const [queryMode, setQueryMode] = useState("OPTIMIZED");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<QueryResponse | null>(null);
  const [error, setError] = useState("");

  async function runQuery() {
    setLoading(true);
    setError("");
    try {
      const data = await apiPost<QueryResponse>("/api/query", { materialName, partitionMode, queryMode });
      setResult(data);
      sessionStorage.setItem("lastExecutionPlan", JSON.stringify(data.executionPlan));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Query failed");
    } finally {
      setLoading(false);
    }
  }

  function applyScenario(scenario: typeof scenarios[number]) {
    setMaterialName(scenario.materialName);
    setPartitionMode(scenario.partitionMode);
    setQueryMode(scenario.queryMode);
  }

  return (
    <>
      <div className="title">
        <div>
          <h1>Query Playground</h1>
          <p>Find factories affected by a raw material shortage.</p>
        </div>
      </div>
      <section className="panel">
        <div className="actions" style={{ marginTop: 0, marginBottom: 14 }}>
          {scenarios.map((scenario) => (
            <button className="secondary" key={scenario.label} onClick={() => applyScenario(scenario)}>{scenario.label}</button>
          ))}
        </div>
        <div className="form">
          <label>
            Material
            <select value={materialName} onChange={(event) => setMaterialName(event.target.value)}>
              <option>Steel</option>
              <option>Lithium</option>
              <option>Palladium</option>
              <option>Copper</option>
              <option>Nickel</option>
            </select>
          </label>
          <label>
            Partition
            <select value={partitionMode} onChange={(event) => setPartitionMode(event.target.value)}>
              <option>RANDOM</option>
              <option>METIS</option>
            </select>
          </label>
          <label>
            Query mode
            <select value={queryMode} onChange={(event) => setQueryMode(event.target.value)}>
              <option>NAIVE</option>
              <option>OPTIMIZED</option>
            </select>
          </label>
          <button onClick={runQuery} disabled={loading}><Play size={16} />Run Query</button>
        </div>
      </section>
      {error && <section className="empty-state" style={{ marginTop: 16 }}><strong>Query failed</strong><p>{error}</p><p>Open the Demo page and run setup if data is not imported yet.</p></section>}
      {!result && !error && (
        <section className="empty-state" style={{ marginTop: 16 }}>
          <strong>No query result yet</strong>
          <p>Choose a scenario, then run the query. Use Best pruning for the clearest METIS demo.</p>
        </section>
      )}
      {result && (
        <>
          <div className="grid" style={{ marginTop: 16 }}>
            <div className="card"><div className="metric">{result.metrics.estimatedDistributedCostMs}ms</div><p>Distributed cost</p></div>
            <div className="card"><div className="metric">{result.metrics.executionTimeMs}ms</div><p>Runtime</p></div>
            <div className="card"><div className="metric">{result.metrics.visitedShardCount}</div><p>Visited shards</p></div>
            <div className="card"><div className="metric">{result.metrics.prunedShardCount}</div><p>Pruned shards</p></div>
          </div>
          <section className="panel" style={{ marginTop: 16 }}>
            <span className="section-kicker">Deliverable: Execution Plan</span>
            <h2>Shard Plan</h2>
            <p>{result.executionPlan.reason}</p>
            <div className="shard-grid">
              {allShards.map((shard) => {
                const status = result.executionPlan.visitedShards.includes(shard) ? "visited" : result.executionPlan.prunedShards.includes(shard) ? "pruned" : "";
                return <div className={`shard-box ${status}`} key={shard}><strong>{shard}</strong><p>{status || "idle"}</p></div>;
              })}
            </div>
            <div className="execution-flow">
              {result.executionPlan.steps.map((step) => <span className="flow-step" key={step}>{step}</span>)}
            </div>
            <div className="bfs-grid">
              {result.executionPlan.bfsLevels.map((level) => (
                <div className="bfs-card" key={level.nodeType}><strong>{level.nodeType}</strong><span>{level.count}</span></div>
              ))}
            </div>
            <div className="query-text-grid" style={{ marginTop: 16 }}>
              <div>
                <h3>Cypher traversal query</h3>
                <pre className="query-code">{result.executionPlan.cypherQuery}</pre>
                <p className="query-params">Params: {JSON.stringify(result.executionPlan.cypherParams)}</p>
              </div>
              <div>
                <h3>SQL directory lookup</h3>
                <pre className="query-code">{result.executionPlan.directoryQuery ?? "Skipped in NAIVE mode. NAIVE broadcasts the query to every shard."}</pre>
                <p className="query-params">Params: {result.executionPlan.directoryParams ? JSON.stringify(result.executionPlan.directoryParams) : "none"}</p>
              </div>
            </div>
          </section>
          <section className="panel" style={{ marginTop: 16 }}>
            <h2>Affected Factories</h2>
            <table>
              <thead><tr><th>Factory</th><th>Name</th><th>Region</th><th>Risk</th><th>Doc Products</th></tr></thead>
              <tbody>
                {result.affectedFactories.slice(0, 50).map((factory) => (
                  <tr key={factory.factoryId}>
                    <td>{factory.factoryId}</td>
                    <td>{factory.factoryName}</td>
                    <td>{factory.region}</td>
                    <td>{factory.riskScore}</td>
                    <td>{factory.documentProductCount ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </>
  );
}
