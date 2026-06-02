import json
import random

from graph_utils import NUM_SHARDS, OUTPUT_DIR, build_partition_payload, factory_subgraphs, load_graph, summarize, write_json


"""Random partition baseline.

Script này chia factory-subgraph ngẫu nhiên vào 5 shards.
Kết quả dùng để so sánh với METIS trong benchmark/topology.
"""

def main() -> None:
    """Load graph, random assign factories, rồi ghi random_partition_map.json."""
    nodes, edges, _ = load_graph()
    subgraphs = factory_subgraphs(nodes, edges)
    rng = random.Random(134)

    # Mỗi factory-subgraph được gán vào một shard ngẫu nhiên nhưng deterministic theo seed.
    factory_to_shard = {factory_id: rng.randint(0, NUM_SHARDS - 1) for factory_id in sorted(subgraphs)}

    # Payload chuẩn gồm factoryPartitionMap, nodePartitionMap và materialReplicaMap.
    payload = build_partition_payload(factory_to_shard, subgraphs)
    payload["partitionMode"] = "RANDOM"
    payload["summary"] = summarize(payload, edges)
    write_json(OUTPUT_DIR / "random_partition_map.json", payload)
    print(json.dumps(payload["summary"], indent=2))


if __name__ == "__main__":
    main()
