import json
from collections import defaultdict

from graph_utils import (
    NUM_SHARDS,
    OUTPUT_DIR,
    build_partition_payload,
    factory_subgraphs,
    load_graph,
    node_maps,
    summarize,
    write_json,
)


"""METIS-based partitioning.

Script này tạo factory-material projection graph rồi dùng pymetis để gom
factories có raw material dependency giống nhau vào cùng shard. Mục tiêu là
giảm material replication và giảm số shards cần visit khi query OPTIMIZED.
"""

def weighted_factory_material_edges(nodes: list[dict], edges: list[dict]) -> dict[tuple[str, str], int]:
    """Tạo weighted projection edge Factory--RawMaterial.

    RARE material có weight cao hơn vì ta muốn METIS gom factories dùng
    rare material vào cùng shard để demo pruning rõ hơn.
    """
    by_id, _ = node_maps(nodes)
    weights = {"COMMON": 1, "MEDIUM": 3, "RARE": 14}
    result: dict[tuple[str, str], int] = defaultdict(int)
    for edge in edges:
        if edge["type"] != "USES":
            continue
        material = by_id[edge["target"]]["properties"]
        result[(edge["factoryId"], edge["target"])] += weights.get(material["frequencyGroup"], 1)
    return result


def refine_rare_material_outliers(nodes: list[dict], edges: list[dict], factory_to_shard: dict[str, int]) -> None:
    """Hậu xử lý để kéo các rare-material outliers về majority shard.

    Đây là heuristic nhỏ giúp giảm trường hợp một rare material bị rải quá nhiều shards,
    từ đó OPTIMIZED query có thể prune tốt hơn trong demo.
    """
    by_id, _ = node_maps(nodes)
    material_factories: dict[str, set[str]] = defaultdict(set)
    for edge in edges:
        if edge["type"] == "USES":
            material_factories[edge["target"]].add(edge["factoryId"])

    for material_id, factory_ids in sorted(material_factories.items()):
        material = by_id[material_id]["properties"]
        if material["frequencyGroup"] != "RARE":
            continue

        factories_by_shard: dict[int, list[str]] = defaultdict(list)
        for factory_id in factory_ids:
            factories_by_shard[factory_to_shard[factory_id]].append(factory_id)
        if len(factories_by_shard) <= 1:
            continue

        majority_shard, majority_factories = max(factories_by_shard.items(), key=lambda item: len(item[1]))
        outliers = [
            factory_id
            for shard, shard_factories in factories_by_shard.items()
            if shard != majority_shard and len(shard_factories) <= 2
            for factory_id in shard_factories
        ]
        if outliers and len(majority_factories) >= 20:
            for factory_id in outliers:
                factory_to_shard[factory_id] = majority_shard


def main() -> None:
    """Build projection graph, chạy pymetis, refine kết quả và ghi metis_partition_map.json."""
    try:
        import pymetis
    except ImportError as exc:
        raise SystemExit("pymetis is required. Install with: pip install -r partitioner/requirements.txt") from exc

    nodes, edges, _ = load_graph()
    projection_edges = weighted_factory_material_edges(nodes, edges)
    subgraphs = factory_subgraphs(nodes, edges)

    # projection_nodes gồm cả Factory và RawMaterial; METIS partition trên graph hai phía này.
    projection_nodes = sorted({item for edge in projection_edges for item in edge})
    index = {node_id: idx for idx, node_id in enumerate(projection_nodes)}
    reverse = {idx: node_id for node_id, idx in index.items()}
    adjacency: list[dict[int, int]] = [defaultdict(int) for _ in projection_nodes]
    for (source, target), weight in projection_edges.items():
        source_index = index[source]
        target_index = index[target]
        adjacency[source_index][target_index] += weight
        adjacency[target_index][source_index] += weight

    xadj = [0]
    adjncy = []
    eweights = []

    # Chuyển adjacency dạng dict sang CSR arrays mà pymetis yêu cầu.
    for values in adjacency:
        for neighbor, weight in sorted(values.items()):
            adjncy.append(neighbor)
            eweights.append(weight)
        xadj.append(len(adjncy))

    edgecuts, parts = pymetis.part_graph(NUM_SHARDS, xadj=xadj, adjncy=adjncy, eweights=eweights)
    factory_to_shard = {}

    # Chỉ Factory nodes quyết định shard của factory-subgraph.
    for idx, part_id in enumerate(parts):
        node_id = reverse[idx]
        if node_id.startswith("F_"):
            factory_to_shard[node_id] = int(part_id)

    # Isolated factories hiếm, nhưng nếu thiếu projection data thì gán deterministic để không mất factory.
    for ordinal, factory_id in enumerate(sorted(subgraphs)):
        factory_to_shard.setdefault(factory_id, ordinal % NUM_SHARDS)

    refine_rare_material_outliers(nodes, edges, factory_to_shard)

    payload = build_partition_payload(factory_to_shard, subgraphs)
    payload["partitionMode"] = "METIS"
    payload["metisEdgecuts"] = int(edgecuts)
    payload["summary"] = summarize(payload, edges)
    write_json(OUTPUT_DIR / "metis_partition_map.json", payload)
    print(json.dumps({**payload["summary"], "metisEdgecuts": int(edgecuts)}, indent=2))


if __name__ == "__main__":
    main()
