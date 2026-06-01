import json
import os
from collections import defaultdict

from neo4j import GraphDatabase

from common import GENERATOR_DIR, PARTITIONER_DIR, load_json, shard_uris


REL_TYPES = {"PRODUCES", "CONTAINS", "HAS_COMPONENT", "USES"}


def label_for(node: dict) -> str:
    label = node["label"]
    if label not in {"Factory", "Product", "Part", "Component", "RawMaterial"}:
        raise ValueError(f"Unsupported label: {label}")
    return label


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


def create_node(session, node: dict, shard_id: str, partition_mode: str) -> None:
    label = label_for(node)
    props = dict(node["properties"])
    props["partitionMode"] = partition_mode
    props["shardId"] = shard_id
    key_by_label = {
        "Factory": "factoryId",
        "Product": "productId",
        "Part": "partId",
        "Component": "componentId",
        "RawMaterial": "materialId",
    }
    key = key_by_label[label]
    session.run(
        f"MERGE (n:{label} {{{key}: $id}}) SET n += $props",
        id=props[key],
        props=props,
    )


def create_relationship(session, source: dict, target: dict, rel_type: str) -> None:
    if rel_type not in REL_TYPES:
        raise ValueError(f"Unsupported relationship type: {rel_type}")
    key_by_label = {
        "Factory": "factoryId",
        "Product": "productId",
        "Part": "partId",
        "Component": "componentId",
        "RawMaterial": "materialId",
    }
    source_label = label_for(source)
    target_label = label_for(target)
    source_key = key_by_label[source_label]
    target_key = key_by_label[target_label]
    session.run(
        f"""
        MATCH (a:{source_label} {{{source_key}: $sourceId}})
        MATCH (b:{target_label} {{{target_key}: $targetId}})
        MERGE (a)-[:{rel_type}]->(b)
        """,
        sourceId=source["properties"][source_key],
        targetId=target["properties"][target_key],
    )


def main() -> None:
    mode = os.getenv("PARTITION_MODE", "RANDOM").upper()
    if mode not in {"RANDOM", "METIS"}:
        raise SystemExit("PARTITION_MODE must be RANDOM or METIS")
    partition_file = "random_partition_map.json" if mode == "RANDOM" else "metis_partition_map.json"

    nodes = load_json(GENERATOR_DIR / "nodes.json")
    edges = load_json(GENERATOR_DIR / "edges.json")
    partition = load_json(PARTITIONER_DIR / partition_file)
    validate_subgraphs(edges, partition)

    nodes_by_id = {node["id"]: node for node in nodes}
    shard_nodes = defaultdict(dict)
    shard_edges = defaultdict(list)
    for node_id, shard_id in partition["nodePartitionMap"].items():
        shard_nodes[shard_id][node_id] = nodes_by_id[node_id]
    for material_id, shards in partition["materialReplicaMap"].items():
        for shard_id in shards:
            shard_nodes[shard_id][material_id] = nodes_by_id[material_id]
    for edge in edges:
        shard_id = partition["factoryPartitionMap"][edge["factoryId"]]
        shard_edges[shard_id].append(edge)

    user = os.getenv("NEO4J_USER", "neo4j")
    password = os.getenv("NEO4J_PASSWORD", "password123")
    summary = {}
    for shard_id, uri in shard_uris().items():
        driver = GraphDatabase.driver(uri, auth=(user, password))
        with driver.session() as session:
            run_cypher_file(session, "clear_neo4j.cypher")
            run_cypher_file(session, "create_indexes.cypher")
            for node in shard_nodes[shard_id].values():
                create_node(session, node, shard_id, mode)
            for edge in shard_edges[shard_id]:
                create_relationship(session, nodes_by_id[edge["source"]], nodes_by_id[edge["target"]], edge["type"])
        driver.close()
        summary[shard_id] = {"nodes": len(shard_nodes[shard_id]), "edges": len(shard_edges[shard_id])}
    print(json.dumps({"partitionMode": mode, "summary": summary}, indent=2))


if __name__ == "__main__":
    main()

