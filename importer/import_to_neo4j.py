import json
import os
import time
from collections import defaultdict
from typing import Iterable

from neo4j import GraphDatabase

from common import GENERATOR_DIR, PARTITIONER_DIR, load_json, shard_uris


LABELS = {"Factory", "Product", "Part", "Component", "RawMaterial"}
REL_TYPES = {"PRODUCES", "CONTAINS", "HAS_COMPONENT", "USES"}
BATCH_SIZE = 1000
CONNECT_RETRIES = 30
CONNECT_DELAY_SECONDS = 2


def label_for(node: dict) -> str:
    label = node["label"]
    if label not in LABELS:
        raise ValueError(f"Unsupported label: {label}")
    return label


def uid(mode: str, node_id: str) -> str:
    return f"{mode}:{node_id}"


def validate_subgraphs(edges: list[dict], partition: dict) -> None:
    factory_map = partition["factoryPartitionMap"]
    node_map = partition["nodePartitionMap"]
    material_map = partition["materialReplicaMap"]
    for edge in edges:
        factory_id = edge["factoryId"]
        shard = factory_map[factory_id]
        for node_id in [edge["source"], edge["target"]]:
            if node_id.startswith("RM_"):
                if shard not in material_map.get(node_id, []):
                    raise ValueError(f"Material {node_id} missing replica in {shard}")
            elif node_map.get(node_id) != shard:
                raise ValueError(f"Subgraph split for {factory_id}: {node_id} is not in {shard}")


def run_cypher_file(session, filename: str) -> None:
    path = os.path.join(os.path.dirname(__file__), filename)
    for statement in open(path, encoding="utf-8").read().split(";"):
        statement = statement.strip()
        if statement:
            session.run(statement)


def chunks(items: list[dict], size: int = BATCH_SIZE) -> Iterable[list[dict]]:
    for index in range(0, len(items), size):
        yield items[index:index + size]


def selected_modes() -> list[str]:
    mode = os.getenv("PARTITION_MODE", "ALL").upper()
    if mode == "ALL":
        return ["RANDOM", "METIS"]
    if mode in {"RANDOM", "METIS"}:
        return [mode]
    raise SystemExit("PARTITION_MODE must be ALL, RANDOM, or METIS")


def partition_file(mode: str) -> str:
    return "random_partition_map.json" if mode == "RANDOM" else "metis_partition_map.json"


def build_import_plan(mode: str, nodes_by_id: dict[str, dict], edges: list[dict], partition: dict) -> tuple[dict, dict]:
    validate_subgraphs(edges, partition)
    shard_nodes = defaultdict(lambda: defaultdict(dict))
    shard_edges = defaultdict(lambda: defaultdict(list))

    for node_id, shard_id in partition["nodePartitionMap"].items():
        node = nodes_by_id[node_id]
        props = dict(node["properties"])
        props["uid"] = uid(mode, node_id)
        props["partitionMode"] = mode
        props["shardId"] = shard_id
        shard_nodes[shard_id][label_for(node)][props["uid"]] = {"uid": props["uid"], "props": props}

    for material_id, shards in partition["materialReplicaMap"].items():
        node = nodes_by_id[material_id]
        for shard_id in shards:
            props = dict(node["properties"])
            props["uid"] = uid(mode, material_id)
            props["partitionMode"] = mode
            props["shardId"] = shard_id
            shard_nodes[shard_id]["RawMaterial"][props["uid"]] = {"uid": props["uid"], "props": props}

    for edge in edges:
        rel_type = edge["type"]
        if rel_type not in REL_TYPES:
            raise ValueError(f"Unsupported relationship type: {rel_type}")
        shard_id = partition["factoryPartitionMap"][edge["factoryId"]]
        shard_edges[shard_id][rel_type].append({
            "sourceUid": uid(mode, edge["source"]),
            "targetUid": uid(mode, edge["target"]),
        })

    return shard_nodes, shard_edges


def merge_plans(plans: list[tuple[dict, dict]]) -> tuple[dict, dict]:
    merged_nodes = defaultdict(lambda: defaultdict(dict))
    merged_edges = defaultdict(lambda: defaultdict(list))
    for shard_nodes, shard_edges in plans:
        for shard_id, by_label in shard_nodes.items():
            for label, rows in by_label.items():
                merged_nodes[shard_id][label].update(rows)
        for shard_id, by_type in shard_edges.items():
            for rel_type, rows in by_type.items():
                merged_edges[shard_id][rel_type].extend(rows)
    return merged_nodes, merged_edges


def import_nodes(session, label: str, rows: list[dict]) -> None:
    for batch in chunks(rows):
        session.run(
            f"""
            UNWIND $rows AS row
            MERGE (n:{label} {{uid: row.uid}})
            SET n += row.props
            """,
            rows=batch,
        )


def import_relationships(session, rel_type: str, rows: list[dict]) -> None:
    for batch in chunks(rows):
        session.run(
            f"""
            UNWIND $rows AS row
            MATCH (a {{uid: row.sourceUid}})
            MATCH (b {{uid: row.targetUid}})
            MERGE (a)-[:{rel_type}]->(b)
            """,
            rows=batch,
        )


def connect_driver(uri: str, user: str, password: str):
    last_error = None
    for attempt in range(1, CONNECT_RETRIES + 1):
        driver = GraphDatabase.driver(uri, auth=(user, password))
        try:
            driver.verify_connectivity()
            return driver
        except Exception as exc:
            last_error = exc
            driver.close()
            if attempt < CONNECT_RETRIES:
                time.sleep(CONNECT_DELAY_SECONDS)
    raise RuntimeError(f"Neo4j at {uri} was not ready after {CONNECT_RETRIES} attempts") from last_error


def main() -> None:
    modes = selected_modes()
    nodes = load_json(GENERATOR_DIR / "nodes.json")
    edges = load_json(GENERATOR_DIR / "edges.json")
    nodes_by_id = {node["id"]: node for node in nodes}

    plans = []
    for mode in modes:
        partition = load_json(PARTITIONER_DIR / partition_file(mode))
        plans.append(build_import_plan(mode, nodes_by_id, edges, partition))
    shard_nodes, shard_edges = merge_plans(plans)

    user = os.getenv("NEO4J_USER", "neo4j")
    password = os.getenv("NEO4J_PASSWORD", "password123")
    summary = {}
    for shard_id, uri in shard_uris().items():
        driver = connect_driver(uri, user, password)
        with driver.session() as session:
            run_cypher_file(session, "clear_neo4j.cypher")
            run_cypher_file(session, "create_indexes.cypher")
            for label, rows_by_uid in shard_nodes[shard_id].items():
                import_nodes(session, label, list(rows_by_uid.values()))
            for rel_type, rows in shard_edges[shard_id].items():
                import_relationships(session, rel_type, rows)
        driver.close()
        summary[shard_id] = {
            "nodes": sum(len(rows) for rows in shard_nodes[shard_id].values()),
            "edges": sum(len(rows) for rows in shard_edges[shard_id].values()),
        }
    print(json.dumps({"partitionModes": modes, "summary": summary}, indent=2))


if __name__ == "__main__":
    main()
