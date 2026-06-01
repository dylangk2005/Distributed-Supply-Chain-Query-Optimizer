CREATE TABLE IF NOT EXISTS factory_metadata (
    factory_id VARCHAR(64) PRIMARY KEY,
    factory_name VARCHAR(255) NOT NULL,
    region VARCHAR(100) NOT NULL,
    country VARCHAR(100) NOT NULL,
    employee_count INT,
    risk_score NUMERIC(5, 2)
);

CREATE TABLE IF NOT EXISTS supply_chain_documents (
    factory_id VARCHAR(64) PRIMARY KEY,
    supply_chain_json JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS material_directory (
    id SERIAL PRIMARY KEY,
    partition_mode VARCHAR(32) NOT NULL,
    material_id VARCHAR(64) NOT NULL,
    material_name VARCHAR(100) NOT NULL,
    shard_id VARCHAR(32) NOT NULL,
    component_count INT DEFAULT 0,
    factory_count INT DEFAULT 0,
    UNIQUE (partition_mode, material_id, shard_id)
);

CREATE TABLE IF NOT EXISTS query_execution_logs (
    id SERIAL PRIMARY KEY,
    query_id VARCHAR(64) NOT NULL,
    partition_mode VARCHAR(32) NOT NULL,
    query_mode VARCHAR(32) NOT NULL,
    material_name VARCHAR(100) NOT NULL,
    visited_shards JSONB NOT NULL,
    pruned_shards JSONB NOT NULL,
    affected_factory_count INT NOT NULL,
    execution_time_ms INT NOT NULL,
    execution_plan JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS topology_metrics (
    id SERIAL PRIMARY KEY,
    partition_mode VARCHAR(32) NOT NULL UNIQUE,
    projection_nodes INT NOT NULL,
    projection_edges INT NOT NULL,
    cross_shard_edges INT NOT NULL,
    edge_cut_ratio NUMERIC(8, 4) NOT NULL,
    material_replication NUMERIC(8, 4),
    node_count_by_shard JSONB,
    edge_count_by_shard JSONB,
    expected_visited_shard_count_by_material JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

