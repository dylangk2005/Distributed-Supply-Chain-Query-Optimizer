"use client";

import { useEffect, useState } from "react";

type Plan = {
  queryId: string;
  materialName: string;
  steps: string[];
  visitedShards: string[];
  prunedShards: string[];
  bfsLevels: Array<{ level: number; nodeType: string; count: number }>;
  cypherQuery?: string;
  cypherParams?: Record<string, string>;
  directoryQuery?: string;
  directoryParams?: Record<string, string>;
  reason?: string;
};

// Trang execution plan riêng: đọc plan gần nhất đã lưu khi user chạy query.
export default function ExecutionPlanPage() {
  const [plan, setPlan] = useState<Plan | null>(null);

  useEffect(() => {
    // Query page/dashboard lưu lastExecutionPlan vào sessionStorage để trang này có thể hiển thị lại.
    const value = sessionStorage.getItem("lastExecutionPlan");
    if (value) setPlan(JSON.parse(value));
  }, []);

  if (!plan) {
    return (
      <>
        <h1>Execution Plan</h1>
        <p>Run a query first to populate the latest execution plan.</p>
      </>
    );
  }

  return (
    <>
      <div className="title">
        <div>
          <h1>Execution Plan</h1>
          <p>{plan.queryId} · {plan.materialName}</p>
        </div>
      </div>
      {plan.reason && <section className="takeaway" style={{ marginBottom: 16 }}><p><b>Routing reason:</b> {plan.reason}</p></section>}
      <div className="steps">
        {plan.steps.map((step, index) => (
          <div className="step" key={step}>
            <strong>{index + 1}. {step}</strong>
            <span className="badge">{index === 1 ? `${plan.prunedShards.length} pruned` : "complete"}</span>
          </div>
        ))}
      </div>
      <section className="panel" style={{ marginTop: 16 }}>
        <h2>BFS Levels</h2>
        <div className="grid">
          {plan.bfsLevels.map((level) => (
            <div className="card" key={level.nodeType}>
              <div className="metric">{level.count}</div>
              <p>{level.level}. {level.nodeType}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="panel" style={{ marginTop: 16 }}>
        <h2>Query Text</h2>
        <div className="query-text-grid">
          <div>
            <h3>Cypher traversal query</h3>
            <pre className="query-code">{plan.cypherQuery ?? "Run a new query to capture Cypher text."}</pre>
            <p className="query-params">Params: {plan.cypherParams ? JSON.stringify(plan.cypherParams) : "none"}</p>
          </div>
          <div>
            <h3>SQL directory lookup</h3>
            <pre className="query-code">{plan.directoryQuery ?? "Skipped in NAIVE mode or not captured yet."}</pre>
            <p className="query-params">Params: {plan.directoryParams ? JSON.stringify(plan.directoryParams) : "none"}</p>
          </div>
        </div>
      </section>
    </>
  );
}
