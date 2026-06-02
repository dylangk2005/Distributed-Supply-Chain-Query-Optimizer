import json
import random
from pathlib import Path


"""Generate synthetic Supply_Chain_JSON data and matching graph files.

File này tạo dữ liệu đầu vào cho toàn bộ demo:
- supply_chain_documents.json: bản document JSONB gốc.
- nodes.json / edges.json: graph dùng để import Neo4j.
- raw_materials.json: danh sách raw materials cho partitioner/importer.
"""

ROOT = Path(__file__).resolve().parent
CONFIG_PATH = ROOT / "config.json"
OUTPUT_DIR = ROOT / "output"
AFFINITY_CLUSTERS = 5

# Chia raw materials thành COMMON/MEDIUM/RARE để benchmark có cả material phổ biến và material hiếm.
COMMON = ["Steel", "Aluminum", "Copper", "Plastic Resin", "Silicon"]
MEDIUM = [
    "Lithium", "Nickel", "Cobalt", "Rubber", "Glass Fiber", "Zinc", "Magnesium",
    "Graphite", "Manganese", "Tin", "Lead", "Chromium", "Titanium", "ABS Plastic",
    "Polycarbonate"
]
RARE = [
    "Palladium", "Platinum", "Rare Earth", "Neodymium", "Tantalum", "Tungsten",
    "Vanadium", "Iridium", "Rhodium", "Carbon Fiber", "Kevlar", "Ceramic Powder",
    "Gallium", "Germanium", "Indium", "Boron", "Molybdenum", "Fluoropolymer",
    "Nickel Foam", "Sapphire Glass"
]

PRODUCTS = [
    ("Electric Scooter Battery Module", "EV Component"),
    ("Smart Inverter Assembly", "Power Electronics"),
    ("Industrial Sensor Hub", "Industrial IoT"),
    ("Precision Drive Controller", "Automation"),
    ("Medical Pump Module", "Medical Device"),
]
PARTS = ["Control Unit", "Housing", "Connector Board", "Thermal Plate", "Signal Harness", "Motor Coupler"]
COMPONENTS = ["Cell Pack", "Micro Controller", "Copper Coil", "Polymer Frame", "Ceramic Shield", "Optical Sensor"]


def material_id(name: str) -> str:
    """Chuẩn hóa tên material thành ID ổn định, ví dụ Palladium -> RM_PALLADIUM."""
    return "RM_" + name.upper().replace(" ", "_").replace("-", "_")


def region_code(region: str) -> str:
    """Map region name sang prefix ngắn để tạo factoryId dễ đọc."""
    return {
        "Hanoi": "HN",
        "Ho Chi Minh": "HCM",
        "Da Nang": "DN",
        "Hai Phong": "HP",
        "Can Tho": "CT",
    }[region]


def weighted_materials(rng: random.Random, materials: list[dict], count: int, affinity_cluster: int) -> list[dict]:
    """Chọn raw materials có trọng số để tạo dependency cluster cho METIS partitioning.

    COMMON xuất hiện nhiều ở mọi cluster; MEDIUM/RARE thiên về affinity_cluster.
    Nhờ vậy METIS có tín hiệu để gom factories có material dependency giống nhau.
    """
    weights = []
    for item in materials:
        if item["frequencyGroup"] == "COMMON":
            weights.append(12)
        elif item["frequencyGroup"] == "MEDIUM":
            material_cluster = item["cluster"]
            weights.append(8 if material_cluster == affinity_cluster else 2 if material_cluster == (affinity_cluster + 1) % AFFINITY_CLUSTERS else 0)
        else:
            weights.append(5 if item["cluster"] == affinity_cluster else 0)
    chosen = {}
    while len(chosen) < count:
        item = rng.choices(materials, weights=weights, k=1)[0]
        chosen[item["materialId"]] = item
    return list(chosen.values())


def add_node(nodes: list[dict], node_id: str, label: str, properties: dict) -> None:
    """Thêm một node graph theo format importer/partitioner dùng chung."""
    nodes.append({"id": node_id, "label": label, "properties": properties})


def add_edge(edges: list[dict], source: str, target: str, rel_type: str, factory_id: str) -> None:
    """Thêm một relationship và lưu factoryId để partitioner biết edge thuộc factory nào."""
    edges.append({"source": source, "target": target, "type": rel_type, "factoryId": factory_id})


def main() -> None:
    """Sinh toàn bộ dataset theo config.json và ghi ra generator/output."""
    config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    rng = random.Random(config["randomSeed"])
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    materials = []
    # Tạo catalog raw materials trước, sau đó factory/component sẽ chọn từ catalog này.
    for index, name in enumerate(COMMON):
        materials.append({"materialId": material_id(name), "name": name, "riskLevel": "MEDIUM", "frequencyGroup": "COMMON", "cluster": index % AFFINITY_CLUSTERS})
    for index, name in enumerate(MEDIUM):
        materials.append({"materialId": material_id(name), "name": name, "riskLevel": "HIGH", "frequencyGroup": "MEDIUM", "cluster": index % AFFINITY_CLUSTERS})
    for index, name in enumerate(RARE):
        materials.append({"materialId": material_id(name), "name": name, "riskLevel": "HIGH", "frequencyGroup": "RARE", "cluster": index % AFFINITY_CLUSTERS})
    materials = materials[: config["rawMaterialCount"]]

    nodes: list[dict] = []
    edges: list[dict] = []
    documents: list[dict] = []
    counts = {"factory": 0, "product": 0, "part": 0, "component": 0}

    global_factory_index = 0
    # Vòng lặp chính tạo Factory -> Product -> Part -> Component -> RawMaterial.
    for region, region_count in config["regionDistribution"].items():
        code = region_code(region)
        for local_index in range(1, region_count + 1):
            global_factory_index += 1
            affinity_cluster = (global_factory_index - 1) % AFFINITY_CLUSTERS
            factory_id = f"F_{code}_{local_index:04d}"
            factory_name = f"{code} Precision Factory {local_index:04d}"
            risk_score = round(rng.uniform(0.1, 0.95), 2)
            employee_count = rng.randint(120, 2400)
            factory_doc = {
                "factoryId": factory_id,
                "factoryName": factory_name,
                "region": region,
                "country": "Vietnam",
                "employeeCount": employee_count,
                "riskScore": risk_score,
                "products": [],
            }
            add_node(nodes, factory_id, "Factory", {
                "factoryId": factory_id,
                "name": factory_name,
                "region": region,
                "country": "Vietnam",
                "employeeCount": employee_count,
                "riskScore": risk_score,
            })
            counts["factory"] += 1

            product_count = rng.randint(config["productPerFactory"]["min"], config["productPerFactory"]["max"])
            for product_index in range(1, product_count + 1):
                product_name, category = rng.choice(PRODUCTS)
                product_id = f"P_{code}_{local_index:04d}_{product_index:03d}"
                product_doc = {"productId": product_id, "name": product_name, "category": category, "parts": []}
                add_node(nodes, product_id, "Product", {
                    "productId": product_id,
                    "name": product_name,
                    "category": category,
                    "factoryId": factory_id,
                })
                add_edge(edges, factory_id, product_id, "PRODUCES", factory_id)
                counts["product"] += 1

                part_count = rng.randint(config["partPerProduct"]["min"], config["partPerProduct"]["max"])
                for part_index in range(1, part_count + 1):
                    part_id = f"PART_{code}_{local_index:04d}_{product_index:03d}_{part_index:03d}"
                    part_name = rng.choice(PARTS)
                    critical = rng.choice(["LOW", "MEDIUM", "HIGH"])
                    part_doc = {"partId": part_id, "name": part_name, "criticalLevel": critical, "components": []}
                    add_node(nodes, part_id, "Part", {"partId": part_id, "name": part_name, "criticalLevel": critical, "factoryId": factory_id})
                    add_edge(edges, product_id, part_id, "CONTAINS", factory_id)
                    counts["part"] += 1

                    component_count = rng.randint(config["componentPerPart"]["min"], config["componentPerPart"]["max"])
                    for component_index in range(1, component_count + 1):
                        component_id = f"C_{code}_{local_index:04d}_{product_index:03d}_{part_index:03d}_{component_index:03d}"
                        component_name = rng.choice(COMPONENTS)
                        supplier_tier = rng.randint(1, 3)
                        material_count = rng.randint(config["rawMaterialPerComponent"]["min"], config["rawMaterialPerComponent"]["max"])
                        component_materials = weighted_materials(rng, materials, material_count, affinity_cluster)
                        # component_doc giữ cấu trúc document JSONB; nodes/edges giữ cấu trúc graph.
                        component_doc = {
                            "componentId": component_id,
                            "name": component_name,
                            "supplierTier": supplier_tier,
                            "rawMaterials": component_materials,
                        }
                        add_node(nodes, component_id, "Component", {
                            "componentId": component_id,
                            "name": component_name,
                            "supplierTier": supplier_tier,
                            "factoryId": factory_id,
                        })
                        add_edge(edges, part_id, component_id, "HAS_COMPONENT", factory_id)
                        counts["component"] += 1

                        for material in component_materials:
                            add_edge(edges, component_id, material["materialId"], "USES", factory_id)
                        part_doc["components"].append(component_doc)
                    product_doc["parts"].append(part_doc)
                factory_doc["products"].append(product_doc)
            documents.append(factory_doc)

    for material in materials:
        # RawMaterial node được thêm một lần vào global graph; khi import Neo4j có thể replicate theo shard.
        add_node(nodes, material["materialId"], "RawMaterial", {
            "materialId": material["materialId"],
            "name": material["name"],
            "riskLevel": material["riskLevel"],
            "frequencyGroup": material["frequencyGroup"],
        })

    outputs = {
        "supply_chain_documents.json": documents,
        "nodes.json": nodes,
        "edges.json": edges,
        "raw_materials.json": materials,
    }
    # Ghi tất cả output để partitioner và importer dùng ở các bước sau.
    for filename, payload in outputs.items():
        (OUTPUT_DIR / filename).write_text(json.dumps(payload, indent=2), encoding="utf-8")

    print(json.dumps({
        "factories": counts["factory"],
        "products": counts["product"],
        "parts": counts["part"],
        "components": counts["component"],
        "rawMaterials": len(materials),
        "nodes": len(nodes),
        "edges": len(edges),
    }, indent=2))


if __name__ == "__main__":
    main()
