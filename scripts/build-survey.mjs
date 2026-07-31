// Stage 2 of the survey pipeline.
//
// Reads what stage 1 downloaded and turns it into the field kit:
//
//   • decides WHICH paths need surveying, by routing between the four
//     destinations and keeping a buffer of alternatives around those routes
//   • writes survey/segments.csv, survey/nodes.csv, survey/entrances.csv
//   • writes survey/basemap.html — one map, used both to survey and to check
//   • writes src/data/campusNetwork.json — the network the app routes on
//
// Usage:  npm run survey:build     (or: node scripts/build-survey.mjs)
//
// Re-running is safe: any value already typed into the CSVs is carried over
// rather than overwritten.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  DESTINATIONS,
  SEGMENT_COLUMNS,
  SEGMENT_FIELD_COLUMNS,
  ENTRANCE_COLUMNS,
  ENTRANCE_FIELD_COLUMNS,
  haversine,
  distanceToSegment,
  csvRow,
  parseCsv,
} from "./study-area.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIR = join(__dirname, "..", "survey");
const APP_DATA = join(__dirname, "..", "src", "data", "campusNetwork.json");

// How far either side of the main routes to include alternative paths.
// The shortest route between two buildings is frequently NOT the step-free
// one — a flight of stairs is short, its ramp detour is not. Surveying a
// corridor rather than a line is what makes an accessible alternative
// findable at all.
const ALT_BUFFER_M = 45;

// Everything within this radius of a destination is surveyed regardless of
// whether a route passes through it. Accessible entrances and their ramps
// live in the last few metres of a journey, and a corridor drawn around the
// shortest route routinely misses the door you actually need.
const DEST_RADIUS_M = 70;

// --- Load stage 1 output ---------------------------------------------

for (const f of ["campus-network.geojson", "buildings.geojson"]) {
  if (!existsSync(join(DIR, f))) {
    console.error(`ERROR: survey/${f} is missing. Run  npm run survey:fetch  first.`);
    process.exit(1);
  }
}

// `--dry-run` reports what would change without touching a file — useful for
// checking a re-run is safe before it overwrites a CSV you have been typing
// into, and for when a spreadsheet has the file locked anyway.
const DRY_RUN = process.argv.includes("--dry-run");

/** Files that already held exactly the right content, so were left alone. */
const unchanged = [];

// Writing a CSV that a spreadsheet has open fails with EBUSY on Windows
// (Excel and WPS both take an exclusive lock). That will happen constantly to
// anyone typing survey data, so it gets a plain-English message rather than a
// stack trace. segments.csv is written first, so an early failure means
// nothing else has been touched either.
function write(path, contents) {
  const name = path.split(/[\\/]/).pop();
  if (DRY_RUN) {
    console.log(`  [dry run] would write ${name} (${(contents.length / 1024).toFixed(1)} KB)`);
    return;
  }
  // Skip the write when nothing would change. Re-running the build with a
  // CSV open for reference is a normal thing to do, and failing on a file
  // that did not need touching is pure obstruction.
  // Line endings are compared loosely: git checks these files out with CRLF
  // on Windows while the generator emits LF, and rewriting a file purely to
  // flip its newlines is churn that would also lock out anyone with the CSV
  // open for reference.
  const sameContent = (a, b) => a.replace(/\r\n/g, "\n") === b.replace(/\r\n/g, "\n");
  try {
    if (existsSync(path) && sameContent(readFileSync(path, "utf8"), contents)) {
      unchanged.push(name);
      return;
    }
  } catch {
    // Unreadable — fall through and let the write report the real problem.
  }
  try {
    writeFileSync(path, contents);
  } catch (err) {
    if (err.code === "EBUSY" || err.code === "EPERM") {
      console.error(
        `\nERROR: cannot write ${name} — the file is open in another program.\n` +
          `Close it in Excel / WPS 表格 and run this again. Nothing has been changed.\n` +
          `To preview without writing anything, add --dry-run.`
      );
      process.exit(1);
    }
    throw err;
  }
}

const network = JSON.parse(readFileSync(join(DIR, "campus-network.geojson"), "utf8"));
const buildingsGeo = JSON.parse(readFileSync(join(DIR, "buildings.geojson"), "utf8"));

const segments = network.features.filter((f) => f.properties.kind === "segment");
const nodeCoord = new Map(); // node_id -> {lat, lng}
for (const f of network.features) {
  if (f.properties.kind !== "node") continue;
  nodeCoord.set(f.properties.node_id, {
    lng: f.geometry.coordinates[0],
    lat: f.geometry.coordinates[1],
  });
}

const segById = new Map(segments.map((f) => [f.properties.segment_id, f]));
const destPoints = buildingsGeo.features.filter((f) => f.properties.kind === "destination");
const buildingRings = buildingsGeo.features.filter((f) => f.properties.kind === "building");
const entrancePoints = buildingsGeo.features.filter((f) => f.properties.kind === "entrance");

// --- Graph ------------------------------------------------------------

const adj = new Map(); // node_id -> [{ to, seg, w }]
for (const f of segments) {
  const { from, to, segment_id, length_m } = f.properties;
  const w = Number(length_m) || 1;
  if (!adj.has(from)) adj.set(from, []);
  if (!adj.has(to)) adj.set(to, []);
  adj.get(from).push({ to, seg: segment_id, w });
  adj.get(to).push({ to: from, seg: segment_id, w });
}

// OSM footway data always contains stranded fragments — service stubs and
// paths whose ends were never joined. Snapping a building onto one of those
// would make it unreachable, so only the largest connected component counts.
function largestComponent() {
  const seen = new Set();
  let best = new Set();
  for (const start of adj.keys()) {
    if (seen.has(start)) continue;
    const comp = new Set();
    const stack = [start];
    while (stack.length) {
      const u = stack.pop();
      if (comp.has(u)) continue;
      comp.add(u);
      seen.add(u);
      for (const e of adj.get(u) ?? []) if (!comp.has(e.to)) stack.push(e.to);
    }
    if (comp.size > best.size) best = comp;
  }
  return best;
}
const mainComponent = largestComponent();

function nearestNode(pt, within = mainComponent) {
  let best = null;
  let bestD = Infinity;
  for (const id of within) {
    const c = nodeCoord.get(id);
    if (!c) continue;
    const d = haversine(pt, c);
    if (d < bestD) ((bestD = d), (best = id));
  }
  return { nodeId: best, distance: bestD };
}

// Segments OSM tags as steps. This is the one accessibility fact OSM is
// reliable about here (80 of 506 segments), so it is safe to route around
// before any fieldwork has happened.
const isSteps = new Set(
  segments.filter((f) => f.properties.highway === "steps").map((f) => f.properties.segment_id)
);

// Dijkstra from one source. The study-area graph is a few hundred nodes, so
// the simple O(V^2) scan costs microseconds and keeps the code readable.
// With `avoidSteps`, stepped segments are removed from the graph entirely —
// this is what a wheelchair user's route has to look like.
function dijkstra(src, avoidSteps = false) {
  const dist = new Map([...adj.keys()].map((id) => [id, Infinity]));
  const prevNode = new Map();
  const prevSeg = new Map();
  const visited = new Set();
  dist.set(src, 0);
  while (true) {
    let u = null;
    let ud = Infinity;
    for (const [id, d] of dist) if (!visited.has(id) && d < ud) ((u = id), (ud = d));
    if (u === null) break;
    visited.add(u);
    for (const e of adj.get(u) ?? []) {
      if (visited.has(e.to)) continue;
      if (avoidSteps && isSteps.has(e.seg)) continue;
      const nd = ud + e.w;
      if (nd < (dist.get(e.to) ?? Infinity)) {
        dist.set(e.to, nd);
        prevNode.set(e.to, u);
        prevSeg.set(e.to, e.seg);
      }
    }
  }
  return { dist, prevNode, prevSeg };
}

// Walk the predecessor chain back from `target`, collecting segment ids.
function pathSegments({ prevNode, prevSeg }, src, target) {
  const out = [];
  let cur = target;
  while (cur !== src && cur != null) {
    const seg = prevSeg.get(cur);
    if (!seg) return out;
    out.push(seg);
    cur = prevNode.get(cur);
  }
  return out;
}

// --- Snap the four destinations onto the network ----------------------

const dests = DESTINATIONS.map((d) => {
  const pt = destPoints.find((f) => f.properties.dest_id === d.id);
  if (!pt) throw new Error(`${d.name} missing from buildings.geojson — re-run survey:fetch`);
  const centre = { lng: pt.geometry.coordinates[0], lat: pt.geometry.coordinates[1] };

  // Prefer an arrival point at a mapped entrance: that is where an outdoor
  // route genuinely ends, and where the handover to the indoor system
  // happens. Fall back to the building centroid if none is mapped.
  //
  // Rank entrances by what OSM claims about them, so a door already tagged
  // as unusable by a wheelchair user is never chosen as the arrival point
  // while a better one exists. Ties break on distance to the centroid.
  const rank = (e) => {
    if (e.properties.entrance === "emergency") return 3;
    if (e.properties.wheelchair === "yes") return 0;
    if (e.properties.wheelchair === "no") return 2;
    return 1;
  };
  const own = entrancePoints
    .filter((e) => e.properties.dest_id === d.id)
    .map((e) => ({
      pt: { lng: e.geometry.coordinates[0], lat: e.geometry.coordinates[1] },
      rank: rank(e),
      wheelchair: e.properties.wheelchair,
    }))
    .sort((a, b) => a.rank - b.rank || haversine(centre, a.pt) - haversine(centre, b.pt));

  const anchor = own.length ? own[0].pt : centre;
  const snapped = nearestNode(anchor);
  return {
    ...d,
    centre,
    anchor,
    anchorIsEntrance: own.length > 0,
    // Flagged so the report can say plainly that OSM believes this
    // building has no step-free way in.
    anchorWheelchairNo: own.length > 0 && own[0].wheelchair === "no",
    nodeId: snapped.nodeId,
    snapDistance: snapped.distance,
  };
});

// --- Core: every route between every pair of destinations -------------

// With four destinations there are six journeys a user might make. Taking
// the union of all six (rather than a spanning tree) guarantees that every
// pair the app can be asked for is actually covered by surveyed ground.
//
// For each journey TWO routes are traced: the plain shortest path, and the
// shortest path that avoids every stepped segment. They are frequently
// different, and it is the second one this project exists to get right —
// surveying only the shortest route would leave the accessible alternative
// unmeasured and therefore unusable.
const dijkFrom = new Map();
const dijkFromStepFree = new Map();
for (const nodeId of new Set(dests.map((d) => d.nodeId))) {
  dijkFrom.set(nodeId, dijkstra(nodeId, false));
  dijkFromStepFree.set(nodeId, dijkstra(nodeId, true));
}

const core = new Set();
const journeys = [];
for (let i = 0; i < dests.length; i++) {
  for (let j = i + 1; j < dests.length; j++) {
    const a = dests[i];
    const b = dests[j];

    const plain = dijkFrom.get(a.nodeId);
    const shortest = plain.dist.get(b.nodeId) ?? Infinity;
    if (isFinite(shortest)) {
      for (const s of pathSegments(plain, a.nodeId, b.nodeId)) core.add(s);
    }

    const free = dijkFromStepFree.get(a.nodeId);
    const stepFree = free.dist.get(b.nodeId) ?? Infinity;
    if (isFinite(stepFree)) {
      for (const s of pathSegments(free, a.nodeId, b.nodeId)) core.add(s);
    }

    journeys.push({
      from: a.name,
      to: b.name,
      metres: isFinite(shortest) ? Math.round(shortest) : null,
      stepFreeMetres: isFinite(stepFree) ? Math.round(stepFree) : null,
      // A journey where the two differ is one where a wheelchair user pays
      // a detour; where the step-free figure is null, OSM knows of no
      // accessible route at all and the survey has to find one.
      detourM: isFinite(shortest) && isFinite(stepFree) ? Math.round(stepFree - shortest) : null,
    });
  }
}

// --- Alt: a survey corridor around the core routes --------------------

const coreCoords = [...core].map((id) => segById.get(id).geometry.coordinates);

// Distance from a point to the nearest point on any core route.
function distanceToCore(lngLat) {
  const p = { lng: lngLat[0], lat: lngLat[1] };
  let best = Infinity;
  for (const line of coreCoords) {
    for (let i = 1; i < line.length; i++) {
      const d = distanceToSegment(
        p,
        { lng: line[i - 1][0], lat: line[i - 1][1] },
        { lng: line[i][0], lat: line[i][1] }
      );
      if (d < best) best = d;
      if (best === 0) return 0;
    }
  }
  return best;
}

// Straight-line distance from a point to the nearest destination.
function distanceToDest(lngLat) {
  const p = { lng: lngLat[0], lat: lngLat[1] };
  return Math.min(...dests.map((d) => haversine(p, d.anchor)));
}

const alt = new Set();
for (const f of segments) {
  const id = f.properties.segment_id;
  if (core.has(id)) continue;
  const cs = f.geometry.coordinates;
  const ends = [cs[0], cs[cs.length - 1]];
  // Both ends must sit inside the corridor, so the set stays a band around
  // the routes rather than trailing off down every side path …
  const inCorridor = ends.every((e) => distanceToCore(e) <= ALT_BUFFER_M);
  // … but anything close to a destination is included regardless, because
  // that is where the entrances are.
  const atDestination = ends.some((e) => distanceToDest(e) <= DEST_RADIUS_M);
  if (inCorridor || atDestination) alt.add(id);
}

// --- Stitch the survey network into one connected piece ---------------

// Selecting segments by distance produces islands: a path can sit within
// 70 m of a building yet have no surveyed connection back to the routes.
// Those islands are worthless in both directions — the surveyor cannot walk
// to them along surveyed ground, and the router can never reach them — so
// each one is joined back with the shortest link through the full network.
const link = new Set();

function surveyComponents() {
  const inSet = new Set([...core, ...alt, ...link]);
  const sadj = new Map();
  for (const f of segments) {
    const { segment_id, from, to } = f.properties;
    if (!inSet.has(segment_id)) continue;
    if (!sadj.has(from)) sadj.set(from, []);
    if (!sadj.has(to)) sadj.set(to, []);
    sadj.get(from).push(to);
    sadj.get(to).push(from);
  }
  const seen = new Set();
  const comps = [];
  for (const start of sadj.keys()) {
    if (seen.has(start)) continue;
    const comp = [];
    const stack = [start];
    while (stack.length) {
      const u = stack.pop();
      if (seen.has(u)) continue;
      seen.add(u);
      comp.push(u);
      for (const v of sadj.get(u) ?? []) if (!seen.has(v)) stack.push(v);
    }
    comps.push(comp);
  }
  // The component holding the destinations is the one to join everything to,
  // not merely the biggest.
  const destNodes = new Set(dests.map((d) => d.nodeId));
  comps.sort((a, b) => {
    const ad = a.some((n) => destNodes.has(n)) ? 1 : 0;
    const bd = b.some((n) => destNodes.has(n)) ? 1 : 0;
    return bd - ad || b.length - a.length;
  });
  return comps;
}

const unreachableFragments = [];
let comps = surveyComponents();
// Each pass connects at least one fragment, so the loop is bounded by the
// number of fragments; the guard only protects against a logic error.
for (let guard = 0; comps.length > 1 && guard < 100; guard++) {
  const main = new Set(comps[0]);
  const orphan = comps[1];

  let best = null;
  for (const src of orphan) {
    const result = dijkstra(src);
    for (const target of main) {
      const d = result.dist.get(target) ?? Infinity;
      if (d < (best?.d ?? Infinity)) best = { d, src, target, ...result };
    }
  }

  if (!best || !isFinite(best.d)) {
    // Genuinely unreachable even in the full OSM network — drop it, because
    // surveying ground the app can never route over wastes a field trip.
    const inSet = new Set([...core, ...alt, ...link]);
    const orphanNodes = new Set(orphan);
    for (const f of segments) {
      const { segment_id, from, to } = f.properties;
      if (!inSet.has(segment_id)) continue;
      if (orphanNodes.has(from) || orphanNodes.has(to)) {
        alt.delete(segment_id);
        link.delete(segment_id);
        unreachableFragments.push(segment_id);
      }
    }
  } else {
    for (const s of pathSegments(best, best.src, best.target)) {
      if (!core.has(s) && !alt.has(s)) link.add(s);
    }
  }
  comps = surveyComponents();
}

// `link` segments exist only to join the network up. They are surveyed last,
// but they must be surveyed: a connection nobody has measured is a
// connection the accessible profile cannot honestly use.
const tierOf = (id) =>
  core.has(id) ? "core" : alt.has(id) ? "alt" : link.has(id) ? "link" : "";
const surveySegments = segments.filter((f) => tierOf(f.properties.segment_id));

// --- Write segments.csv (preserving anything already surveyed) --------

function loadExisting(file, key) {
  const path = join(DIR, file);
  if (!existsSync(path)) return new Map();
  const rows = parseCsv(readFileSync(path, "utf8"));
  return new Map(rows.filter((r) => r[key]).map((r) => [r[key], r]));
}

const priorSegs = loadExisting("segments.csv", "segment_id");
const priorEnts = loadExisting("entrances.csv", "entrance_id");

// Index prior rows by the ground they describe rather than by their row
// number. A segment can come back from OSM with its direction reversed, so
// the endpoint pair is sorted before use.
//
// The way and endpoints alone are NOT unique: where a way loops, two arcs
// join the same pair of junctions, and a key built from those three fields
// alone matches both. That happened here — a 16 m and a 99 m branch of the
// same loop collided, and one arc's measurements were copied onto the other,
// which had deliberately been left unsurveyed. Length separates them.
const osmKey = (way, a, b, len) =>
  way && a && b ? `${way}|${[String(a), String(b)].sort().join("|")}|${len ?? ""}` : null;

// Values are arrays: a collision must be detected, never silently resolved.
const priorByOsm = new Map();
for (const row of priorSegs.values()) {
  const key = osmKey(row.osm_way, row.osm_from, row.osm_to, row.length_m);
  if (!key) continue;
  const list = priorByOsm.get(key);
  if (list) list.push(row);
  else priorByOsm.set(key, [row]);
}

// Whether the existing CSV carries durable identity at all. Files written
// before those columns existed cannot prove which ground a row describes.
const priorHasOsmIds = [...priorSegs.values()].some((r) => (r.osm_way ?? "") !== "");

// Prefer the durable match. For a legacy CSV there is nothing to match on but
// the row number, which is exactly the thing that shifts — so the fallback
// additionally demands that the length and path type still agree. Without
// that guard a row can inherit "step_free=no" from a flight of steps that
// used to hold its number, and the router will then refuse a perfectly
// ordinary footway.
function priorFor(props) {
  const key = osmKey(props.osm_way_id, props.osm_from_node, props.osm_to_node, props.length_m);
  const candidates = (key && priorByOsm.get(key)) || [];
  if (candidates.length === 1) return candidates[0];
  if (candidates.length > 1) {
    // Still ambiguous. Only the row number can separate them now, and if it
    // does not match any candidate, refuse rather than guess — attaching one
    // stretch of ground's measurements to another is worse than losing them.
    const exact = candidates.find((r) => r.segment_id === props.segment_id);
    if (!exact) {
      console.warn(
        `  WARNING: ${props.segment_id} matches ${candidates.length} prior rows ` +
          `(${candidates.map((r) => r.segment_id).join(", ")}) and none by id — not merged.`
      );
    }
    return exact ?? null;
  }
  if (priorHasOsmIds) return null; // the file has keys; absence means genuinely new

  const byId = priorSegs.get(props.segment_id);
  if (!byId) return null;
  const sameGround =
    String(byId.length_m ?? "") === String(props.length_m) &&
    (byId.highway ?? "") === (props.highway ?? "");
  return sameGround ? byId : null;
}

// What this script itself writes into a blank row. Without subtracting it,
// a seeded `step_free=no` on a flight of steps would be counted as somebody
// having surveyed it — overstating progress and, worse, protecting a
// machine-generated guess from being corrected on a later run.
const segmentSeed = (col, highway) =>
  col === "step_free" && highway === "steps" ? "no" : "";

const surveyedFields = (row, cols, seed) =>
  !row
    ? []
    : cols.filter((c) => {
        const v = (row[c] ?? "").trim();
        return v !== "" && v !== seed(c) && !v.startsWith("EXAMPLE");
      });

const hasFieldData = (row, cols, seed) => surveyedFields(row, cols, seed).length > 0;

// Rows that hold field data but are no longer in the study area: never
// silently dropped, because that data cost someone a walk across campus.
const keptRows = new Set(surveySegments.map((f) => priorFor(f.properties)).filter(Boolean));
const orphaned = [...priorSegs.values()].filter(
  (r) =>
    hasFieldData(r, SEGMENT_FIELD_COLUMNS, (c) => segmentSeed(c, r.highway)) && !keptRows.has(r)
);

const segLines = [csvRow(SEGMENT_COLUMNS)];
let carriedOver = 0;
for (const f of surveySegments) {
  const p = f.properties;
  const prior = priorFor(p);
  if (hasFieldData(prior, SEGMENT_FIELD_COLUMNS, (c) => segmentSeed(c, p.highway))) carriedOver++;
  // OSM is trustworthy about the existence of steps even where it says
  // nothing else, so seed step_free from the highway type and let the
  // surveyor confirm.
  const seeded = {
    segment_id: p.segment_id,
    tier: tierOf(p.segment_id),
    from_id: p.from,
    to_id: p.to,
    length_m: p.length_m,
    highway: p.highway,
    step_free: p.highway === "steps" ? "no" : "",
    step_count: "",
    ramp: "",
    handrail: "",
    gradient_pct: "",
    surface: "",
    surface_condition: "",
    width_m: "",
    dropped_kerb: "",
    tactile_paving: "",
    lit: "",
    seating_nearby: "",
    osm_hint: p.osm_hint ?? "",
    osm_way: p.osm_way_id ?? "",
    osm_from: p.osm_from_node ?? "",
    osm_to: p.osm_to_node ?? "",
    notes: "",
  };
  // Keep a prior value only where it actually says something the seed does
  // not, so re-running refreshes stale seeds but never touches fieldwork.
  const row = SEGMENT_COLUMNS.map((c) => {
    const kept = (prior?.[c] ?? "").trim();
    if (SEGMENT_FIELD_COLUMNS.includes(c) && kept !== "" && kept !== segmentSeed(c, p.highway)) {
      return kept;
    }
    return seeded[c] ?? "";
  });
  segLines.push(csvRow(row));
}
write(join(DIR, "segments.csv"), segLines.join("\n") + "\n");

// --- nodes.csv: only the junctions inside the survey area -------------

const usedNodes = new Set();
for (const f of surveySegments) {
  usedNodes.add(f.properties.from);
  usedNodes.add(f.properties.to);
}
const destNodeName = new Map(dests.map((d) => [d.nodeId, d.name]));
const nodeLines = [csvRow(["node_id", "lat", "lng", "type", "name", "notes"])];
for (const id of [...usedNodes].sort((a, b) => +a.slice(1) - +b.slice(1))) {
  const c = nodeCoord.get(id);
  if (!c) continue;
  const isDest = destNodeName.has(id);
  nodeLines.push(
    csvRow([
      id,
      c.lat.toFixed(6),
      c.lng.toFixed(6),
      isDest ? "arrival" : "",
      isDest ? destNodeName.get(id) : "",
      isDest ? "Route to this destination ends here" : "",
    ])
  );
}
write(join(DIR, "nodes.csv"), nodeLines.join("\n") + "\n");

// --- entrances.csv: pre-seeded with every entrance OSM already knows ---

const destName = new Map(dests.map((d) => [d.id, d.name]));
const entLines = [csvRow(ENTRANCE_COLUMNS)];
const seenEnt = new Set();
for (const e of entrancePoints) {
  const p = e.properties;
  const [lng, lat] = e.geometry.coordinates;
  const entranceId = `${p.dest_id}_${p.osm_node_id}`;
  seenEnt.add(entranceId);
  const prior = priorEnts.get(entranceId);
  const seeded = {
    entrance_id: entranceId,
    building: destName.get(p.dest_id) ?? p.dest_id,
    serves: p.dest_id,
    // Deliberately NOT seeded from OSM's `wheelchair` tag. Pre-filling it
    // would make a third-party claim indistinguishable from a surveyor's
    // verdict, and the app would then report an unvisited door as confirmed.
    // OSM's claim stays visible in `osm_hint`, where it belongs.
    accessible: "",
    door_type: "",
    step_free: "",
    step_count: "",
    ramp: "",
    door_width_m: "",
    lat: lat.toFixed(6),
    lng: lng.toFixed(6),
    nearest_node_id: nearestNode({ lat, lng }).nodeId ?? "",
    indoor_handover_id: "",
    osm_hint: p.osm_hint ?? "",
    notes: p.entrance === "emergency" ? "OSM says emergency exit — confirm if usable" : "",
  };
  // Earlier versions of this script pre-filled `accessible` from OSM's
  // wheelchair tag. Those values are not fieldwork, and left in place they
  // would now masquerade as a surveyor's verdict, so they are recognised and
  // discarded rather than carried forward.
  const legacySeed = (c) =>
    c === "accessible"
      ? p.wheelchair === "yes"
        ? "yes"
        : p.wheelchair === "no"
          ? "no"
          : ""
      : null;

  entLines.push(
    csvRow(
      ENTRANCE_COLUMNS.map((c) => {
        const kept = (prior?.[c] ?? "").trim();
        // Same rule as segments: a value that merely repeats what OSM
        // suggested is not fieldwork, so let it be re-seeded.
        if (
          ENTRANCE_FIELD_COLUMNS.includes(c) &&
          kept !== "" &&
          kept !== (seeded[c] ?? "") &&
          kept !== legacySeed(c)
        ) {
          return kept;
        }
        return seeded[c] ?? "";
      })
    )
  );
}
// Entrances the surveyor added by hand (OSM does not know about them) are
// kept exactly as typed.
for (const [id, row] of priorEnts) {
  if (seenEnt.has(id) || id.startsWith("EXAMPLE")) continue;
  entLines.push(csvRow(ENTRANCE_COLUMNS.map((c) => row[c] ?? "")));
}
write(join(DIR, "entrances.csv"), entLines.join("\n") + "\n");

// --- src/data/campusNetwork.json: what the app routes on --------------

const round6 = (n) => Math.round(n * 1e6) / 1e6;
const num = (v) => (v != null && String(v).trim() !== "" && !isNaN(Number(v)) ? Number(v) : null);
const bool = (v) => (v === "yes" ? true : v === "no" ? false : null);

const surveyed = parseCsv(readFileSync(join(DIR, "segments.csv"), "utf8"));
const surveyedById = new Map(surveyed.map((r) => [r.segment_id, r]));

// The entrances go to the app as well as to the field kit. An outdoor route
// ends at a door, and a door the traveller cannot open is the same as no
// route at all — so the app has to be able to see what the entrance survey
// found, and to prefer a different door when one is usable.
const surveyedEntrances = parseCsv(readFileSync(join(DIR, "entrances.csv"), "utf8"));

const appEntrances = surveyedEntrances
  .filter((r) => r.entrance_id && !r.entrance_id.startsWith("EXAMPLE"))
  .map((r) => {
    const lat = num(r.lat);
    const lng = num(r.lng);
    // Snap against the nodes the APP actually has, not the full downloaded
    // network. `nearest_node_id` in the CSV was chosen from all 500 segments
    // and can name a junction outside the survey subset — routing to which
    // would fail silently. Hand-added entrances have no node at all yet.
    const snapped =
      lat != null && lng != null ? nearestNode({ lat, lng }, usedNodes) : { nodeId: null };
    const nodeId = snapped.nodeId;
    return {
      id: r.entrance_id,
      serves: r.serves || null,
      building: r.building || null,
      lat: lat != null ? round6(lat) : null,
      lng: lng != null ? round6(lng) : null,
      nodeId: nodeId ?? null,
      osmHint: r.osm_hint || null,
      survey: {
        accessible: bool(r.accessible),
        doorType: r.door_type || null,
        stepFree: bool(r.step_free),
        stepCount: num(r.step_count),
        ramp: bool(r.ramp),
        doorWidthM: num(r.door_width_m),
        indoorHandoverId: r.indoor_handover_id || null,
        notes: r.notes || null,
      },
    };
  });

const appNetwork = {
  generated: new Date().toISOString(),
  attribution: "Base path geometry © OpenStreetMap contributors, ODbL. Accessibility attributes surveyed on site.",
  destinations: dests.map((d) => ({
    id: d.id,
    name: d.name,
    lat: round6(d.anchor.lat),
    lng: round6(d.anchor.lng),
    nodeId: d.nodeId,
    insideOf: d.insideOf ?? null,
  })),
  entrances: appEntrances,
  nodes: [...usedNodes]
    .filter((id) => nodeCoord.has(id))
    .map((id) => ({ id, lat: round6(nodeCoord.get(id).lat), lng: round6(nodeCoord.get(id).lng) })),
  segments: surveySegments.map((f) => {
    const p = f.properties;
    const s = surveyedById.get(p.segment_id) ?? {};
    // `null` means "not surveyed yet" and is deliberately distinct from
    // `false`. The app must be able to tell an unknown path from a known
    // bad one — telling a wheelchair user a path is fine when nobody has
    // checked is the failure mode this project exists to avoid.
    return {
      id: p.segment_id,
      from: p.from,
      to: p.to,
      lengthM: p.length_m,
      highway: p.highway,
      tier: tierOf(p.segment_id),
      coords: f.geometry.coordinates.map(([lng, lat]) => [round6(lng), round6(lat)]),
      survey: {
        stepFree: bool(s.step_free),
        stepCount: num(s.step_count),
        ramp: bool(s.ramp),
        handrail: bool(s.handrail),
        gradientPct: num(s.gradient_pct),
        surface: s.surface || null,
        surfaceCondition: s.surface_condition || null,
        widthM: num(s.width_m),
        droppedKerb: s.dropped_kerb || null,
        tactilePaving: bool(s.tactile_paving),
        lit: bool(s.lit),
        seatingNearby: bool(s.seating_nearby),
      },
    };
  }),
};
write(APP_DATA, JSON.stringify(appNetwork, null, 2) + "\n");

// --- basemap.html ------------------------------------------------------

const coreGeo = { type: "FeatureCollection", features: surveySegments.filter((f) => core.has(f.properties.segment_id)) };
const altGeo = { type: "FeatureCollection", features: surveySegments.filter((f) => alt.has(f.properties.segment_id)) };
const linkGeo = { type: "FeatureCollection", features: surveySegments.filter((f) => link.has(f.properties.segment_id)) };
const ctxGeo = { type: "FeatureCollection", features: segments.filter((f) => !tierOf(f.properties.segment_id)) };
const bldGeo = { type: "FeatureCollection", features: buildingRings };
const entList = entrancePoints.map((e) => ({
  id: `${e.properties.dest_id}_${e.properties.osm_node_id}`,
  lat: e.geometry.coordinates[1],
  lng: e.geometry.coordinates[0],
  building: destName.get(e.properties.dest_id) ?? e.properties.dest_id,
  entrance: e.properties.entrance,
  wheelchair: e.properties.wheelchair,
}));
const destList = dests.map((d) => ({ name: d.name, lat: d.anchor.lat, lng: d.anchor.lng, node: d.nodeId }));

const lenOf = (set) =>
  [...set].reduce((s, id) => s + Number(segById.get(id).properties.length_m || 0), 0);
const coreLen = lenOf(core);
const altLen = lenOf(alt);
const linkLen = lenOf(link);

write(join(DIR, "basemap.html"), basemapHtml());
write(
  join(DIR, "field-summary.json"),
  JSON.stringify(
    {
      journeys,
      coreCount: core.size,
      altCount: alt.size,
      linkCount: link.size,
      coreLen,
      altLen,
      linkLen,
      droppedUnreachable: unreachableFragments,
    },
    null,
    2
  ) + "\n"
);

function basemapHtml() {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Gilmorehill Survey Map — four destinations</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<style>
  html, body, #map { height: 100%; margin: 0; }
  .seg-label { background:#003865; color:#fff; border:none; border-radius:3px;
    font:700 12px system-ui,sans-serif; padding:1px 5px; }
  .alt-label { background:#00568A; color:#fff; border:none; border-radius:3px;
    font:600 11px system-ui,sans-serif; padding:1px 4px; }
  .bldg-label { background:#111; color:#fff; border:none; border-radius:4px;
    font:700 13px system-ui,sans-serif; padding:2px 7px; }
  .legend { background:#fff; padding:10px 12px; font:13px/1.6 system-ui,sans-serif;
    box-shadow:0 1px 6px rgba(0,0,0,.3); border-radius:5px; max-width:230px; }
  .legend b { font-size:14px; }
  .swatch { display:inline-block; width:14px; height:4px; vertical-align:middle;
    margin-right:5px; border-radius:2px; }
  button.locate { padding:10px 12px; font:15px system-ui; cursor:pointer;
    border-radius:4px; border:1px solid #888; background:#fff; }
</style>
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
const CORE = ${JSON.stringify(coreGeo)};
const ALT  = ${JSON.stringify(altGeo)};
const LINK = ${JSON.stringify(linkGeo)};
const CTX  = ${JSON.stringify(ctxGeo)};
const BLD  = ${JSON.stringify(bldGeo)};
const ENT  = ${JSON.stringify(entList)};
const DEST = ${JSON.stringify(destList)};

const map = L.map("map");
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  { maxZoom: 20, attribution: "© OpenStreetMap contributors" }).addTo(map);

const popup = (p) =>
  "<b>" + p.segment_id + "</b> &middot; " + p.length_m + " m &middot; " + (p.tier || "") +
  "<br>type: " + (p.highway || "—") +
  "<br>OSM says: " + (p.osm_hint || "nothing") +
  "<br><i>Fill row " + p.segment_id + " in segments.csv</i>";

// Rest of the network — drawn faintly so you can see what you are NOT
// surveying and stay oriented, without it competing for attention.
const ctxLayer = L.geoJSON(CTX, { style: { color: "#b0b6bb", weight: 2, opacity: .55 } });

const bldLayer = L.geoJSON(BLD, {
  style: { color: "#111", weight: 1.5, fillColor: "#111", fillOpacity: .13 },
}).addTo(map);

// Links: paths added only to join otherwise-stranded pieces to the network.
const linkLayer = L.geoJSON(LINK, {
  style: { color: "#00838F", weight: 4, opacity: .85, dashArray: "8 5" },
  onEachFeature: (f, l) => {
    l.bindPopup(popup({ ...f.properties, tier: "link" }));
    l.bindTooltip(f.properties.segment_id, { sticky: true, className: "alt-label" });
  },
}).addTo(map);

// Alternatives: labels on tap only, so they never crowd out the core route.
const altLayer = L.geoJSON(ALT, {
  style: { color: "#1565C0", weight: 4, opacity: .85 },
  onEachFeature: (f, l) => {
    l.bindPopup(popup({ ...f.properties, tier: "alt" }));
    l.bindTooltip(f.properties.segment_id, { sticky: true, className: "alt-label" });
  },
}).addTo(map);

// Core routes: permanent labels, because these are the ones you walk down
// with the CSV open, ticking off segment ids.
const coreLayer = L.geoJSON(CORE, {
  style: { color: "#F5A623", weight: 7, opacity: .95 },
  onEachFeature: (f, l) => {
    l.bindPopup(popup({ ...f.properties, tier: "core" }));
    l.bindTooltip(f.properties.segment_id, { permanent: true, direction: "center", className: "seg-label" });
  },
}).addTo(map);

const entLayer = L.layerGroup(
  ENT.map((e) =>
    L.circleMarker([e.lat, e.lng], {
      radius: 7, color: "#fff", weight: 2,
      fillColor: e.wheelchair === "yes" ? "#2E7D32" : "#6A1B9A", fillOpacity: 1,
    }).bindPopup(
      "<b>Entrance</b> " + e.id + "<br>" + e.building +
      "<br>OSM entrance=" + e.entrance +
      "<br>wheelchair=" + (e.wheelchair || "unknown") +
      "<br><i>Fill this row in entrances.csv</i>"
    )
  )
).addTo(map);

DEST.forEach((d) =>
  L.marker([d.lat, d.lng]).addTo(map)
    .bindTooltip(d.name, { permanent: true, direction: "top", className: "bldg-label" })
    .bindPopup("<b>" + d.name + "</b><br>routes arrive at node " + d.node)
);

map.fitBounds(coreLayer.getBounds(), { padding: [45, 45] });

L.control.layers(null, {
  "Core routes (survey first)": coreLayer,
  "Alternatives (survey next)": altLayer,
  "Links (survey last)": linkLayer,
  "Entrances": entLayer,
  "Buildings": bldLayer,
  "Rest of network (skip)": ctxLayer,
}, { collapsed: false }).addTo(map);

// GPS position, so you can tell which segment you are standing on.
const Locate = L.Control.extend({
  onAdd: () => {
    const b = L.DomUtil.create("button", "locate");
    b.textContent = "📍 Locate me";
    L.DomEvent.disableClickPropagation(b);
    b.onclick = () => map.locate({ setView: true, maxZoom: 19, watch: true, enableHighAccuracy: true });
    return b;
  },
});
new Locate({ position: "topright" }).addTo(map);
let me, ring;
map.on("locationfound", (e) => {
  if (!me) me = L.marker(e.latlng).addTo(map).bindPopup("You are here");
  else me.setLatLng(e.latlng);
  // Accuracy circle matters in the field: GPS between tall sandstone
  // buildings drifts, and a 30 m circle tells you not to trust the dot.
  if (!ring) ring = L.circle(e.latlng, { radius: e.accuracy, color: "#1565C0", weight: 1, fillOpacity: .08 }).addTo(map);
  else ring.setLatLng(e.latlng).setRadius(e.accuracy);
});
map.on("locationerror", () => alert("Could not get your position. Allow location access, and note that GPS needs an open sky."));

const legend = L.control({ position: "bottomleft" });
legend.onAdd = () => {
  const d = L.DomUtil.create("div", "legend");
  d.innerHTML =
    "<b>Gilmorehill survey map</b><br>" +
    "Four destinations, ${core.size + alt.size + link.size} segments, ${((coreLen + altLen + linkLen) / 1000).toFixed(2)} km<br><hr style='margin:6px 0'>" +
    "<span class='swatch' style='background:#F5A623'></span>core — ${core.size} seg, ${(coreLen / 1000).toFixed(2)} km<br>" +
    "<span class='swatch' style='background:#1565C0'></span>alternatives — ${alt.size} seg, ${(altLen / 1000).toFixed(2)} km<br>" +
    "<span class='swatch' style='background:#00838F'></span>links — ${link.size} seg, ${(linkLen / 1000).toFixed(2)} km<br>" +
    "<span class='swatch' style='background:#b0b6bb'></span>not in scope<br>" +
    "🟢 entrance (green = OSM claims step-free)<br>" +
    "<hr style='margin:6px 0'>Tap anything for its id.";
  return d;
};
legend.addTo(map);
</script>
</body>
</html>
`;
}

// --- Report ------------------------------------------------------------

console.log("=== Study area: four destinations ===");
for (const d of dests) {
  console.log(
    `  • ${d.name.padEnd(28)} arrives at ${String(d.nodeId).padEnd(5)} ` +
      `(${d.snapDistance.toFixed(0)} m from the mapped ${d.anchorIsEntrance ? "entrance" : "building centre"})`
  );
}

const shared = dests.filter((d, i) => dests.findIndex((x) => x.nodeId === d.nodeId) !== i);
if (shared.length) {
  console.log(
    `\n  Note: ${shared.map((d) => d.name).join(", ")} share an arrival node with another\n` +
      `  destination — expected where one is inside the other.`
  );
}

console.log("\n=== Journeys the app must support ===");
console.log("  (step-free = the same journey with every stepped segment removed)");
for (const j of journeys) {
  const base = j.metres == null ? "no route" : `${j.metres} m`;
  let free;
  if (j.stepFreeMetres == null) free = "NO STEP-FREE ROUTE IN OSM";
  else if (j.detourM > 0) free = `step-free ${j.stepFreeMetres} m  (+${j.detourM} m detour)`;
  else free = "already step-free";
  console.log(`  ${(j.from + " → " + j.to).padEnd(52)} ${base.padStart(7)}   ${free}`);
}

// A destination is cut off only if NO other destination can reach it
// step-free. Checking "some journey failed" instead would blame all four
// buildings for one building's stairs.
const isolated = dests.filter((d) => {
  const mine = journeys.filter((j) => j.from === d.name || j.to === d.name);
  return mine.length > 0 && mine.every((j) => j.stepFreeMetres == null);
});
const detours = journeys.filter((j) => j.detourM > 0);

if (isolated.length || detours.length || dests.some((d) => d.anchorWheelchairNo)) {
  console.log("\n=== ACCESSIBILITY GAPS FOUND — check these on site first ===");
  for (const d of isolated) {
    console.log(
      `  ! ${d.name}: no step-free route to ANY other destination exists in the\n` +
        `    mapped network. Its arrival point is reachable only by steps.\n` +
        `    Find the accessible entrance on site and add it to entrances.csv.`
    );
  }
  for (const d of dests.filter((x) => x.anchorWheelchairNo)) {
    console.log(`  ! ${d.name}: every entrance OSM knows about is tagged wheelchair=no.`);
  }
  for (const j of detours) {
    console.log(
      `  ! ${j.from} → ${j.to}: avoiding steps costs an extra ${j.detourM} m ` +
        `(${j.metres} → ${j.stepFreeMetres} m).`
    );
  }
}

console.log("\n=== Survey workload ===");
const kept = core.size + alt.size + link.size;
console.log(`  core         ${String(core.size).padStart(3)} segments  ${(coreLen / 1000).toFixed(2)} km`);
console.log(`  alternatives ${String(alt.size).padStart(3)} segments  ${(altLen / 1000).toFixed(2)} km`);
console.log(`  links        ${String(link.size).padStart(3)} segments  ${(linkLen / 1000).toFixed(2)} km  (added to join the network up)`);
console.log(`  TOTAL        ${String(kept).padStart(3)} segments  ${((coreLen + altLen + linkLen) / 1000).toFixed(2)} km`);
console.log(`  (out of ${segments.length} segments downloaded — ${Math.round((100 * kept) / segments.length)}% kept)`);
if (unreachableFragments.length) {
  console.log(
    `\n  Dropped ${unreachableFragments.length} segment(s) unreachable even in the full OSM\n` +
      `  network — the app could never route over them: ${unreachableFragments.join(", ")}`
  );
}
console.log(`  entrances to check: ${entrancePoints.length}`);
if (carriedOver) console.log(`\n  Carried over field data for ${carriedOver} segment(s).`);
if (orphaned.length) {
  console.log(
    `\n  WARNING: ${orphaned.length} surveyed segment(s) fell outside the new study area:\n` +
      `  ${orphaned.map((r) => r.segment_id).join(", ")}\n` +
      `  Their data is NOT in the new segments.csv — recover it from git history if needed.`
  );
}

console.log("\nWrote survey/segments.csv, nodes.csv, entrances.csv, basemap.html, field-summary.json");
console.log("Wrote src/data/campusNetwork.json (the network the app routes on)");
