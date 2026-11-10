# 3D Home Depot Locator

## End goal

> **User:** my kitchen faucet won't stop dripping, I think it's the washer
>
> **Assistant:** That's usually a worn washer or loose packing. You'll want:
> a Rubber Washer Assortment Kit, Plumber's Tape, and an Adjustable Basin
> Wrench. Can you also tell me what's your current location inside the
> store? :)
>
> **User:** standing right by the front entrance
>
> **Assistant:** Got it! All three are in Aisle 20, Plumbing.
>
> *(map draws a walking path from the entrance to Aisle 20 and drops a pin
> on each of the three items)*

A React Three Fiber shelf navigator over a procedurally generated Home
Depot-style store layout, backed by an Express + `node:sqlite` API and a
Groq-powered shopping assistant. The assistant's job is the hard part: given
a free-text message like "I need a drill and some paint," find the right
items out of a **5,124-item real catalog** (imported from Kaggle's Home
Depot Product Search Relevance dataset) and hand back exact matches the
frontend can place on the map and route to. This document focuses on how
that retrieval pipeline -- the RAG (Retrieval-Augmented Generation) solution
-- is built, and why it's built that way, with a shorter tour of the rest of
the system for context.

## 1. Why RAG, not "stuff the whole catalog in the prompt"

- 5,124 items x (name, brand, department, notes, specs) is tens of
  thousands of tokens -- too slow and expensive to send every turn.
- Irrelevant stuffing measurably hurts model accuracy, not just cost.
- The frontend needs the model to echo back **exact** catalog names to
  resolve a shelf position -- a model working from memory hallucinates
  names that don't exist. Grounding in a short, real, verbatim list fixes
  that.
- So: **retrieve** a small high-precision candidate set per message, then
  **generate** a structured answer constrained to that set.

## 2. Hybrid retrieval: lexical + semantic

Neither search strategy alone is good enough:

| | Lexical (FTS5/BM25) | Semantic (embeddings) |
|---|---|---|
| Strength | Exact/near-exact name matches, fast, precise | Matches meaning without shared words |
| Weakness | Blind to synonyms, descriptions, "my faucet keeps dripping" -> washers/plumber's tape | Looser/less precise on exact names |

- **Lexical**: SQLite FTS5, Porter-stemmed (`items_fts` table, `db.js`).
  BM25 ranking, zero extra infra.
- **Semantic**: every item embedded once via a local sentence-transformer
  (`Xenova/all-MiniLM-L6-v2`, 384-dim, fully offline, `embeddings.js`).
  Query embedded the same way at request time; cosine similarity surfaces
  topically related items with no word overlap.
- **Merge** (`server/index.js` `/api/chat`): lexical hits first (trusted as
  near-exact), semantic hits fill remaining slots, deduped, capped at 60
  items total (`CATALOG_LIMIT`, `LEXICAL_LIMIT=40`, `SEMANTIC_LIMIT=40`).
  That 60-item list -- not the full catalog -- is what hits the LLM prompt.

## 3. Index build

- `items_fts` built in `seed.js`; `item_embeddings` built by a separate,
  resumable `scripts/embed-items.js` (minutes vs. milliseconds for the
  relational seed), batched and committed 32 items at a time.
- Vectors: L2-normalized `Float32Array` BLOBs, so cosine similarity = a
  plain dot product. ~7.5MB total, loaded into memory once at startup --
  semantic search is just a linear scan + sort, no vector DB needed at
  this scale.
- Local embedding model, not an API -- free, offline, no query-time
  network round-trip. Only generation hits an external API (Groq).

## 4. Retrieval -> generation

- Merged candidate list resolved to real rows (name, aisle, department),
  formatted as a plain-text list, dropped into the system prompt verbatim.
- Prompt explicitly constrains the model: pick **only** from this list,
  use the **exact** name, don't force a match if nothing fits.
- Model also tracks a second piece of state across turns: the customer's
  current in-store location, matched against a known list, asked for only
  if still missing (uses last 8 turns of history for continuity).
- Groq (`openai/gpt-oss-20b` default, `120b` override), called with
  `response_format: json_object` -> strict
  `{"reply", "items", "location"}` shape, so the frontend treats the
  response as structured data, not prose to parse.
- Groq picked for a genuinely free, no-card tier. Missing `GROQ_API_KEY`
  degrades to a clear setup error, not a crash.
- Retrieval query text = current message + all prior turns' content, so
  "I need a drill" -> "actually cordless" still retrieves drill-adjacent
  items on turn two.

## 5. Rest of the stack

- **Frontend** (`web/`): Vite + React + `@react-three/fiber`/`drei` for
  the isometric scene (`scene/*`). `pathfinding.ts` runs Dijkstra over the
  nav graph to route from known location to each resolved item.
  `ui/Chat.tsx` is the chat widget; `ui/Controls.tsx` + `ThemeContext.tsx`
  handle view controls and theming.
- **Backend** (`server/`): Express over `node:sqlite` (built-in, no native
  driver). `geometry.js` is the largest file -- procedurally generates the
  entire floor plan (aisles, bays, wall shelves, nav graph, doors,
  checkout counters) from a small set of constants.
## 6. Known trade-offs / next steps

- Brute-force semantic scan is fine at ~5,000 items, wouldn't scale to a
  real multi-store catalog without an actual ANN index or vector store.
- Merge is a fixed-priority union (lexical first, semantic fills gaps),
  not a learned/score-normalized blend (e.g. reciprocal rank fusion) --
  works well here but a reranker would likely help at larger scale.
- No feedback loop / eval set. The Kaggle dataset ships human relevance
  judgments that aren't used yet -- natural next step to actually score
  retrieval quality instead of eyeballing it.
