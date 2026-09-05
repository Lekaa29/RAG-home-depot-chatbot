// Generates an approximate regular-grid shelf layout + walkway "road" graph,
// proportioned to roughly match the page 13 sales-floor aisle block
// (parallel gondola racks with front/mid/back cross-aisles), plus a back
// zone of perpendicular ("horizontal") racks, an entrance door opening, and
// a row of checkout counters for scale. All units are feet.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KAGGLE_ITEMS_PATH = path.join(__dirname, "kaggle-items.json");

// Physical left-to-right slot layout: aisles 1-8 unchanged, then 5 new aisles
// (19-23) inserted right after the electrical/power-tools run to grow the
// store, then the 4 blank slots (reserve-rack zone + appliance department,
// same role as before), then the original aisles 13-18 -- same numbers,
// just physically shifted 5 slots east so the Kaggle catalog import (which
// hardcodes aisle numbers 1-18) still lines up. `null` marks a blank slot.
// Aisle numbers are only an internal lookup key now -- shoppers only ever
// see each shelf's own unique id (see Shelves.tsx) -- so they don't need to
// be spatially monotonic.
const AISLE_NUM_BY_SLOT = [
  1, 2, 3, 4, 5, 6, 7, 8,
  19, 20, 21, 22, 23,
  null, null, null, null,
  13, 14, 15, 16, 17, 18,
];
const RACK_COUNT = AISLE_NUM_BY_SLOT.length; // 23 -- parallel shelf racks ("aisles"), running north/south
const slotByAisleNum = new Map();
AISLE_NUM_BY_SLOT.forEach((num, slot) => {
  if (num !== null) slotByAisleNum.set(num, slot);
});
// Of the 4 blank slots, the last 2 host the appliance department below.
const APPLIANCE_ZONE_SLOTS = [15, 16];

const SHELF_DEPTH = 4; // thickness of a rack, perpendicular to its length
const COLUMN_WIDTH = 5; // ft per shelf column -- a 60ft bay works out to ~12 columns
const AISLE_GAP = 10; // walkway width between two racks
const SPACING = SHELF_DEPTH + AISLE_GAP; // 14 ft between rack centers
const SHELF_HEIGHT = 18; // tall warehouse racking, not a low display shelf -- one story taller than before
const TWO_STORY_HEIGHT = 30; // high-bay racking -- now the default height everywhere
// Aisles that stay at the shorter standard height instead of going two-story
// -- a deliberate low-shelf pocket right next to the appliance/reserve zone.
const STANDARD_HEIGHT_AISLES = new Set([13, 14, 15, 16]);

const FRONT_CLEARANCE = 10; // cross-aisle band near entrance
const SEG1_LEN = 60; // front shelf segment length
const MID_GAP = 10; // mid cross-aisle band
const SEG2_LEN = 55; // back shelf segment length
const BACK_CLEARANCE = 10; // cross-aisle band near receiving

const Z_FRONT_BAND = FRONT_CLEARANCE / 2; // 5
const SEG1_START = FRONT_CLEARANCE; // 10
const SEG1_END = SEG1_START + SEG1_LEN; // 70
const Z_SEG1_MID = (SEG1_START + SEG1_END) / 2; // 40
const Z_MID_BAND = SEG1_END + MID_GAP / 2; // 75
const SEG2_START = SEG1_END + MID_GAP; // 80
const SEG2_END = SEG2_START + SEG2_LEN; // 135
const Z_SEG2_MID = (SEG2_START + SEG2_END) / 2; // 107.5
const Z_BACK_BAND = SEG2_END + BACK_CLEARANCE / 2; // 140
const TOTAL_DEPTH = SEG2_END + BACK_CLEARANCE; // 145
const TOTAL_WIDTH = RACK_COUNT * SPACING; // 252

// Perpendicular ("horizontal", running east/west) racks in a reserve/overstock
// zone behind the main aisle grid -- gives the store both shelf orientations.
const HORIZ_RACK_COUNT = 3;
const HORIZ_THICKNESS = SHELF_DEPTH; // 4, same profile as the vertical racks
const HORIZ_GAP = 9;
const HORIZ_SPACING = HORIZ_THICKNESS + HORIZ_GAP; // 13
const HORIZ_MARGIN = 10; // clearance from the east/west walls
const HORIZ_ZONE_START = TOTAL_DEPTH + 12; // local z, clears the back cross-aisle
// The zone is still sized as if 3 rows lived here (keeps the footprint/back
// wall math unchanged) even though only the middle row is actually built.
const HORIZ_ZONE_END = HORIZ_ZONE_START + (HORIZ_RACK_COUNT - 1) * HORIZ_SPACING + HORIZ_THICKNESS;
const HORIZ_LENGTH = TOTAL_WIDTH - 2 * HORIZ_MARGIN;
const HORIZ_MID_GAP = 10; // splits the single remaining row into two, like the vertical aisles' mid cross-aisle

// Where the sales-floor aisle grid sits inside the wider building footprint
// (leaves room in front for checkout/entrance, behind for the notch/back wall,
// and to the left for the garden center bump-out). See buildFootprint().
const OFFSET_X = 50;
const OFFSET_Z = 40;

const ROWS = [Z_FRONT_BAND, Z_SEG1_MID, Z_MID_BAND, Z_SEG2_MID, Z_BACK_BAND];
const CROSS_ROWS = new Set([Z_FRONT_BAND, Z_MID_BAND, Z_BACK_BAND]);

// Pairs up physically-adjacent racks (not necessarily adjacent aisle
// *numbers*, since the extension aisles break that) -- each pair gets a
// solid partition wall between them instead of a walkway, so the pair's
// second member has to pick up its item from the far/open side instead of
// the now-walled near side. Returns [firstAisleNum, secondAisleNum] tuples.
// A slot with no adjacent neighbor (a blank on one side, or an odd one out)
// stays unpaired -- a normal aisle with open walkways on both sides.
function computeAislePairs() {
  const remainingSlots = [];
  for (let slot = 0; slot < RACK_COUNT; slot++) {
    if (AISLE_NUM_BY_SLOT[slot] !== null) remainingSlots.push(slot);
  }
  const pairs = [];
  let i = 0;
  while (i < remainingSlots.length) {
    const s1 = remainingSlots[i];
    const s2 = remainingSlots[i + 1];
    if (s2 === s1 + 1) {
      pairs.push([AISLE_NUM_BY_SLOT[s1], AISLE_NUM_BY_SLOT[s2]]);
      i += 2;
    } else {
      i += 1;
    }
  }
  return pairs;
}

// Thickness of the partition wall between paired racks (vs. AISLE_GAP=10 for
// a normal walkway). Each paired rack shifts toward the shared wall by half
// the difference, so the two racks actually touch its faces instead of
// floating in the middle of the old walkway. Walkway *column* positions
// (and therefore the nav graph) are left untouched -- only the rack meshes
// move -- so the freed-up space shows up as slightly wider open aisles on
// the outside of each pair rather than shrinking the store.
const WALL_THIN = 1;
const PARTITION_WALL_HEIGHT = 16; // a bit taller than the 14ft racking it divides
const PAIR_SHIFT = (AISLE_GAP - WALL_THIN) / 2;

function rackShiftByAisle() {
  const shifts = new Map();
  for (const [a, b] of computeAislePairs()) {
    shifts.set(a, PAIR_SHIFT); // first of pair moves east, toward the wall
    shifts.set(b, -PAIR_SHIFT); // second of pair moves west, toward the wall
  }
  return shifts;
}

function walkwayX(col) {
  return OFFSET_X + col * SPACING;
}
function rackX(rack) {
  return walkwayX(rack) + SPACING / 2;
}
function offsetZ(z) {
  return OFFSET_Z + z;
}

// Computes an item's own world position from its shelf + 1-based column
// index, offsetting along whichever direction the shelf's own length
// actually runs (derived from rotation_deg the same way ShelfRack orients
// itself), so multiple items on one shelf land at visibly distinct spots
// instead of all stacking on the shelf's center point.
function columnPosition(shelf, columnIndex) {
  const t = (columnIndex - 0.5) / shelf.columns - 0.5;
  const theta = (shelf.rotation_deg * Math.PI) / 180;
  const offset = t * shelf.depth;
  return {
    x: shelf.x + Math.sin(theta) * offset,
    z: shelf.z + Math.cos(theta) * offset,
  };
}

// Approximate exterior wall outline, styled after page 13's building silhouette:
// a chamfered front-right corner (loading/tool rental side), a recessed notch
// at the back-left (receiving/riser room jog), and a garden center bump-out on
// the west side. Not a precise digitization -- parametrized off the same rack
// counts/spacing above so it always comfortably contains the shelf grid.
// Vertices are ordered clockwise (viewed from above).
function buildFootprint() {
  const mainLeft = OFFSET_X - 10;
  const gardenLeft = OFFSET_X - 70;
  const gardenZStart = OFFSET_Z + 50;
  const gardenZEnd = OFFSET_Z + 130;
  const right = OFFSET_X + TOTAL_WIDTH + 18;
  const frontZ = OFFSET_Z - 45;
  const chamferX = right - 30;
  const chamferZ = frontZ + 25;
  const notchX = mainLeft + 90;
  const horizZoneEndWorld = offsetZ(HORIZ_ZONE_END);
  const notchShallowZ = horizZoneEndWorld + 8;
  const backDeepZ = notchShallowZ + 15;

  const points = [
    { x: mainLeft, z: frontZ }, // front-left (south-west) of main body
    { x: chamferX, z: frontZ }, // front wall east to chamfer start
    { x: right, z: chamferZ }, // chamfered corner
    { x: right, z: backDeepZ }, // east wall north to back wall
    { x: notchX, z: backDeepZ }, // back wall west to notch
    { x: notchX, z: notchShallowZ }, // notch step (receiving/riser jog is shallower)
    { x: mainLeft, z: notchShallowZ }, // notch back wall west to main west wall
    { x: mainLeft, z: gardenZEnd }, // main west wall south to garden bump
    { x: gardenLeft, z: gardenZEnd }, // jog west into garden center
    { x: gardenLeft, z: gardenZStart }, // garden center west wall
    { x: mainLeft, z: gardenZStart }, // jog back out of garden center
  ];
  const xs = points.map((p) => p.x);
  const zs = points.map((p) => p.z);

  // double sliding door centered on the main entrance, cut into the front wall
  const doorWidth = 14;
  const doors = [{ x: walkwayX(Math.round(RACK_COUNT / 2)), z: frontZ, width: doorWidth, rotationY: 0 }];

  // ten checkout counters side by side in the open zone between the doors
  // and the first aisle -- a small, human-scale object next to the shelving.
  const counterWidth = 4;
  const counterGap = 1.5;
  const counterCount = 10;
  const rowWidth = counterCount * counterWidth + (counterCount - 1) * counterGap;
  const rowStartX = OFFSET_X + TOTAL_WIDTH / 2 - rowWidth / 2;
  const checkoutZ = 22;
  const checkoutCounters = Array.from({ length: counterCount }, (_, i) => ({
    id: i + 1,
    x: rowStartX + i * (counterWidth + counterGap) + counterWidth / 2,
    z: checkoutZ,
    width: counterWidth,
  }));

  // partition walls between paired aisles (1x2, 3x4, ...), replacing what
  // was a walkway. Mirrors the shelves' own front/back bay split -- two
  // pieces matching each bay's length, leaving the mid cross-aisle open.
  // The two-story pair gets a taller wall to match its taller racking.
  const partitionWalls = computeAislePairs().flatMap(([a, b]) => {
    const x = walkwayX(slotByAisleNum.get(b)); // shared walkway column = second aisle's own (now walled) west side
    const height = STANDARD_HEIGHT_AISLES.has(a) ? PARTITION_WALL_HEIGHT : TWO_STORY_HEIGHT - 3;
    return [
      { x, z: offsetZ(Z_SEG1_MID), width: WALL_THIN, depth: SEG1_LEN, height },
      { x, z: offsetZ(Z_SEG2_MID), width: WALL_THIN, depth: SEG2_LEN, height },
    ];
  });

  // appliance department where aisles 11 & 12 used to be -- a fridge "aisle"
  // (10 units facing another 10 across a walkway) followed by a washer aisle
  // of the same shape, further down the same freed corridor. Units within a
  // row sit almost flush against each other; rotation_deg turns each row to
  // face the row across the walkway, same convention as shelves' rotation.
  const applianceCenterX = walkwayX(APPLIANCE_ZONE_SLOTS[1]); // walkway between the two blank appliance slots
  const FRIDGE_SIZE = 5.2; // must match the (square) box footprint in Appliances.tsx
  const WASHER_SIZE = 4.6;
  const APPLIANCE_UNIT_GAP = 1.2; // small breathing room between neighboring units
  const APPLIANCE_ROW_GAP = 7; // walkway between the two facing rows
  const APPLIANCE_ROW_COUNT = 10; // units per row, so 2x this per aisle
  const APPLIANCE_DEPT_GAP = 6; // gap between the fridge aisle and the washer aisle

  function buildApplianceAisle(type, size, startZ) {
    const rowXOffset = size / 2 + APPLIANCE_ROW_GAP / 2;
    const step = size + APPLIANCE_UNIT_GAP;
    const units = [];
    for (let i = 0; i < APPLIANCE_ROW_COUNT; i++) {
      const z = startZ + i * step;
      units.push({ type, x: applianceCenterX - rowXOffset, z, rotation_deg: 90 }); // west row, faces east
      units.push({ type, x: applianceCenterX + rowXOffset, z, rotation_deg: -90 }); // east row, faces west
    }
    const length = (APPLIANCE_ROW_COUNT - 1) * step + size;
    return { units, length, halfWidth: rowXOffset + size / 2 };
  }

  const fridgeStartZ = offsetZ(20);
  const fridgeAisle = buildApplianceAisle("fridge", FRIDGE_SIZE, fridgeStartZ);
  const washerStartZ = fridgeStartZ + fridgeAisle.length + APPLIANCE_DEPT_GAP;
  const washerAisle = buildApplianceAisle("washer", WASHER_SIZE, washerStartZ);

  let applianceId = 1;
  const appliances = [...fridgeAisle.units, ...washerAisle.units].map((u) => ({ id: applianceId++, ...u }));

  // painted floor department zones -- a rectangle outline + text per remaining
  // aisle pair, plus the appliance/garden/overstock zones. Each entry carries
  // a bounding box (x/z center + width/depth) so the client can draw the
  // outline around the actual area rather than just dropping a point label.
  const DEPARTMENT_NAMES = [
    "Lumber & Building Materials",
    "Hardware & Fasteners",
    "Power Tools",
    "Electrical & Lighting",
    "Outdoor & Garden Tools",
    "Home Safety",
    "Wire & Circuits",
  ];
  // the two new extension pairs (19-23) get one combined zone below instead
  // of individual department names.
  const floorLabels = computeAislePairs()
    .filter(([a]) => a < 19)
    .map(([a, b], i) => {
      const xMin = Math.min(rackX(slotByAisleNum.get(a)), rackX(slotByAisleNum.get(b))) - SHELF_DEPTH / 2 - 3;
      const xMax = Math.max(rackX(slotByAisleNum.get(a)), rackX(slotByAisleNum.get(b))) + SHELF_DEPTH / 2 + 3;
      const zMin = offsetZ(Z_FRONT_BAND);
      const zMax = offsetZ(Z_BACK_BAND);
      return {
        id: i + 1,
        text: DEPARTMENT_NAMES[i] ?? `Aisles ${a}-${b}`,
        x: (xMin + xMax) / 2,
        z: (zMin + zMax) / 2,
        width: xMax - xMin,
        depth: zMax - zMin,
      };
    });
  let labelId = floorLabels.length + 1;
  {
    const xMin = rackX(slotByAisleNum.get(19)) - SHELF_DEPTH / 2 - 3;
    const xMax = rackX(slotByAisleNum.get(23)) + SHELF_DEPTH / 2 + 3;
    const zMin = offsetZ(Z_FRONT_BAND);
    const zMax = offsetZ(Z_BACK_BAND);
    floorLabels.push({
      id: labelId++,
      text: "Power Tools & Electrical Annex",
      x: (xMin + xMax) / 2,
      z: (zMin + zMax) / 2,
      width: xMax - xMin,
      depth: zMax - zMin,
    });
  }
  const ZONE_MARGIN = 1.5; // small enough that the two appliance zones can't overlap each other
  for (const [text, aisle, startZ, size] of [
    ["Refrigerators", fridgeAisle, fridgeStartZ, FRIDGE_SIZE],
    ["Washers & Dryers", washerAisle, washerStartZ, WASHER_SIZE],
  ]) {
    // aisle.length overshoots the last unit's far edge by size/2 (it's
    // measured center-to-center plus one full unit), so the near edge needs
    // its own size/2 back-off -- otherwise the box clips the first row for
    // any unit size bigger than the flat margin used to work around.
    const xMin = applianceCenterX - aisle.halfWidth - ZONE_MARGIN;
    const xMax = applianceCenterX + aisle.halfWidth + ZONE_MARGIN;
    const zMin = startZ - size / 2 - ZONE_MARGIN;
    const zMax = startZ + aisle.length - size / 2 + ZONE_MARGIN;
    floorLabels.push({
      id: labelId++,
      text,
      x: (xMin + xMax) / 2,
      z: (zMin + zMax) / 2,
      width: xMax - xMin,
      depth: zMax - zMin,
    });
  }
  floorLabels.push({
    id: labelId++,
    text: "Garden Center",
    x: (mainLeft + gardenLeft) / 2,
    z: (gardenZStart + gardenZEnd) / 2,
    width: mainLeft - gardenLeft,
    depth: gardenZEnd - gardenZStart,
  });
  {
    const overXMin = OFFSET_X + HORIZ_MARGIN - 4;
    const overXMax = OFFSET_X + TOTAL_WIDTH - HORIZ_MARGIN + 4;
    const overZMin = offsetZ(HORIZ_ZONE_START - 4);
    const overZMax = offsetZ(HORIZ_ZONE_END + 4);
    floorLabels.push({
      id: labelId++,
      text: "Overstock",
      x: (overXMin + overXMax) / 2,
      z: (overZMin + overZMax) / 2,
      width: overXMax - overXMin,
      depth: overZMax - overZMin,
    });
  }

  return {
    points,
    doors,
    checkoutCounters,
    partitionWalls,
    appliances,
    floorLabels,
    bounds: {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minZ: Math.min(...zs),
      maxZ: Math.max(...zs),
    },
  };
}

// Small built-in catalog used if server/kaggle-items.json hasn't been
// generated yet (see scripts/import-kaggle.js). [name, aisle, bay, notes, icon]
const FALLBACK_ITEM_DEFS = [
  ["2x4 Lumber Studs", 1, 1, "Framing lumber, 8ft", "🪵"],
  ["Plywood Sheet", 1, 2, "4x8 ft, 1/2 in", "🪵"],
  ["Hammer", 2, 1, "16oz claw hammer", "🔨"],
  ["Nails Box", 2, 2, "3 in common nails, 5lb", "📦"],
  ["Screwdriver Set", 3, 1, "6-piece, magnetic tips", "🪛"],
  ["PVC Pipe Fittings", 3, 2, "1/2 in - 2 in assortment", "🔧"],
  ["Power Drill Bits", 4, 1, "Titanium, 29-piece set", "🔩"],
  ["Cordless Drill Kit", 4, 2, "20V, includes 2 batteries", "🔋"],
  ["Circular Saw", 5, 1, "7-1/4 in, corded", "🪚"],
  ["Work Gloves", 5, 2, "Leather palm, size L", "🧤"],
  ["Safety Goggles", 6, 1, "Anti-fog, clear lens", "🥽"],
  ["Duct Tape", 6, 2, "Heavy duty, 60 yd", "📏"],
  ["LED Light Bulbs 4-pack", 7, 1, "60W equivalent, daylight", "💡"],
  ["Extension Cord 25ft", 7, 2, "Outdoor rated, 12 gauge", "🔌"],
  ["Interior Paint - Gallon", 8, 1, "Eggshell, tintable base", "🎨"],
  ["Paint Brushes", 8, 2, "3-piece angled set", "🖌️"],
  ["Rope 100ft", 13, 1, "Braided nylon, 3/8 in", "🪢"],
  ["Tarp 12x16", 13, 2, "Waterproof poly tarp", "🧵"],
  ["Wheelbarrow", 14, 1, "6 cu ft, steel", "🛒"],
  ["Shovel", 14, 2, "Round point, fiberglass handle", "🪏"],
  ["Garden Rake", 13, 1, "22-tine, steel", "🧹"],
  ["Potting Soil Bag", 13, 2, "1 cu ft, all-purpose", "🪴"],
  ["Door Hinges", 14, 1, "3.5 in, satin nickel, 3-pack", "🚪"],
  ["Padlock", 14, 2, "Weatherproof, keyed", "🔒"],
  ["Smoke Detector", 15, 1, "Battery powered, 10-year", "🚨"],
  ["Air Filter", 15, 2, "16x20x1, pleated", "🌬️"],
  ["Caulk Gun", 16, 1, "Drip-free, half barrel", "🧴"],
  ["Wood Glue", 16, 2, "Waterproof, 16oz", "🧴"],
  ["Measuring Tape", 17, 1, "25ft, magnetic hook", "📏"],
  ["Level Tool", 17, 2, "24in, aluminum", "📐"],
  ["Wire Spool", 18, 1, "12 AWG, 250ft", "🧵"],
  ["Circuit Breaker", 18, 2, "20A, single pole", "⚡"],
];

// Departments whose real Kaggle supply comfortably exceeds their primary
// aisle's own column capacity spill their overflow onto one of the
// decorative reserve/wall shelves (aisle numbers 24+, see buildLayout) --
// this is what actually puts real, distinct SKUs on those shelves instead of
// leaving them empty. Picked so the biggest-volume departments land on the
// biggest overflow shelves (see the capacity check in the project plan).
const OVERFLOW_AISLE_BY_DEPARTMENT_AISLE = {
  20: 27, // Plumbing -> 182ft back-wall run
  19: 26, // Tile & Flooring -> 161ft back-wall run
  23: 24, // Storage & Organization -> reserve rack segment
  8: 25, // Paint & Supplies -> reserve rack segment
  3: 33, // Screws, Bolts & Anchors -> wall segment
  18: 31, // Wire & Electrical -> wall segment
  7: 28, // Lighting & Cords -> wall segment
  5: 29, // Power Tools -> wall segment
  4: 30, // Hand Tools -> wall segment
  2: 32, // Nails & Hammers -> wall segment
};
const ITEMS_PER_COLUMN_PRIMARY = 6; // soft density before a department spills onto its overflow shelf

// Builds categories/items/specs either from the imported real Kaggle catalog
// (server/kaggle-items.json, see scripts/import-kaggle.js) if it exists, or
// from the small hand-written fallback list above otherwise.
function buildCatalog(shelfByAisleBay) {
  const categories = [];
  const items = [];
  const itemSpecs = [];
  let itemId = 1;

  if (fs.existsSync(KAGGLE_ITEMS_PATH)) {
    const { departments, items: kaggleItems } = JSON.parse(fs.readFileSync(KAGGLE_ITEMS_PATH, "utf8"));

    const rootId = 1;
    categories.push({ id: rootId, name: "Store", parent_id: null });
    const categoryIdByAisle = new Map();
    departments.forEach((dept, i) => {
      const id = i + 2;
      categories.push({ id, name: dept.name, parent_id: rootId });
      categoryIdByAisle.set(dept.aisle, id);
    });

    const byAisle = new Map();
    for (const it of kaggleItems) {
      if (!byAisle.has(it.aisle)) byAisle.set(it.aisle, []);
      byAisle.get(it.aisle).push(it);
    }

    for (const [aisleNum, list] of byAisle) {
      const front = shelfByAisleBay[`${aisleNum}-1`];
      const back = shelfByAisleBay[`${aisleNum}-2`];
      if (!front) continue;

      const primarySlots = [];
      for (let c = 1; c <= front.columns; c++) primarySlots.push([front, c]);
      if (back) for (let c = 1; c <= back.columns; c++) primarySlots.push([back, c]);

      const overflowShelf = shelfByAisleBay[`${OVERFLOW_AISLE_BY_DEPARTMENT_AISLE[aisleNum]}-1`];
      const overflowSlots = overflowShelf
        ? Array.from({ length: overflowShelf.columns }, (_, i) => [overflowShelf, i + 1])
        : [];
      const primaryCapacity = primarySlots.length * ITEMS_PER_COLUMN_PRIMARY;

      list.forEach((it, i) => {
        const slots = i < primaryCapacity || overflowSlots.length === 0 ? primarySlots : overflowSlots;
        const idx = i < primaryCapacity ? i : i - primaryCapacity;
        const [shelf, columnIndex] = slots[idx % slots.length];
        const pos = columnPosition(shelf, columnIndex);

        const id = itemId++;
        items.push({
          id,
          name: it.title,
          shelf_id: shelf.id,
          column_index: columnIndex,
          x: pos.x,
          z: pos.z,
          category_id: categoryIdByAisle.get(aisleNum) ?? null,
          sku: it.sku,
          brand: it.brand,
          notes: it.notes,
          icon: it.icon,
        });
        for (const spec of it.specs) {
          itemSpecs.push({ item_id: id, key: spec.key, value: spec.value });
        }
      });
    }
  } else {
    for (const [name, aisleNum, bayIndex, notes, icon] of FALLBACK_ITEM_DEFS) {
      const shelf = shelfByAisleBay[`${aisleNum}-${bayIndex}`];
      if (!shelf) continue;
      items.push({
        id: itemId++,
        name,
        shelf_id: shelf.id,
        column_index: 1,
        x: shelf.x,
        z: shelf.z,
        category_id: null,
        sku: null,
        brand: null,
        notes,
        icon,
      });
    }
  }

  return { categories, items, itemSpecs };
}

function buildLayout() {
  const shelves = [];
  const navNodes = [];
  const navEdges = [];
  const footprint = buildFootprint(); // computed early -- the wall-hugging shelves below need its outline

  // nav nodes: one per (walkway column, row band). RACK_COUNT+1 columns.
  const nodeId = (col, rowIdx) => col * ROWS.length + rowIdx;
  for (let col = 0; col <= RACK_COUNT; col++) {
    ROWS.forEach((z, rowIdx) => {
      navNodes.push({ id: nodeId(col, rowIdx), x: walkwayX(col), z: offsetZ(z) });
    });
  }

  // vertical edges along each walkway column -- skipped for columns that now
  // have a partition wall between a paired pair of aisles (see
  // computeAislePairs); the cross-band nodes stay put and reach the rest of
  // the graph via the horizontal edges below, exactly like a real wall would
  // still leave the cross-aisles at each end open.
  const aislePairs = computeAislePairs();
  const walledColumns = new Set(aislePairs.map(([, b]) => slotByAisleNum.get(b)));
  for (let col = 0; col <= RACK_COUNT; col++) {
    if (walledColumns.has(col)) continue;
    for (let rowIdx = 0; rowIdx < ROWS.length - 1; rowIdx++) {
      const a = nodeId(col, rowIdx);
      const b = nodeId(col, rowIdx + 1);
      navEdges.push({ from: a, to: b, weight: ROWS[rowIdx + 1] - ROWS[rowIdx] });
    }
  }

  // horizontal edges across the three cross-aisle bands
  ROWS.forEach((z, rowIdx) => {
    if (!CROSS_ROWS.has(z)) return;
    for (let col = 0; col < RACK_COUNT; col++) {
      const a = nodeId(col, rowIdx);
      const b = nodeId(col + 1, rowIdx);
      navEdges.push({ from: a, to: b, weight: SPACING });
    }
  });

  // shelves: two bays (front/back segment) per rack, pickup point on the
  // rack's "west" walkway column (col === rack index).
  const rowIdxFront = ROWS.indexOf(Z_SEG1_MID);
  const rowIdxBack = ROWS.indexOf(Z_SEG2_MID);
  const rackShifts = rackShiftByAisle();
  let shelfId = 1;
  const shelfByAisleBay = {};
  for (let slot = 0; slot < RACK_COUNT; slot++) {
    const aisleNum = AISLE_NUM_BY_SLOT[slot];
    if (aisleNum === null) continue;
    const x = rackX(slot) + (rackShifts.get(aisleNum) ?? 0);
    const height = STANDARD_HEIGHT_AISLES.has(aisleNum) ? SHELF_HEIGHT : TWO_STORY_HEIGHT;

    const front = {
      id: shelfId++,
      aisle_num: aisleNum,
      bay_index: 1,
      x,
      z: offsetZ(Z_SEG1_MID),
      width: SHELF_DEPTH,
      depth: SEG1_LEN,
      rotation_deg: 0,
      height,
      columns: Math.max(1, Math.round(SEG1_LEN / COLUMN_WIDTH)),
      pickup_node_id: nodeId(slot, rowIdxFront),
    };
    const back = {
      id: shelfId++,
      aisle_num: aisleNum,
      bay_index: 2,
      x,
      z: offsetZ(Z_SEG2_MID),
      width: SHELF_DEPTH,
      depth: SEG2_LEN,
      rotation_deg: 0,
      height,
      columns: Math.max(1, Math.round(SEG2_LEN / COLUMN_WIDTH)),
      pickup_node_id: nodeId(slot, rowIdxBack),
    };
    shelves.push(front, back);
    shelfByAisleBay[`${aisleNum}-1`] = front;
    shelfByAisleBay[`${aisleNum}-2`] = back;
  }

  // second member of each pair now backs onto a wall on its west side, so it
  // has to be picked up from its east (open) walkway instead, at column
  // slotB + 1.
  for (const [, b] of aislePairs) {
    const eastCol = slotByAisleNum.get(b) + 1;
    shelfByAisleBay[`${b}-1`].pickup_node_id = nodeId(eastCol, rowIdxFront);
    shelfByAisleBay[`${b}-2`].pickup_node_id = nodeId(eastCol, rowIdxBack);
  }

  // extra shelves beyond the main aisle grid (reserve rack + perimeter wall
  // shelving) get their own synthetic aisle numbers (24+) so buildCatalog can
  // address them individually -- they now carry real overflow items for the
  // busiest departments instead of sitting decorative and empty. They aren't
  // on the nav graph themselves, so their pickup point is the nearest real
  // nav node -- an approximation, but a working route beats none.
  let extraAisleNum = 24;
  function nearestNavNodeId(x, z) {
    let bestId = navNodes[0].id;
    let bestDist = Infinity;
    for (const node of navNodes) {
      const d = (node.x - x) ** 2 + (node.z - z) ** 2;
      if (d < bestDist) {
        bestDist = d;
        bestId = node.id;
      }
    }
    return bestId;
  }

  // perpendicular reserve-stock rack in the back zone -- not on the nav
  // graph (still decorative for pathfinding purposes), rotated 90deg via
  // rotation_deg. Of the original 3-segment middle row, the middle segment
  // itself is now removed, leaving the two outer segments with open floor
  // between them.
  {
    const midRowIndex = Math.floor((HORIZ_RACK_COUNT - 1) / 2);
    const z = offsetZ(HORIZ_ZONE_START + midRowIndex * HORIZ_SPACING + HORIZ_THICKNESS / 2);
    const segLen = (HORIZ_LENGTH - 2 * HORIZ_MID_GAP) / 3;
    const centerX = OFFSET_X + TOTAL_WIDTH / 2;
    const step = segLen + HORIZ_MID_GAP;
    for (const x of [centerX - step, centerX + step]) {
      const shelf = {
        id: shelfId++,
        aisle_num: extraAisleNum++,
        bay_index: 1,
        x,
        z,
        width: HORIZ_THICKNESS,
        depth: segLen,
        rotation_deg: 90,
        height: SHELF_HEIGHT,
        columns: Math.max(1, Math.round(segLen / COLUMN_WIDTH)),
        pickup_node_id: nearestNavNodeId(x, z),
      };
      shelves.push(shelf);
      shelfByAisleBay[`${shelf.aisle_num}-1`] = shelf;
    }
  }

  // perimeter shelving hugging the interior walls -- covers ~70% of each
  // eligible wall's length (centered, margin at each corner), skipping the
  // front wall entirely (edge 0) and its chamfered corner (edge 1) since
  // that's the registers/entrance side. Not on the nav graph, same as the
  // reserve rack above -- but now also carries real overflow items.
  {
    const pts = footprint.points;
    const n = pts.length;
    const cx = pts.reduce((s, p) => s + p.x, 0) / n;
    const cz = pts.reduce((s, p) => s + p.z, 0) / n;
    const MIN_WALL_LEN = 20;
    const COVERAGE = 0.7;
    const WALL_CLEARANCE = 1.5; // gap off the wall face
    for (let i = 0; i < n; i++) {
      if (i === 0 || i === 1) continue; // front wall + its chamfer (registers/door)
      const p1 = pts[i];
      const p2 = pts[(i + 1) % n];
      const dx = p2.x - p1.x;
      const dz = p2.z - p1.z;
      const len = Math.hypot(dx, dz);
      if (len < MIN_WALL_LEN) continue;
      const ux = dx / len;
      const uz = dz / len;
      const midX = (p1.x + p2.x) / 2;
      const midZ = (p1.z + p2.z) / 2;
      // perpendicular to the wall, picking whichever side points inward
      const n1x = uz;
      const n1z = -ux;
      const sign = n1x * (cx - midX) + n1z * (cz - midZ) >= 0 ? 1 : -1;
      const nx = n1x * sign;
      const nz = n1z * sign;
      const runLen = len * COVERAGE;
      const offset = SHELF_DEPTH / 2 + WALL_CLEARANCE;
      const shelf = {
        id: shelfId++,
        aisle_num: extraAisleNum++,
        bay_index: 1,
        x: midX + nx * offset,
        z: midZ + nz * offset,
        width: SHELF_DEPTH,
        depth: runLen,
        rotation_deg: (Math.atan2(ux, uz) * 180) / Math.PI,
        height: SHELF_HEIGHT,
        columns: Math.max(1, Math.round(runLen / COLUMN_WIDTH)),
        pickup_node_id: nearestNavNodeId(midX + nx * offset, midZ + nz * offset),
      };
      shelves.push(shelf);
      shelfByAisleBay[`${shelf.aisle_num}-1`] = shelf;
    }
  }

  const midCol = Math.round(RACK_COUNT / 2);
  const locations = [
    { id: 1, name: "Front Entrance", kind: "entrance", x: walkwayX(midCol), z: offsetZ(-5) },
    { id: 2, name: "Checkout / Registers", kind: "checkout", x: walkwayX(2), z: offsetZ(-5) },
    {
      id: 3,
      name: "Receiving / Back Entrance",
      kind: "entrance",
      x: walkwayX(midCol),
      z: offsetZ(TOTAL_DEPTH + 5),
    },
  ];

  const { categories, items, itemSpecs } = buildCatalog(shelfByAisleBay);

  return {
    shelves,
    locations,
    categories,
    items,
    itemSpecs,
    navNodes,
    navEdges,
    footprint: footprint.points,
    doors: footprint.doors,
    checkoutCounters: footprint.checkoutCounters,
    partitionWalls: footprint.partitionWalls,
    appliances: footprint.appliances,
    floorLabels: footprint.floorLabels,
    bounds: {
      minX: footprint.bounds.minX,
      maxX: footprint.bounds.maxX,
      minZ: footprint.bounds.minZ,
      maxZ: footprint.bounds.maxZ,
      width: footprint.bounds.maxX - footprint.bounds.minX,
      depth: footprint.bounds.maxZ - footprint.bounds.minZ,
    },
  };
}

export { buildLayout, buildFootprint };
