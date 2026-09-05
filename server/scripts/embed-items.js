// Builds the semantic-search index (server/item_embeddings) separately from
// seed.js -- embedding thousands of items through a local model takes a few
// minutes, and this script is resumable (it only embeds items that don't
// already have a vector), so an interruption partway through just means
// running it again picks up where it left off instead of starting over.
// Run with: node scripts/embed-items.js
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { embedTexts, vectorToBlob } from "../embeddings.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new DatabaseSync(path.join(__dirname, "..", "store.sqlite"));

const rows = db
  .prepare(
    `SELECT items.id, items.name, items.brand, items.notes,
            categories.name AS department,
            (SELECT group_concat(key || ': ' || value, '. ') FROM item_specs WHERE item_specs.item_id = items.id) AS specs_text
     FROM items
     LEFT JOIN categories ON categories.id = items.category_id
     WHERE items.id NOT IN (SELECT item_id FROM item_embeddings)`
  )
  .all();

if (rows.length === 0) {
  console.log("Nothing to do -- every item already has an embedding.");
  db.close();
  process.exit(0);
}

console.log(`Embedding ${rows.length} items (local model, first run downloads it once)...`);

function descriptiveText(row) {
  return [row.name, row.brand, row.department, row.notes, row.specs_text].filter(Boolean).join(". ");
}

const insertEmbedding = db.prepare(`INSERT INTO item_embeddings (item_id, vector) VALUES (@item_id, @vector)`);
const BATCH_SIZE = 32;
for (let start = 0; start < rows.length; start += BATCH_SIZE) {
  const batch = rows.slice(start, start + BATCH_SIZE);
  const vectors = await embedTexts(batch.map(descriptiveText));
  db.exec("BEGIN");
  batch.forEach((row, i) => {
    insertEmbedding.run({ item_id: row.id, vector: vectorToBlob(vectors[i]) });
  });
  db.exec("COMMIT");
  console.log(`  embedded ${Math.min(start + BATCH_SIZE, rows.length)}/${rows.length}`);
}

console.log(`Done -- embedded ${rows.length} items for semantic search.`);
db.close();
