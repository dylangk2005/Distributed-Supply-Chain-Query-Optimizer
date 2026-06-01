import json
from collections import defaultdict, deque
from pathlib import Path
from typing import Any


INPUT_DIR = Path("/app/input") if Path("/app/input").exists() else Path(__file__).resolve().parent.parent / "generator" / "output"
OUTPUT_DIR = Path("/app/output") if Path("/app/output").exists() else Path(__file__).resolve().parent / "output"
NUM_SHARDS = 4
SHARDS = [f"shard_{index}" for index in range(1, NUM_SHARDS + 1)]


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def load_graph() -> tuple[list[dict], list[dict], list[dict]]:
    return (
        load_json(INPUT_DIR / "nodes.json"),
        load_json(INPUT_DIR / "edges.json"),
        load_json(INPUT_DIR / "raw_materials.json"),
    )


def node_maps(nodes: list[dict]) -> tuple[dict[str, dict], dict[str, str]]:
    by_id = {node["id"]: node for node in nodes}
    labels = {node["id"]: node["label"] for node in nodes}
    return by_id, labels


def factory_subgraphs(nodes: list[dict], edges: list[dict]) -> dict[str, set[str]]:
    _, labels = node_maps(nodes)
    children: dict[str, list[str]] = defaultdict(list)
    for edge in edges:
        children[edge["source"]].append(edge["target"])

    result: dict[str, set[str]] = {}
    factories = [node["id"] for node in nodes if node["label"] == "Factory"]
    for factory_id in factories:
        seen = {factory_id}
        queue = deque([factory_id])
        while queue:
            current = queue.popleft()
            for child in children.get(current, []):
                seen.add(child)
                if labels.get(child) != "RawMaterial":
                    queue.append(child)
        result[factory_id] = seen
    return result


def build_partition_payload(factory_to_shard: dict[str, int], subgraphs: dict[str, set[str]]) -> dict:
    node_partition: dict[str, str] = {}
    material_replicas: dict[str, set[str]] = defaultdict(set)
    factory_partition: dict[str, str] = {}

    for factory_id, shard_index in factory_to_shard.items():
        shard_id = SHARDS[shard_index]
        factory_partition[factory_id] = shard_id
        for node_id in subgraphs[factory_id]:
            if node_id.startswith("RM_"):
                material_replicas[node_id].add(shard_id)
            else:
                node_partition[node_id] = shard_id

    return {
        "factoryPartitionMap": dict(sorted(factory_partition.items())),
        "nodePartitionMap": dict(sorted(node_partition.items())),
        "materialReplicaMap": {key: sorted(value) for key, value in sorted(material_replicas.items())},
        "shards": SHARDS,
    }


def factory_material_edges(nodes: list[dict], edges: list[dict]) -> list[tuple[str, str]]:
    by_id, _ = node_maps(nodes)
    subgraphs = factory_subgraphs(nodes, edges)
    output = set()
    for factory_id, node_ids in subgraphs.items():
        for node_id in node_ids:
            if by_id.get(node_id, {}).get("label") == "RawMaterial":
                output.add((factory_id, node_id))
    return sorted(output)


def shard_index(shard_id: str) -> int:
    return int(shard_id.split("_")[1]) - 1


def summarize(payload: dict, edges: list[dict]) -> dict:
    factory_counts = defaultdict(int)
    node_counts = defaultdict(int)
    for shard in payload["factoryPartitionMap"].values():
        factory_counts[shard] += 1
    for shard in payload["nodePartitionMap"].values():
        node_counts[shard] += 1
    for shards in payload["materialReplicaMap"].values():
        for shard in shards:
            node_counts[shard] += 1
    return {
        "factoryCountByShard": {shard: factory_counts[shard] for shard in SHARDS},
        "nodeCountByShard": {shard: node_counts[shard] for shard in SHARDS},
        "totalFactories": len(payload["factoryPartitionMap"]),
        "totalNodesAssigned": sum(node_counts.values()),
        "totalEdges": len(edges),
    }
