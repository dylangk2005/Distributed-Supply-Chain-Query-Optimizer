import { apiGet } from "../api";

type Metrics = {
  projectionNodes: number;
  projectionEdges: number;
  crossShardEdges: number;
  edgeCutRatio: number;
  materialReplication: number;
  averageVisitedShardCountByMaterial: number;
  nodeCountByShard: Record<string, number>;
  clusterDensityByShard: Record<string, number>;
};

// Server component đọc topology metrics đã import từ PostgreSQL.
export default async function TopologyPage() {
  let data: Record<string, Metrics> = {};
  try {
    // Nếu backend chưa sẵn sàng hoặc chưa import metrics, trang vẫn render empty state an toàn.
    data = await apiGet<Record<string, Metrics>>("/api/topology");
  } catch {
    data = {};
  }
  const modes = Object.entries(data);

  return (
    <>
      <div className="title">
        <div>
          <h1>Topology</h1>
          <p>Projection graph metrics for Random and METIS partitions.</p>
        </div>
      </div>
      <div className="grid">
        {modes.map(([mode, metrics]) => (
          <section className="card" key={mode}>
            <h2>{mode.toUpperCase()}</h2>
            <p>Projection nodes</p>
            <div className="metric">{metrics.projectionNodes}</div>
            <p>Projection edges</p>
            <div className="metric">{metrics.projectionEdges}</div>
            <p>Edge-cut ratio</p>
            <div className="bar"><span style={{ width: `${Math.min(metrics.edgeCutRatio * 100, 100)}%` }} /></div>
            <p>{metrics.edgeCutRatio}</p>
            <p>Material replication</p>
            <div className="metric">{metrics.materialReplication}</div>
            <p>Avg visited shards / material</p>
            <div className="metric">{metrics.averageVisitedShardCountByMaterial}</div>
          </section>
        ))}
      </div>
      <section className="panel" style={{ marginTop: 16 }}>
        <h2>Demo Takeaway</h2>
        <p>Lower material replication means the coordinator can query fewer shards for the same raw material. In this dataset, METIS groups factories with similar material dependencies.</p>
      </section>
      <section className="panel" style={{ marginTop: 16 }}>
        <h2>Shard Node Counts</h2>
        <div className="grid">
          {modes.flatMap(([mode, metrics]) =>
            Object.entries(metrics.nodeCountByShard ?? {}).map(([shard, count]) => (
              <div className="card" key={`${mode}-${shard}`}>
                <strong>{mode.toUpperCase()} · {shard}</strong>
                <div className="metric">{count}</div>
              </div>
            ))
          )}
        </div>
      </section>
      <section className="panel" style={{ marginTop: 16 }}>
        <h2>Cluster Density</h2>
        <div className="grid">
          {modes.flatMap(([mode, metrics]) =>
            Object.entries(metrics.clusterDensityByShard ?? {}).map(([shard, density]) => (
              <div className="card" key={`${mode}-${shard}-density`}>
                <strong>{mode.toUpperCase()} · {shard}</strong>
                <div className="metric">{density}</div>
              </div>
            ))
          )}
        </div>
      </section>
    </>
  );
}
