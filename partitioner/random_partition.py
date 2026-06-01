import json
import random

from graph_utils import OUTPUT_DIR, build_partition_payload, factory_subgraphs, load_graph, summarize, write_json


def main() -> None:
    nodes, edges, _ = load_graph()
    subgraphs = factory_subgraphs(nodes, edges)
    rng = random.Random(134)
    factory_to_shard = {factory_id: rng.randint(0, 2) for factory_id in sorted(subgraphs)}
    payload = build_partition_payload(factory_to_shard, subgraphs)
    payload["partitionMode"] = "RANDOM"
    payload["summary"] = summarize(payload, edges)
    write_json(OUTPUT_DIR / "random_partition_map.json", payload)
    print(json.dumps(payload["summary"], indent=2))


if __name__ == "__main__":
    main()
