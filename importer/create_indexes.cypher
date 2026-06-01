CREATE INDEX factory_id_idx IF NOT EXISTS FOR (f:Factory) ON (f.factoryId);
CREATE INDEX product_id_idx IF NOT EXISTS FOR (p:Product) ON (p.productId);
CREATE INDEX part_id_idx IF NOT EXISTS FOR (p:Part) ON (p.partId);
CREATE INDEX component_id_idx IF NOT EXISTS FOR (c:Component) ON (c.componentId);
CREATE INDEX raw_material_name_idx IF NOT EXISTS FOR (m:RawMaterial) ON (m.name);
CREATE INDEX raw_material_id_idx IF NOT EXISTS FOR (m:RawMaterial) ON (m.materialId);

