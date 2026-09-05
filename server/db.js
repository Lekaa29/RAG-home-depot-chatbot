import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, "store.sqlite");

export function openDb() {
  const db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  return db;
}

export function createSchema(db) {
  db.exec(`
    DROP TABLE IF EXISTS items_fts;
    DROP TABLE IF EXISTS item_embeddings;
    DROP TABLE IF EXISTS item_specs;
    DROP TABLE IF EXISTS items;
    DROP TABLE IF EXISTS categories;
    DROP TABLE IF EXISTS nav_edges;
    DROP TABLE IF EXISTS nav_nodes;
    DROP TABLE IF EXISTS locations;
    DROP TABLE IF EXISTS shelves;

    CREATE TABLE shelves (
      id INTEGER PRIMARY KEY,
      aisle_num INTEGER NOT NULL,
      bay_index INTEGER NOT NULL,
      x REAL NOT NULL,
      z REAL NOT NULL,
      width REAL NOT NULL,
      depth REAL NOT NULL,
      rotation_deg REAL NOT NULL DEFAULT 0,
      height REAL NOT NULL,
      columns INTEGER NOT NULL DEFAULT 1,
      pickup_node_id INTEGER NOT NULL
    );

    CREATE TABLE locations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      kind TEXT NOT NULL,
      x REAL NOT NULL,
      z REAL NOT NULL
    );

    CREATE TABLE nav_nodes (
      id INTEGER PRIMARY KEY,
      x REAL NOT NULL,
      z REAL NOT NULL
    );

    CREATE TABLE nav_edges (
      from_id INTEGER NOT NULL REFERENCES nav_nodes(id),
      to_id INTEGER NOT NULL REFERENCES nav_nodes(id),
      weight REAL NOT NULL
    );

    CREATE TABLE categories (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      parent_id INTEGER REFERENCES categories(id)
    );

    CREATE TABLE items (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      shelf_id INTEGER NOT NULL REFERENCES shelves(id),
      column_index INTEGER NOT NULL DEFAULT 1,
      x REAL NOT NULL DEFAULT 0,
      z REAL NOT NULL DEFAULT 0,
      category_id INTEGER REFERENCES categories(id),
      sku TEXT,
      brand TEXT,
      notes TEXT,
      icon TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE item_specs (
      item_id INTEGER NOT NULL REFERENCES items(id),
      key TEXT NOT NULL,
      value TEXT NOT NULL
    );

    -- lexical (BM25) search over item text -- rowid is set explicitly to the
    -- item's own id at insert time so results join straight back to items.
    -- Porter stemming means "leaking"/"leaks" both match a "leak" query.
    CREATE VIRTUAL TABLE items_fts USING fts5(
      name, brand, notes, department, specs_text,
      tokenize = 'porter unicode61'
    );

    -- semantic search -- one local sentence-embedding vector per item,
    -- stored as a raw Float32Array BLOB, compared by cosine similarity in JS.
    CREATE TABLE item_embeddings (
      item_id INTEGER PRIMARY KEY REFERENCES items(id),
      vector BLOB NOT NULL
    );
  `);
}

export { DB_PATH };
