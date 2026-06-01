import Link from "next/link";

export default function HomePage() {
  return (
    <>
      <div className="title">
        <div>
          <h1>Distributed Supply Chain Query Optimizer</h1>
          <p>Neo4j shards, PostgreSQL metadata, Random vs METIS partitioning.</p>
        </div>
      </div>
      <div className="grid">
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

