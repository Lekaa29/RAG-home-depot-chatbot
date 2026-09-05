// One-time importer: reads the raw Kaggle "Home Depot Product Search
// Relevance" CSVs (train.csv, product_descriptions.csv, attributes.csv),
// classifies real products into our aisles by keyword, and writes a
// compact server/kaggle-items.json that seed.js consumes instead of the
// small hand-written item list. Run with: node scripts/import-kaggle.js
//
// This only decides which DEPARTMENT (aisle) each item belongs to -- which
// specific shelf/bay/column it lands on (including overflow onto the wall
// shelves for the busiest departments) is decided in server/geometry.js's
// buildCatalog(), which knows the real shelf layout.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "..", "data", "kaggle-home-depot");
const OUT_PATH = path.join(__dirname, "..", "kaggle-items.json");

// Per-department cap. Real uncapped keyword-match counts against this
// dataset range from ~58 (Safety Equipment) to ~4,200 (Plumbing) -- most
// departments hit this cap, a handful of thin ones just take everything
// they've got. Tuned so the total lands around 5,000 real (non-synthetic)
// items, spread across the store's actual shelf/column/overflow capacity.
const MAX_PER_AISLE = 300;

// Home Depot's real taxonomy isn't in this dataset, so products are
// classified into our aisle themes by keyword match against the title.
// First matching department wins; unmatched titles are skipped (a lot of
// the Kaggle catalog is outside a DIY-hardware store's scope, e.g. patio
// furniture, appliances). Aisle numbers match server/geometry.js's
// AISLE_NUM_BY_SLOT -- 19-23 are the new "Power Tools & Electrical Annex"
// aisles added when the store was extended.
const DEPARTMENTS = [
  { name: "Lumber & Building Materials", aisle: 1, icon: "🪵", re: /\b(lumber|plywood|particleboard|drywall|stud|osb board|wood board)\b/i },
  { name: "Nails & Hammers", aisle: 2, icon: "🔨", re: /\b(nail|hammer|rivet)\b/i },
  { name: "Screws, Bolts & Anchors", aisle: 3, icon: "🔩", re: /\b(screw|anchor|bolt|washer|bracket|hinge)\b/i },
  { name: "Hand Tools", aisle: 4, icon: "🛠️", re: /\b(screwdriver|wrench|pliers?|hand tool|chisel|utility knife)\b/i },
  { name: "Power Tools", aisle: 5, icon: "🪚", re: /\b(drill|saw|sander|grinder|impact driver|power tool|nail gun)\b/i },
  { name: "Safety Equipment", aisle: 6, icon: "🥽", re: /\b(glove|goggles?|respirator|safety mask|ear protection|safety vest)\b/i },
  { name: "Lighting & Cords", aisle: 7, icon: "💡", re: /\b(light bulb|led bulb|lamp|light fixture|extension cord|flashlight)\b/i },
  { name: "Paint & Supplies", aisle: 8, icon: "🎨", re: /\b(paint|primer|paintbrush|paint roller|stain|varnish)\b/i },
  { name: "Garden Tools", aisle: 13, icon: "🧹", re: /\b(shovel|rake|garden hoe|garden tool|pruner)\b/i },
  { name: "Doors, Locks & Hardware", aisle: 14, icon: "🔒", re: /\b(door lock|padlock|deadbolt|door knob|door hinge|door handle)\b/i },
  { name: "Home Safety Devices", aisle: 15, icon: "🚨", re: /\b(smoke detector|carbon monoxide|air filter|fire extinguisher|alarm)\b/i },
  { name: "Adhesives & Sealants", aisle: 16, icon: "🧴", re: /\b(glue|caulk|adhesive|sealant|epoxy|duct tape)\b/i },
  { name: "Measuring & Layout Tools", aisle: 17, icon: "📏", re: /\b(tape measure|\blevel\b|\bsquare\b|laser level|ruler)\b/i },
  { name: "Wire & Electrical", aisle: 18, icon: "⚡", re: /\b(wire|cable|circuit breaker|conduit|electrical box|outlet|switch)\b/i },
  { name: "Tile & Flooring", aisle: 19, icon: "🧱", re: /\b(tile|grout|flooring|laminate floor|vinyl plank|carpet)\b/i },
  { name: "Plumbing", aisle: 20, icon: "🚰", re: /\b(pipe|faucet|valve|drain|toilet|sink|plumbing)\b/i },
  { name: "Rope, Chain & Straps", aisle: 21, icon: "🪢", re: /\b(rope|tarp|strap|twine|chain link|bungee)\b/i },
  { name: "Outdoor Power Equipment", aisle: 22, icon: "🚜", re: /\b(wheelbarrow|lawn mower|trimmer|leaf blower|chainsaw)\b/i },
  { name: "Storage & Organization", aisle: 23, icon: "🗃️", re: /\b(shelf|shelving|storage bin|tool box|tool chest|cabinet|organizer)\b/i },
];

function parseCSV(text) {
  const rows = [];
  parseCSVStream(text, (row) => rows.push(row));
  return rows;
}

// Streaming variant for the large files -- calls onRow per row instead of
// collecting everything into memory, so the caller can discard rows it
// doesn't need (e.g. products outside our selected set) as it goes.
function parseCSVStream(text, onRow) {
  let row = [];
  let field = "";
  let inQuotes = false;
  const n = text.length;
  for (let i = 0; i < n; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\r") {
      // skip, \n handles the line break
    } else if (c === "\n") {
      row.push(field);
      onRow(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    onRow(row);
  }
}

function classify(title) {
  for (const dept of DEPARTMENTS) {
    if (dept.re.test(title)) return dept;
  }
  return null;
}

console.log("Reading train.csv ...");
const trainRows = parseCSV(fs.readFileSync(path.join(DATA_DIR, "train.csv"), "latin1"));
const header = trainRows[0];
const uidIdx = header.indexOf("product_uid");
const titleIdx = header.indexOf("product_title");

const uniqueProducts = new Map(); // product_uid -> title
for (let i = 1; i < trainRows.length; i++) {
  const r = trainRows[i];
  if (!r || r.length < header.length) continue;
  const uid = r[uidIdx];
  if (!uid || uniqueProducts.has(uid)) continue;
  uniqueProducts.set(uid, r[titleIdx]);
}
console.log(`  ${uniqueProducts.size} unique products in train.csv`);

// classify + cap per aisle
const perAisleCount = new Map();
const selected = new Map(); // product_uid -> { title, dept }
for (const [uid, title] of uniqueProducts) {
  const dept = classify(title);
  if (!dept) continue;
  const count = perAisleCount.get(dept.aisle) ?? 0;
  if (count >= MAX_PER_AISLE) continue;
  perAisleCount.set(dept.aisle, count + 1);
  selected.set(uid, { title, dept });
}
console.log(`  ${selected.size} products matched a department and were selected`);

console.log("Reading product_descriptions.csv (this file is large, may take a bit) ...");
const descriptions = new Map();
{
  let first = true;
  parseCSVStream(fs.readFileSync(path.join(DATA_DIR, "product_descriptions.csv"), "latin1"), (r) => {
    if (first) {
      first = false;
      return;
    }
    if (!r || r.length < 2) return;
    if (selected.has(r[0])) descriptions.set(r[0], r[1]);
  });
}
console.log(`  matched ${descriptions.size} descriptions`);

console.log("Reading attributes.csv (this file is large, may take a bit) ...");
const specsByUid = new Map();
const brandByUid = new Map();
{
  let first = true;
  parseCSVStream(fs.readFileSync(path.join(DATA_DIR, "attributes.csv"), "latin1"), (r) => {
    if (first) {
      first = false;
      return;
    }
    if (!r || r.length < 3) return;
    const [uid, name, value] = r;
    if (!selected.has(uid) || !name) return;
    if (name === "MFG Brand Name") {
      brandByUid.set(uid, value);
      return;
    }
    if (/^Bullet\d+$/.test(name)) return; // marketing bullets, not structured specs
    if (!specsByUid.has(uid)) specsByUid.set(uid, []);
    specsByUid.get(uid).push({ key: name, value });
  });
}
console.log(`  matched specs for ${specsByUid.size} products`);

// assemble output -- shelf/bay/column assignment (including overflow onto
// wall shelves) happens later in geometry.js's buildCatalog()
const byAisle = new Map();
for (const [uid, { title, dept }] of selected) {
  if (!byAisle.has(dept.aisle)) byAisle.set(dept.aisle, []);
  byAisle.get(dept.aisle).push({ uid, title, dept });
}

const items = [];
for (const [aisle, list] of byAisle) {
  for (const entry of list) {
    const description = descriptions.get(entry.uid) ?? "";
    items.push({
      sku: entry.uid,
      title: entry.title,
      brand: brandByUid.get(entry.uid) ?? null,
      notes: description.slice(0, 220),
      aisle,
      department: entry.dept.name,
      icon: entry.dept.icon,
      specs: specsByUid.get(entry.uid) ?? [],
    });
  }
}

const departments = DEPARTMENTS.map((d) => ({ name: d.name, aisle: d.aisle, icon: d.icon }));

fs.writeFileSync(OUT_PATH, JSON.stringify({ departments, items }, null, 0));
console.log(`Wrote ${items.length} items across ${byAisle.size} aisles to ${OUT_PATH}`);
