"use client";

import { Play } from "lucide-react";
import { useEffect, useState } from "react";
import { apiGet, apiPost } from "../api";

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

export default function BenchmarkPage() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLogs(await apiGet<Log[]>("/api/benchmark"));
  }

  async function run() {
    setLoading(true);
    try {
      await apiPost("/api/benchmark/run");
      await load();
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load().catch(() => setLogs([]));
  }, []);

  return (
    <>
      <div className="title">
        <div>
          <h1>Benchmark</h1>
          <p>Compare broadcast queries with material-directory pruning.</p>
        </div>
        <button onClick={run} disabled={loading}><Play size={16} />Run Benchmark</button>
      </div>
      <section className="panel">
        <table>
          <thead>
            <tr><th>Material</th><th>Partition</th><th>Mode</th><th>Time</th><th>Visited</th><th>Pruned</th><th>Factories</th></tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.queryId}>
                <td>{log.materialName}</td>
                <td>{log.partitionMode}</td>
                <td>{log.queryMode}</td>
                <td>{log.executionTimeMs}ms</td>
                <td>{log.visitedShards.length}</td>
                <td>{log.prunedShards.length}</td>
                <td>{log.affectedFactoryCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}

