import json

from graph_utils import (
    OUTPUT_DIR,
    build_partition_payload,
    factory_material_edges,
    factory_subgraphs,
    load_graph,
    summarize,
    write_json,
)


def main() -> None:
    try:
        import pymetis
    except ImportError as exc:
        raise SystemExit("pymetis is required. Install with: pip install -r partitioner/requirements.txt") from exc

    nodes, edges, _ = load_graph()
    projection_edges = factory_material_edges(nodes, edges)
    subgraphs = factory_subgraphs(nodes, edges)
    projection_nodes = sorted({item for edge in projection_edges for item in edge})
    index = {node_id: idx for idx, node_id in enumerate(projection_nodes)}
    reverse = {idx: node_id for node_id, idx in index.items()}
    adjacency = [set() for _ in projection_nodes]
    for source, target in projection_edges:
        source_index = index[source]
        target_index = index[target]
        adjacency[source_index].add(target_index)
        adjacency[target_index].add(source_index)

    edgecuts, parts = pymetis.part_graph(5, adjacency=[sorted(values) for values in adjacency])
    factory_to_shard = {}
    for idx, part_id in enumerate(parts):
        node_id = reverse[idx]
        if node_id.startswith("F_"):
            factory_to_shard[node_id] = int(part_id)

    # Isolated factories are unlikely, but assign them deterministically if projection data is missing.
    for ordinal, factory_id in enumerate(sorted(subgraphs)):
        factory_to_shard.setdefault(factory_id, ordinal % 5)

    payload = build_partition_payload(factory_to_shard, subgraphs)
    payload["partitionMode"] = "METIS"
    payload["metisEdgecuts"] = int(edgecuts)
    payload["summary"] = summarize(payload, edges)
    write_json(OUTPUT_DIR / "metis_partition_map.json", payload)
    print(json.dumps({**payload["summary"], "metisEdgecuts": int(edgecuts)}, indent=2))


if __name__ == "__main__":
    main()

