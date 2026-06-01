import Link from "next/link";
import { apiGet } from "./api";

type DemoStatus = {
  status: string;
  activePartitionMode: string | null;
};

export default async function HomePage() {
  let demo: DemoStatus = { status: "unknown", activePartitionMode: null };
  try {
    demo = await apiGet<DemoStatus>("/api/demo/status");
  } catch {
    demo = { status: "offline", activePartitionMode: null };
  }

  return (
    <>
      <section className="hero">
        <div className="hero-main">
          <h1>Supply Chain Map Demo</h1>
          <p>Run the distributed graph optimizer demo from the browser: setup data, query affected factories, compare Random vs METIS, and review topology metrics.</p>
          <div className="actions">
            <Link href="/demo"><button>Start Demo</button></Link>
            <Link href="/query"><button className="secondary">Open Query</button></Link>
          </div>
        </div>
        <aside className="panel">
          <h2>System Readiness</h2>
          <p><span className={`status-dot ${demo.status}`} /> Backend: {demo.status}</p>
          <p>Active graph: {demo.activePartitionMode ?? "not imported"}</p>
          <p>Use the Demo page if data has not been prepared yet.</p>
        </aside>
      </section>
      <div className="grid">
        <Link className="card" href="/demo">
          <h2>Guided Demo</h2>
          <p>One place to setup data, import shards, and run the sample query.</p>
        </Link>
        <Link className="card" href="/query">
          <h2>Query Playground</h2>
          <p>Run shortage impact queries and inspect visited or pruned shards.</p>
        </Link>
        <Link className="card" href="/benchmark">
          <h2>Benchmark</h2>
          <p>Compare Random + Naive against METIS + Optimized.</p>
        </Link>
        <Link className="card" href="/topology">
          <h2>Topology</h2>
          <p>Review projection edge-cut, shard counts, and material replication.</p>
        </Link>
      </div>
    </>
  );
}
