import json
from collections import defaultdict

from graph_utils import OUTPUT_DIR, load_graph, load_json, node_maps, write_json


def build(mode: str, partition: dict, nodes: list[dict], edges: list[dict]) -> list[dict]:
    by_id, _ = node_maps(nodes)
    component_counts = defaultdict(int)
    factory_sets = defaultdict(set)
    for edge in edges:
        if edge["type"] == "USES":
            material_id = edge["target"]
            factory_id = edge["factoryId"]
            shard_id = partition["factoryPartitionMap"][factory_id]
            component_counts[(material_id, shard_id)] += 1
            factory_sets[(material_id, shard_id)].add(factory_id)

    records = []
    for material_id, shards in sorted(partition["materialReplicaMap"].items()):
        material = by_id[material_id]["properties"]
        for shard_id in shards:
            records.append({
                "partitionMode": mode,
                "materialId": material_id,
                "materialName": material["name"],
                "shardId": shard_id,
                "componentCount": component_counts[(material_id, shard_id)],
                "factoryCount": len(factory_sets[(material_id, shard_id)]),
            })
    return records


def main() -> None:
    nodes, edges, _ = load_graph()
    random_partition = load_json(OUTPUT_DIR / "random_partition_map.json")
    metis_partition = load_json(OUTPUT_DIR / "metis_partition_map.json")
    random_directory = build("RANDOM", random_partition, nodes, edges)
    metis_directory = build("METIS", metis_partition, nodes, edges)
    write_json(OUTPUT_DIR / "random_material_directory.json", random_directory)
    write_json(OUTPUT_DIR / "metis_material_directory.json", metis_directory)
    print(json.dumps({"random": len(random_directory), "metis": len(metis_directory)}, indent=2))


if __name__ == "__main__":
    main()

