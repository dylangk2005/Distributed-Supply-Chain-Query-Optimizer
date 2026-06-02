# Distributed Supply Chain Graph Query Optimizer

Project 134: **Cypher Query Optimizer - "Supply Chain Map"**

This project simulates a distributed graph query optimizer for supply chain shortage analysis. It generates a 5-level supply chain dataset, partitions the graph into 5 Neo4j shards, uses a Material Directory to prune irrelevant shards, runs Cypher queries to find factories affected by a raw material shortage, and presents an execution plan, benchmark results, and topology analysis.

## Problem Statement

The assignment requires:

- Dataset: a 5-level nested `Supply_Chain_JSON`.
- Task: write a Cypher query to find all factories affected by a shortage of a specific raw material.
- Analysis: show how the distributed graph engine prunes the search tree to avoid checking irrelevant nodes or shards.
- Deliverable: an execution plan showing which shards were visited.

This implementation covers the required criteria:

- **Graph Partitioning:** Random baseline and METIS-based partitioning on the factory-material projection graph. The Material Directory is used as a vertex-cut-style routing layer, not as a full vertex-cut implementation.
- **Traversal Logic:** Distributed BFS-style traversal using Cypher across selected Neo4j shards, with BFS level metrics.
- **Multi-Model Integration:** Neo4j graph traversal, PostgreSQL relational metadata, and PostgreSQL JSONB document enrichment.
- **Topology Analysis:** Edge-cut ratio, cluster density, material replication, node/edge distribution, and expected visited shards.

## Architecture

```txt
Frontend Next.js
  |
  | HTTP API
  v
Backend Express/TypeScript
  |
  |-- PostgreSQL
  |     |-- factory_metadata
  |     |-- supply_chain_documents JSONB
  |     |-- material_directory
  |     |-- query_execution_logs
  |     |-- topology_metrics
  |
  |-- Neo4j shard_1
  |-- Neo4j shard_2
  |-- Neo4j shard_3
  |-- Neo4j shard_4
  |-- Neo4j shard_5
```

Main components:

- `generator/`: generates 1000 factories, 40 raw materials, and 5-level supply chain JSON documents.
- `partitioner/`: creates Random partitions, METIS partitions, Material Directory files, and topology metrics.
- `importer/`: imports metadata/documents into PostgreSQL and graph data into 5 Neo4j shards.
- `backend/`: coordinator API, shard router, Cypher query service, execution plan builder, benchmark service, and topology service.
- `frontend/`: one-page dashboard for the full demo workflow.

## Dataset

The dataset configuration is stored in `generator/config.json`:

- `factoryCount`: 1000
- `rawMaterialCount`: 40
- 5 regions: Hanoi, Ho Chi Minh, Hai Phong, Da Nang, Can Tho
- Each factory has Product -> Part -> Component -> RawMaterial
- Random seed: 134

5-level supply chain:

```txt
Factory
  -> Product
    -> Part
      -> Component
        -> RawMaterial
```

## Partitioning and Material Directory

The project supports 2 partition modes:

- `RANDOM`: baseline partitioning that assigns factory-subgraphs randomly to shards.
- `METIS`: groups factories with similar raw material dependencies using a factory-material projection graph.

Important design points:

- Each factory-subgraph is kept local to one shard so the Cypher traversal path remains complete.
- A raw material can appear in multiple shards because factories in different shards may use the same material.
- `material_directory` records which raw material appears in which shard.
- `OPTIMIZED` queries use `material_directory` to prune shards.
- `NAIVE` queries broadcast to all 5 shards.

## Cypher Query

The main query finds all factories affected by a raw material shortage:

```cypher
MATCH (m:RawMaterial {name: $materialName, partitionMode: $partitionMode})
      <-[:USES]-(c:Component)
      <-[:HAS_COMPONENT]-(p:Part)
      <-[:CONTAINS]-(prd:Product)
      <-[:PRODUCES]-(f:Factory)
RETURN DISTINCT f.factoryId AS factoryId
```

Query modes:

- `NAIVE`: visits all shards.
- `OPTIMIZED`: looks up the Material Directory and only visits shards that contain the selected raw material.

The execution plan includes:

- `visitedShards`
- `prunedShards`
- `bfsLevels`: RawMaterial, Component, Part, Product, Factory
- Cypher query text and parameters
- SQL Material Directory lookup and parameters
- Relational/document join steps

## Multi-Model Integration

Query execution flow:

1. The backend coordinator receives the request.
2. PostgreSQL `material_directory` is queried when `OPTIMIZED` mode is selected.
3. Selected Neo4j shards run the Cypher traversal.
4. The backend merges and deduplicates factory IDs.
5. PostgreSQL joins `factory_metadata`.
6. PostgreSQL JSONB enriches results from `supply_chain_documents`.
7. The API returns affected factories plus the execution plan.

## Dashboard

The frontend dashboard is organized into 6 demo sections:

1. **Prepare Data**  
   Generate dataset, partition graph, build material directory, import PostgreSQL, import Neo4j, and warm up the query engine.

2. **Material Directory**  
   Inspect which shards contain each material, plus replica count, factory count, and component count.

3. **Query Lab**  
   Select the missing raw material, partition strategy, and query mode; view the Cypher query.

4. **Execution Plan**  
   View visited shards, pruned shards, BFS levels, SQL lookup, Cypher traversal, and affected factories.

5. **Benchmark**  
   Compare RANDOM/METIS and NAIVE/OPTIMIZED across Steel, Lithium, and Palladium.

6. **Topology**  
   Inspect edge-cut ratio, material replication, average visited shards, cluster density, and node/edge distribution.

## Main API Endpoints

The backend runs at `http://localhost:8080`.

```txt
GET  /health

GET  /api/demo/status
POST /api/demo/generate
POST /api/demo/partition
POST /api/demo/build-directory
POST /api/demo/import-postgres
POST /api/demo/import-neo4j
POST /api/demo/warmup
POST /api/demo/sample-query
POST /api/demo/reset

GET  /api/materials
GET  /api/material-directory?partitionMode=METIS

POST /api/query
GET  /api/benchmark
POST /api/benchmark/run
GET  /api/topology
```

Example query request:

```json
{
  "materialName": "Palladium",
  "partitionMode": "METIS",
  "queryMode": "OPTIMIZED"
}
```

## Running with Docker

Requirements:

- Docker Desktop
- Enough memory for PostgreSQL, 5 Neo4j shards, backend, and frontend

Start the full system:

```bash
docker compose up --build
```

Open the dashboard:

```txt
http://localhost:3000
```

Backend:

```txt
http://localhost:8080
```

Neo4j Browser:

```txt
shard_1: http://localhost:7471
shard_2: http://localhost:7472
shard_3: http://localhost:7473
shard_4: http://localhost:7474
shard_5: http://localhost:7475
```

Neo4j login:

```txt
username: neo4j
password: password123
```

PostgreSQL:

```txt
host: localhost
port: 5432
database: supply_chain_map
user: scm_user
password: scm_password
```

## Recommended Demo Flow

Use this order on the dashboard:

1. Run every step in **Prepare Data** from top to bottom.
2. After importing Neo4j, click **Warm Up**.
3. Open **Material Directory**, select `METIS`, and search for `Palladium`.
4. Open **Query Lab** and run:

```txt
materialName: Palladium
partitionMode: METIS
queryMode: OPTIMIZED
```

5. Explain the **Execution Plan**:
   - The coordinator looks up the Material Directory.
   - Only shards containing Palladium are visited.
   - Irrelevant shards are pruned.
   - Cypher traversal runs inside the visited shards.
   - PostgreSQL metadata and JSONB documents enrich the results.
6. Run **Benchmark** to compare RANDOM vs METIS.
7. Open **Topology** to explain edge-cut ratio, material replication, and cluster density.

## Warm Up

Warmup is used to reduce cold-start overhead before demo queries and benchmarks.

Warmup performs:

- PostgreSQL Material Directory lookups for `Steel`, `Lithium`, and `Palladium`.
- Neo4j traversal probes for both `RANDOM` and `METIS`.
- Probes across all 5 shards.

Benchmark automatically runs warmup before measuring:

```txt
POST /api/benchmark/run
```

Manual queries in Query Lab do not automatically warm up before every query. For the most stable first query, click **Warm Up** after importing Neo4j and before running the first query. The system should not warm up before every query because that would distort query and benchmark timing.

## Local Development without Docker

Backend:

```bash
cd backend
npm install
npm run dev
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Build checks:

```bash
cd backend
npm run build

cd ../frontend
npm run build
```

If backend/frontend are run locally outside Docker, make sure PostgreSQL and all Neo4j shards are running and that environment variables point to the correct hosts and ports.

## Scripts and Outputs

Generator output:

```txt
generator/output/
```

Partitioner output:

```txt
partitioner/output/
```

Main generated files:

- `nodes.json`
- `edges.json`
- `supply_chain_documents.json`
- `random_partition_map.json`
- `metis_partition_map.json`
- `random_material_directory.json`
- `metis_material_directory.json`
- `random_topology_metrics.json`
- `metis_topology_metrics.json`

## Known Limitations

- The project does not implement full cross-shard relationship traversal.
- Each factory-subgraph is imported locally into one shard so the Cypher path remains complete.
- METIS is applied to the factory-material projection graph, not to regions.
- The Material Directory is a routing/pruning layer that tells the optimizer which shards should be visited.
- Vertex-cut behavior is represented at the routing/material-placement level, not as a full vertex-cut algorithm.

## Grading Summary

```txt
Graph Partitioning:
  RANDOM baseline + METIS-based factory-material partitioning.

Traversal Logic:
  Distributed BFS-style Cypher traversal across selected Neo4j shards.

Multi-Model Integration:
  Neo4j graph + PostgreSQL relational metadata + PostgreSQL JSONB documents.

Topology Analysis:
  Edge-cut ratio, material replication, expected visited shards,
  node/edge distribution, cluster density by shard.

Deliverable:
  Execution plan with visited shards, pruned shards, BFS levels,
  Cypher text, SQL directory lookup, and affected factories.
```
