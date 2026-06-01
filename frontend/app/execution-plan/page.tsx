"use client";

import { useEffect, useState } from "react";

type Plan = {
  queryId: string;
  materialName: string;
  steps: string[];
  visitedShards: string[];
  prunedShards: string[];
  bfsLevels: Array<{ level: number; nodeType: string; count: number }>;
};

export default function ExecutionPlanPage() {
  const [plan, setPlan] = useState<Plan | null>(null);

  useEffect(() => {
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
    </>
  );
}

