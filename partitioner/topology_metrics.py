import json
from collections import defaultdict

from graph_utils import OUTPUT_DIR, SHARDS, factory_material_edges, load_graph, load_json, write_json


def metrics_for(mode: str, partition: dict, projection_edges: list[tuple[str, str]]) -> dict:
    material_replicas = partition["materialReplicaMap"]
    factory_map = partition["factoryPartitionMap"]
    cross = 0
    edge_count_by_shard = defaultdict(int)
    factory_count_by_shard = defaultdict(set)
    material_count_by_shard = defaultdict(set)
    for factory_id, material_id in projection_edges:
        factory_shard = factory_map[factory_id]
        material_shards = material_replicas.get(material_id, [])
        if len(material_shards) > 1:
            cross += 1
        edge_count_by_shard[factory_shard] += 1
        factory_count_by_shard[factory_shard].add(factory_id)
        material_count_by_shard[factory_shard].add(material_id)

    material_replication = sum(len(value) for value in material_replicas.values()) / max(len(material_replicas), 1)
    node_count_by_shard = {shard: 0 for shard in SHARDS}
    for shard in partition["nodePartitionMap"].values():
        node_count_by_shard[shard] += 1
    for shards in material_replicas.values():
        for shard in shards:
            node_count_by_shard[shard] += 1

    cluster_density_by_shard = {}
    for shard in SHARDS:
        possible_edges = len(factory_count_by_shard[shard]) * len(material_count_by_shard[shard])
        cluster_density_by_shard[shard] = round(edge_count_by_shard[shard] / max(possible_edges, 1), 4)

    visited_counts = {material_id: len(shards) for material_id, shards in sorted(material_replicas.items())}

    return {
        "partitionMode": mode,
        "projectionNodes": len(set([node_id for edge in projection_edges for node_id in edge])),
        "projectionEdges": len(projection_edges),
        "crossShardEdges": cross,
        "edgeCutRatio": round(cross / max(len(projection_edges), 1), 4),
        "materialReplication": round(material_replication, 4),
        "averageVisitedShardCountByMaterial": round(sum(visited_counts.values()) / max(len(visited_counts), 1), 4),
        "nodeCountByShard": node_count_by_shard,
        "edgeCountByShard": {shard: edge_count_by_shard[shard] for shard in SHARDS},
        "clusterDensityByShard": cluster_density_by_shard,
        "expectedVisitedShardCountByMaterial": visited_counts,
    }


def main() -> None:
    nodes, edges, _ = load_graph()
    projection_edges = factory_material_edges(nodes, edges)
    random_partition = load_json(OUTPUT_DIR / "random_partition_map.json")
    metis_partition = load_json(OUTPUT_DIR / "metis_partition_map.json")
    random_metrics = metrics_for("RANDOM", random_partition, projection_edges)
    metis_metrics = metrics_for("METIS", metis_partition, projection_edges)
    write_json(OUTPUT_DIR / "random_topology_metrics.json", random_metrics)
    write_json(OUTPUT_DIR / "metis_topology_metrics.json", metis_metrics)
    print(json.dumps({"random": random_metrics, "metis": metis_metrics}, indent=2))


if __name__ == "__main__":
    main()
