import "dotenv/config";
import express from "express";
import cors from "cors";
import { openDb } from "./db.js";
import { buildFootprint } from "./geometry.js";
import { embedText, blobToVector, dot } from "./embeddings.js";

const db = openDb();

// Loaded once at startup rather than re-decoded on every chat request --
// cheap to keep resident (a few thousand x 384 floats is a few MB).
const itemEmbeddings = db
  .prepare("SELECT item_id, vector FROM item_embeddings")
  .all()
  .map((r) => ({ itemId: r.item_id, vector: blobToVector(r.vector) }));
const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/shelves", (req, res) => {
  res.json(db.prepare("SELECT * FROM shelves").all());
});

app.get("/api/locations", (req, res) => {
  res.json(db.prepare("SELECT * FROM locations").all());
});

app.get("/api/items", (req, res) => {
  const rows = db
    .prepare(
      `SELECT items.id, items.name, items.notes, items.icon, items.shelf_id,
              items.sku, items.brand, items.category_id,
              items.column_index, items.x, items.z,
              shelves.aisle_num, shelves.bay_index, shelves.width, shelves.columns,
              shelves.pickup_node_id
       FROM items JOIN shelves ON shelves.id = items.shelf_id
       ORDER BY items.name`
    )
    .all();
  res.json(rows);
});

app.get("/api/items/:id/specs", (req, res) => {
  const rows = db
    .prepare(`SELECT key, value FROM item_specs WHERE item_id = ? ORDER BY key`)
    .all(req.params.id);
  res.json(rows);
});

app.get("/api/footprint", (req, res) => {
  res.json(buildFootprint());
});

app.get("/api/navgraph", (req, res) => {
  const nodes = db.prepare("SELECT id, x, z FROM nav_nodes").all();
  const edges = db.prepare("SELECT from_id, to_id, weight FROM nav_edges").all();
  res.json({ nodes, edges });
});

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-20b";

app.post("/api/chat", async (req, res) => {
  if (!GROQ_API_KEY) {
    res.status(500).json({
      error:
        "GROQ_API_KEY is not set. Copy server/.env.example to server/.env and add a free key from https://console.groq.com, then restart the server.",
    });
    return;
  }

  const { message, history, knownLocation } = req.body || {};
  if (!message || typeof message !== "string") {
    res.status(400).json({ error: "message is required" });
    return;
  }

  // With a real catalog (thousands of rows) dumping everything into the
  // prompt every request doesn't scale -- cost, latency, and match quality
  // all degrade. This is a real hybrid retrieval instead of a keyword scan:
  // SQLite FTS5 (BM25, Porter-stemmed) finds items that share words with the
  // message, and a local sentence-embedding cosine search finds items that
  // are semantically related even without shared words (e.g. a described
  // problem like "my faucet keeps dripping" surfacing washers/plumber's
  // tape). Lexical hits are trusted first since they're exact-ish matches;
  // semantic hits fill the remaining slots.
  const CATALOG_LIMIT = 60;
  const LEXICAL_LIMIT = 40;
  const SEMANTIC_LIMIT = 40;

  const queryText = `${message} ${(Array.isArray(history) ? history : []).map((h) => h.content).join(" ")}`;
  const queryWords = queryText.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const ftsQuery = [...new Set(queryWords.filter((w) => w.length >= 3))].join(" OR ");

  let lexicalIds = [];
  if (ftsQuery) {
    try {
      lexicalIds = db
        .prepare(`SELECT rowid FROM items_fts WHERE items_fts MATCH ? ORDER BY rank LIMIT ?`)
        .all(ftsQuery, LEXICAL_LIMIT)
        .map((r) => r.rowid);
    } catch {
      lexicalIds = []; // malformed FTS query (e.g. all-stopword input) -- semantic search still covers it
    }
  }

  const queryVec = await embedText(message);
  const semanticIds = itemEmbeddings
    .map(({ itemId, vector }) => ({ itemId, score: dot(queryVec, vector) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, SEMANTIC_LIMIT)
    .map((r) => r.itemId);

  const mergedIds = [];
  const seen = new Set();
  for (const id of [...lexicalIds, ...semanticIds]) {
    if (seen.has(id) || mergedIds.length >= CATALOG_LIMIT) continue;
    seen.add(id);
    mergedIds.push(id);
  }

  const rowsById = new Map(
    mergedIds.length
      ? db
          .prepare(
            `SELECT items.id, items.name, shelves.aisle_num, categories.name AS department
             FROM items
             JOIN shelves ON shelves.id = items.shelf_id
             LEFT JOIN categories ON categories.id = items.category_id
             WHERE items.id IN (${mergedIds.map(() => "?").join(",")})`
          )
          .all(...mergedIds)
          .map((r) => [r.id, r])
      : []
  );
  const ranked = mergedIds.map((id) => rowsById.get(id)).filter(Boolean);

  const itemCatalog = ranked
    .map((r) => `${r.name} (Aisle ${r.aisle_num}${r.department ? `, ${r.department}` : ""})`)
    .join("\n");
  const locationNames = db.prepare("SELECT name FROM locations").all().map((r) => r.name).join(", ");

  const systemPrompt = `You are a friendly in-store shopping assistant for a Home Depot-style hardware store.

Item catalog -- the ${CATALOG_LIMIT} items most likely to match this conversation, not the full store (pick items ONLY from this exact list, using the exact name before the parenthesis; if nothing here is a good match, don't force one):
${itemCatalog}

Known "current location" names the customer might be standing at: ${locationNames}.
${
  knownLocation
    ? `The customer's current location is already known: "${knownLocation}". Don't ask for it again unless they mention switching to a different one.`
    : `The customer's current location is NOT known yet.`
}

Read the customer's message (and the conversation so far) and:
1. Figure out which catalog items they want (fuzzy match is fine, e.g. "some paint" -> "Interior Paint - Gallon"). Only include items you're reasonably confident about.
2. If their current location is still unknown after this message, ask for it in one short, warm sentence -- something in the spirit of "Can you also tell me what's your current location inside the store? :)". Otherwise just briefly confirm what you found.
3. If they mention a location in this message that matches (or is close to) one of the known location names, report it back using the exact known name.

Respond with ONLY a JSON object, no other text, in exactly this shape:
{"reply": "<short reply to show the customer>", "items": ["<exact catalog item name>", ...], "location": "<exact known location name>" or null}`;

  const messages = [
    { role: "system", content: systemPrompt },
    ...(Array.isArray(history) ? history.slice(-8) : []).map((h) => ({
      role: h.role === "assistant" ? "assistant" : "user",
      content: String(h.content ?? ""),
    })),
    { role: "user", content: message },
  ];

  try {
    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages,
        temperature: 0.3,
        response_format: { type: "json_object" },
      }),
    });

    if (!groqRes.ok) {
      const text = await groqRes.text();
      res.status(502).json({ error: `Groq API error (${groqRes.status}): ${text}` });
      return;
    }

    const data = await groqRes.json();
    const content = data.choices?.[0]?.message?.content ?? "{}";
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = { reply: content, items: [], location: null };
    }

    res.json({
      reply: typeof parsed.reply === "string" ? parsed.reply : "",
      items: Array.isArray(parsed.items) ? parsed.items : [],
      location: typeof parsed.location === "string" ? parsed.location : null,
    });
  } catch (err) {
    res.status(502).json({ error: `Could not reach Groq: ${String(err)}` });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});
