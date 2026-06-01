import json
from collections import defaultdict

from graph_utils import OUTPUT_DIR, SHARDS, factory_material_edges, load_graph, load_json, write_json


def metrics_for(mode: str, partition: dict, projection_edges: list[tuple[str, str]]) -> dict:
    material_replicas = partition["materialReplicaMap"]
    factory_map = partition["factoryPartitionMap"]
    cross = 0
    edge_count_by_shard = defaultdict(int)
    for factory_id, material_id in projection_edges:
        factory_shard = factory_map[factory_id]
        material_shards = material_replicas.get(material_id, [])
        if len(material_shards) > 1:
            cross += 1
        edge_count_by_shard[factory_shard] += 1

    material_replication = sum(len(value) for value in material_replicas.values()) / max(len(material_replicas), 1)
    node_count_by_shard = {shard: 0 for shard in SHARDS}
    for shard in partition["nodePartitionMap"].values():
        node_count_by_shard[shard] += 1
    for shards in material_replicas.values():
        for shard in shards:
            node_count_by_shard[shard] += 1

    return {
        "partitionMode": mode,
        "projectionNodes": len(set([node_id for edge in projection_edges for node_id in edge])),
        "projectionEdges": len(projection_edges),
        "crossShardEdges": cross,
        "edgeCutRatio": round(cross / max(len(projection_edges), 1), 4),
        "materialReplication": round(material_replication, 4),
        "nodeCountByShard": node_count_by_shard,
        "edgeCountByShard": {shard: edge_count_by_shard[shard] for shard in SHARDS},
        "expectedVisitedShardCountByMaterial": {
            material_id: len(shards) for material_id, shards in sorted(material_replicas.items())
        },
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
