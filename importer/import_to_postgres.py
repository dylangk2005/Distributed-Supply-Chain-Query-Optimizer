import json

import psycopg2
from psycopg2.extras import Json, execute_values

from common import GENERATOR_DIR, PARTITIONER_DIR, load_json, postgres_config


def main() -> None:
    documents = load_json(GENERATOR_DIR / "supply_chain_documents.json")
    random_directory = load_json(PARTITIONER_DIR / "random_material_directory.json")
    metis_directory = load_json(PARTITIONER_DIR / "metis_material_directory.json")
    random_metrics = load_json(PARTITIONER_DIR / "random_topology_metrics.json")
    metis_metrics = load_json(PARTITIONER_DIR / "metis_topology_metrics.json")

    with psycopg2.connect(**postgres_config()) as conn:
        with conn.cursor() as cur:
            factory_rows = [
                (
                    doc["factoryId"],
                    doc["factoryName"],
                    doc["region"],
                    doc["country"],
                    doc.get("employeeCount"),
                    doc.get("riskScore"),
                )
                for doc in documents
            ]
            execute_values(cur, """
                INSERT INTO factory_metadata
                (factory_id, factory_name, region, country, employee_count, risk_score)
                VALUES %s
                ON CONFLICT (factory_id) DO UPDATE SET
                    factory_name = EXCLUDED.factory_name,
                    region = EXCLUDED.region,
                    country = EXCLUDED.country,
                    employee_count = EXCLUDED.employee_count,
                    risk_score = EXCLUDED.risk_score
            """, factory_rows)

            document_rows = [(doc["factoryId"], Json(doc)) for doc in documents]
            execute_values(cur, """
                INSERT INTO supply_chain_documents (factory_id, supply_chain_json)
                VALUES %s
                ON CONFLICT (factory_id) DO UPDATE SET supply_chain_json = EXCLUDED.supply_chain_json
            """, document_rows)

            cur.execute("DELETE FROM material_directory")
            directory_rows = [
                (
                    row["partitionMode"],
                    row["materialId"],
                    row["materialName"],
                    row["shardId"],
                    row["componentCount"],
                    row["factoryCount"],
                )
                for row in random_directory + metis_directory
            ]
            execute_values(cur, """
                INSERT INTO material_directory
                (partition_mode, material_id, material_name, shard_id, component_count, factory_count)
                VALUES %s
            """, directory_rows)

            for metrics in [random_metrics, metis_metrics]:
                cur.execute("""
                    INSERT INTO topology_metrics
                    (partition_mode, projection_nodes, projection_edges, cross_shard_edges,
                     edge_cut_ratio, material_replication, node_count_by_shard,
                     edge_count_by_shard, expected_visited_shard_count_by_material)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (partition_mode) DO UPDATE SET
                        projection_nodes = EXCLUDED.projection_nodes,
                        projection_edges = EXCLUDED.projection_edges,
                        cross_shard_edges = EXCLUDED.cross_shard_edges,
                        edge_cut_ratio = EXCLUDED.edge_cut_ratio,
                        material_replication = EXCLUDED.material_replication,
                        node_count_by_shard = EXCLUDED.node_count_by_shard,
                        edge_count_by_shard = EXCLUDED.edge_count_by_shard,
                        expected_visited_shard_count_by_material = EXCLUDED.expected_visited_shard_count_by_material
                """, (
                    metrics["partitionMode"],
                    metrics["projectionNodes"],
                    metrics["projectionEdges"],
                    metrics["crossShardEdges"],
                    metrics["edgeCutRatio"],
                    metrics["materialReplication"],
                    Json(metrics["nodeCountByShard"]),
                    Json(metrics["edgeCountByShard"]),
                    Json(metrics["expectedVisitedShardCountByMaterial"]),
                ))
    print(json.dumps({"factories": len(documents), "directoryRows": len(random_directory) + len(metis_directory)}, indent=2))


if __name__ == "__main__":
    main()

