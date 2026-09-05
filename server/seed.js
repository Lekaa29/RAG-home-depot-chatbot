import { openDb, createSchema } from "./db.js";
import { buildLayout } from "./geometry.js";

const db = openDb();
createSchema(db);

const layout = buildLayout();

const insertShelf = db.prepare(`
  INSERT INTO shelves (id, aisle_num, bay_index, x, z, width, depth, rotation_deg, height, columns, pickup_node_id)
  VALUES (@id, @aisle_num, @bay_index, @x, @z, @width, @depth, @rotation_deg, @height, @columns, @pickup_node_id)
`);
const insertLocation = db.prepare(`
  INSERT INTO locations (id, name, kind, x, z) VALUES (@id, @name, @kind, @x, @z)
`);
const insertNode = db.prepare(`INSERT INTO nav_nodes (id, x, z) VALUES (@id, @x, @z)`);
const insertEdge = db.prepare(`INSERT INTO nav_edges (from_id, to_id, weight) VALUES (@from, @to, @weight)`);
const insertCategory = db.prepare(`
  INSERT INTO categories (id, name, parent_id) VALUES (@id, @name, @parent_id)
`);
const insertItem = db.prepare(`
  INSERT INTO items (id, name, shelf_id, column_index, x, z, category_id, sku, brand, notes, icon)
  VALUES (@id, @name, @shelf_id, @column_index, @x, @z, @category_id, @sku, @brand, @notes, @icon)
`);
const insertSpec = db.prepare(`INSERT INTO item_specs (item_id, key, value) VALUES (@item_id, @key, @value)`);

db.exec("BEGIN");
try {
  for (const s of layout.shelves) insertShelf.run(s);
  for (const l of layout.locations) insertLocation.run(l);
  for (const n of layout.navNodes) insertNode.run(n);
  for (const e of layout.navEdges) insertEdge.run(e);
  for (const c of layout.categories) insertCategory.run(c);
  for (const i of layout.items) insertItem.run(i);
  for (const sp of layout.itemSpecs) insertSpec.run(sp);
  db.exec("COMMIT");
} catch (err) {
  db.exec("ROLLBACK");
  throw err;
}

console.log(
  `Seeded ${layout.shelves.length} shelves, ${layout.locations.length} locations, ` +
    `${layout.navNodes.length} nav nodes, ${layout.navEdges.length} nav edges, ` +
    `${layout.categories.length} categories, ${layout.items.length} items, ${layout.itemSpecs.length} specs.`
);
console.log(`Store bounds: ${layout.bounds.width}ft x ${layout.bounds.depth}ft`);

// --- lexical (FTS5) + semantic (local embedding) search indexes ---

const categoryNameById = new Map(layout.categories.map((c) => [c.id, c.name]));
const specsByItemId = new Map();
for (const sp of layout.itemSpecs) {
  if (!specsByItemId.has(sp.item_id)) specsByItemId.set(sp.item_id, []);
  specsByItemId.get(sp.item_id).push(`${sp.key}: ${sp.value}`);
}

function descriptiveText(item) {
  const department = categoryNameById.get(item.category_id) ?? "";
  const specsText = (specsByItemId.get(item.id) ?? []).join(". ");
  return [item.name, item.brand, department, item.notes, specsText].filter(Boolean).join(". ");
}

const insertFts = db.prepare(`
  INSERT INTO items_fts (rowid, name, brand, notes, department, specs_text)
  VALUES (@rowid, @name, @brand, @notes, @department, @specs_text)
`);
db.exec("BEGIN");
for (const item of layout.items) {
  insertFts.run({
    rowid: item.id,
    name: item.name,
    brand: item.brand ?? "",
    notes: item.notes ?? "",
    department: categoryNameById.get(item.category_id) ?? "",
    specs_text: (specsByItemId.get(item.id) ?? []).join(". "),
  });
}
db.exec("COMMIT");
console.log(`Indexed ${layout.items.length} items into items_fts (lexical search).`);
console.log("Run `node scripts/embed-items.js` next to build the semantic-search index.");

db.close();
