"use client";

import Link from "next/link";
import { Database, Play, RefreshCw, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { apiGet, apiPost } from "../api";

type Step = { name: string; status: "pending" | "running" | "done" | "failed"; summary: string };
type DemoState = {
  status: "idle" | "running" | "ready" | "failed";
  activeStep: string | null;
  activePartitionMode: "RANDOM" | "METIS" | null;
  steps: Step[];
  logs: string[];
  lastError?: string;
};
type QueryResult = { metrics: { visitedShardCount: number; prunedShardCount: number; affectedFactoryCount: number; executionTimeMs: number } };

const statusLabel: Record<string, string> = {
  pending: "Pending",
  running: "Running",
  done: "Done",
  failed: "Failed"
};

export default function DemoPage() {
  const [state, setState] = useState<DemoState | null>(null);
  const [busy, setBusy] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [sample, setSample] = useState<QueryResult | null>(null);
  const [error, setError] = useState("");

  async function load() {
    const data = await apiGet<DemoState>("/api/demo/status");
    setState(data);
    return data;
  }

  async function action(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      const result = await fn();
      if (result && typeof result === "object" && "metrics" in result) {
        setSample(result as QueryResult);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load().catch(() => setError("Backend is not reachable."));
    const timer = window.setInterval(() => {
      load().catch(() => undefined);
    }, 2500);
    return () => window.clearInterval(timer);
  }, []);

  const running = state?.status === "running" || busy;

  return (
    <>
      <div className="title">
        <div>
          <h1>Guided Demo</h1>
          <p>Prepare data, import shards, run a sample query, then open the result pages.</p>
        </div>
        <span className={`badge ${state?.status === "ready" ? "green" : state?.status === "failed" ? "red" : "amber"}`}>
          {state?.status ?? "loading"}
        </span>
      </div>

      <section className="panel">
        <div className="grid">
          <div>
            <p>Active graph</p>
            <div className="metric">{state?.activePartitionMode ?? "None"}</div>
          </div>
          <div>
            <p>Current step</p>
            <div className="metric">{state?.activeStep ?? "Idle"}</div>
          </div>
          <div>
            <p>Sample query</p>
            <div className="metric">{sample ? `${sample.metrics.visitedShardCount}/${sample.metrics.prunedShardCount}` : "-"}</div>
            <p>visited / pruned</p>
          </div>
        </div>
        <div className="actions">
          <button onClick={() => action(() => apiPost("/api/demo/setup"))} disabled={running}><Play size={16} />Run Full Setup</button>
          <button className="secondary" onClick={() => action(() => apiPost("/api/demo/import-neo4j", { partitionMode: "RANDOM" }))} disabled={running}><Database size={16} />Import RANDOM</button>
          <button className="green" onClick={() => action(() => apiPost("/api/demo/import-neo4j", { partitionMode: "METIS" }))} disabled={running}><Database size={16} />Import METIS</button>
          <button className="amber" onClick={() => action(() => apiPost("/api/demo/sample-query"))} disabled={running}><RefreshCw size={16} />Run Sample Query</button>
          <button className="secondary" onClick={() => action(() => apiPost("/api/demo/reset"))} disabled={running}><RotateCcw size={16} />Reset View</button>
        </div>
      </section>

      {error && <section className="empty-state" style={{ marginTop: 16 }}><strong>{error}</strong><p>Start Docker services first, then return to this page.</p></section>}

      <section className="panel" style={{ marginTop: 16 }}>
        <h2>Demo Steps</h2>
        <div className="stepper">
          {(state?.steps ?? []).map((step, index) => (
            <div className="demo-step" key={step.name}>
              <span className={`status-dot ${step.status}`} />
              <div>
                <strong>{index + 1}. {step.name}</strong>
                <p>{step.summary}</p>
              </div>
              <span className={`badge ${step.status === "done" ? "green" : step.status === "failed" ? "red" : step.status === "running" ? "amber" : ""}`}>{statusLabel[step.status]}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <div className="title">
          <div>
            <h2>Next Screens</h2>
            <p>Use these after setup finishes.</p>
          </div>
        </div>
        <div className="grid">
          <Link className="card" href="/query"><h3>Query Optimizer</h3><p>Run Steel, Lithium, or Palladium shortage queries.</p></Link>
          <Link className="card" href="/execution-plan"><h3>Execution Plan</h3><p>Inspect shard pruning and BFS levels.</p></Link>
          <Link className="card" href="/benchmark"><h3>Benchmark</h3><p>Compare Random + Naive vs METIS + Optimized.</p></Link>
          <Link className="card" href="/topology"><h3>Topology</h3><p>Review projection edge-cut and material replication.</p></Link>
        </div>
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <button className="secondary" onClick={() => setShowLogs((value) => !value)}>{showLogs ? "Hide Logs" : "Show Logs"}</button>
        {showLogs && <pre className="log-panel">{state?.logs.join("\n")}</pre>}
      </section>
    </>
  );
}

