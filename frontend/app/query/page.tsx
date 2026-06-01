"use client";

import { Play } from "lucide-react";
import { useState } from "react";
import { apiPost } from "../api";

type QueryResponse = {
  queryId: string;
  affectedFactories: Array<{ factoryId: string; factoryName: string; region: string; riskScore: number }>;
  executionPlan: {
    steps: string[];
    visitedShards: string[];
    prunedShards: string[];
    bfsLevels: Array<{ level: number; nodeType: string; count: number }>;
  };
  metrics: {
    executionTimeMs: number;
    visitedShardCount: number;
    prunedShardCount: number;
    affectedFactoryCount: number;
  };
};

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

  return (
    <>
      <div className="title">
        <div>
          <h1>Query Playground</h1>
          <p>Find factories affected by a raw material shortage.</p>
        </div>
      </div>
      <section className="panel">
        <div className="form">
          <label>
            Material
            <input value={materialName} onChange={(event) => setMaterialName(event.target.value)} />
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
      {error && <p>{error}</p>}
      {result && (
        <>
          <div className="grid" style={{ marginTop: 16 }}>
            <div className="card"><div className="metric">{result.metrics.executionTimeMs}ms</div><p>Execution time</p></div>
            <div className="card"><div className="metric">{result.metrics.visitedShardCount}</div><p>Visited shards</p></div>
            <div className="card"><div className="metric">{result.metrics.prunedShardCount}</div><p>Pruned shards</p></div>
            <div className="card"><div className="metric">{result.metrics.affectedFactoryCount}</div><p>Affected factories</p></div>
          </div>
          <section className="panel" style={{ marginTop: 16 }}>
            <h2>Shard Plan</h2>
            <p>Visited</p>
            <div className="badge-row">{result.executionPlan.visitedShards.map((item) => <span className="badge green" key={item}>{item}</span>)}</div>
            <p>Pruned</p>
            <div className="badge-row">{result.executionPlan.prunedShards.map((item) => <span className="badge red" key={item}>{item}</span>)}</div>
          </section>
          <section className="panel" style={{ marginTop: 16 }}>
            <h2>Affected Factories</h2>
            <table>
              <thead><tr><th>Factory</th><th>Name</th><th>Region</th><th>Risk</th></tr></thead>
              <tbody>
                {result.affectedFactories.slice(0, 50).map((factory) => (
                  <tr key={factory.factoryId}>
                    <td>{factory.factoryId}</td>
                    <td>{factory.factoryName}</td>
                    <td>{factory.region}</td>
                    <td>{factory.riskScore}</td>
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

