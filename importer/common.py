import json
import os
from pathlib import Path
from typing import Any


GENERATOR_DIR = Path(os.getenv("GENERATOR_OUTPUT_DIR", "/app/generator-output"))
PARTITIONER_DIR = Path(os.getenv("PARTITIONER_OUTPUT_DIR", "/app/partitioner-output"))

if not GENERATOR_DIR.exists():
    GENERATOR_DIR = Path(__file__).resolve().parent.parent / "generator" / "output"
if not PARTITIONER_DIR.exists():
    PARTITIONER_DIR = Path(__file__).resolve().parent.parent / "partitioner" / "output"


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def postgres_config() -> dict:
    return {
        "host": os.getenv("POSTGRES_HOST", "localhost"),
        "port": int(os.getenv("POSTGRES_PORT", "5432")),
        "dbname": os.getenv("POSTGRES_DB", "supply_chain_map"),
        "user": os.getenv("POSTGRES_USER", "scm_user"),
        "password": os.getenv("POSTGRES_PASSWORD", "scm_password"),
    }


def shard_uris() -> dict[str, str]:
    defaults = {
        "shard_1": "bolt://localhost:7681",
        "shard_2": "bolt://localhost:7682",
        "shard_3": "bolt://localhost:7683",
    }
    return {
        shard: os.getenv(f"NEO4J_SHARD_{shard.split('_')[1]}_URI", uri)
        for shard, uri in defaults.items()
    }
