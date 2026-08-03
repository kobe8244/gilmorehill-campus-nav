// Prepares the geometry the dissertation figures need, in local metres.
//
// Figure 4.1 wants the six journeys that define the study area. Figure 4.2
// wants one journey broken into the four layers the selection is built from,
// so the method can be seen rather than described. Both are recomputed here
// from the downloaded network, the same way build-survey.mjs does it, rather
// than read back out of the finished survey set — the point of 4.2 is to show
// how the set was arrived at.
//
// Usage:  node scripts/export-figures.mjs
// Writes: survey/figure-data.json

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { DESTINATIONS, haversine, distanceToSegment } from "./study-area.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIR = join(__dirname, "..", "survey");

const raw = JSON.parse(readFileSync(join(DIR, "campus-network.geojson"), "utf8"));
const buildingsGeo = JSON.parse(readFileSync(join(DIR, "buildings.geojson"), "utf8"));
const app = JSON.parse(readFileSync(join(__dirname, "..", "src", "data", "campusNetwork.json"), "utf8"));

const ALT_BUFFER_M = 45;
const DEST_RADIUS_M = 70;

const segments = raw.features.filter((f) => f.properties.kind === "segment");
const segById = new Map(segments.map((f) => [f.properties.segment_id, f]));
const nodeCoord = new Map();
for (const f of raw.features) {
  if (f.properties.kind !== "node") continue;
  nodeCoord.set(f.properties.node_id, {
    lng: f.geometry.coordinates[0],
    lat: f.geometry.coordinates[1],
  });
}

// --- Local metric frame, shared with export-plot.mjs ------------------

const bbox = raw.properties.bbox;
const ORIGIN = { lat: bbox.south, lng: bbox.west };
const M_PER_LAT = 111320;
const M_PER_LNG = 111320 * Math.cos((ORIGIN.lat * Math.PI) / 180);
const xy = ([lng, lat]) => [
  Math.round((lng - ORIGIN.lng) * M_PER_LNG),
  Math.round((lat - ORIGIN.lat) * M_PER_LAT),
];
const geomOf = (id) => segById.get(id).geometry.coordinates.map(xy);

// --- Graph and routing, mirroring the selection stage ------------------

const adj = new Map();
for (const f of segments) {
  const { from, to, segment_id, length_m } = f.properties;
  const w = Number(length_m) || 1;
  if (!adj.has(from)) adj.set(from, []);
  if (!adj.has(to)) adj.set(to, []);
  adj.get(from).push({ to, seg: segment_id, w });
  adj.get(to).push({ to: from, seg: segment_id, w });
}
const isSteps = new Set(
  segments.filter((f) => f.properties.highway === "steps").map((f) => f.properties.segment_id)
);

function dijkstra(src, avoidSteps = false) {
  const dist = new Map([...adj.keys()].map((id) => [id, Infinity]));
  const prevNode = new Map();
  const prevSeg = new Map();
  const seen = new Set();
  dist.set(src, 0);
  while (true) {
    let u = null;
    let ud = Infinity;
    for (const [id, d] of dist) if (!seen.has(id) && d < ud) ((u = id), (ud = d));
    if (u === null) break;
    seen.add(u);
    for (const e of adj.get(u) ?? []) {
      if (seen.has(e.to)) continue;
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

const pathSegs = ({ prevNode, prevSeg }, src, target) => {
  const out = [];
  let cur = target;
  while (cur !== src && cur != null) {
    const s = prevSeg.get(cur);
    if (!s) return out;
    out.push(s);
    cur = prevNode.get(cur);
  }
  return out;
};

// Destinations, snapped exactly as the pipeline snaps them.
const dests = app.destinations.map((d) => ({
  id: d.id,
  name: d.name,
  nodeId: d.nodeId,
  at: xy([d.lng, d.lat]),
  ll: { lat: d.lat, lng: d.lng },
}));

// --- Figure 4.1: the six journeys -------------------------------------

// Stitch a journey's segments into one ordered polyline. Segments are stored
// undirected, so each is flipped as needed to continue from where the last
// one ended. A single polyline is what lets the figure offset overlapping
// journeys sideways so all six can be seen at once.
function stitch(ids, startNode) {
  const pts = [];
  let node = startNode;
  for (const id of ids) {
    const p = segById.get(id).properties;
    const coords = segById.get(id).geometry.coordinates;
    const forward = p.from === node;
    const run = (forward ? coords : [...coords].reverse()).map(xy);
    for (const q of run) {
      const last = pts[pts.length - 1];
      if (!last || last[0] !== q[0] || last[1] !== q[1]) pts.push(q);
    }
    node = forward ? p.to : p.from;
  }
  return pts;
}

const journeys = [];
for (let i = 0; i < dests.length; i++) {
  for (let j = i + 1; j < dests.length; j++) {
    const a = dests[i];
    const b = dests[j];
    const d = dijkstra(a.nodeId);
    const ids = pathSegs(d, a.nodeId, b.nodeId).reverse();
    journeys.push({
      from: a.name,
      to: b.name,
      metres: Math.round(d.dist.get(b.nodeId) ?? 0),
      polyline: stitch(ids, a.nodeId),
      segments: ids.length,
    });
  }
}

// --- Figure 4.2: one journey, four layers -----------------------------

// Pick the journey whose four layers differ most, so the method is visible
// rather than four coincident lines.
function layersFor(a, b) {
  const plain = dijkstra(a.nodeId);
  const shortest = new Set(pathSegs(plain, a.nodeId, b.nodeId));
  const free = dijkstra(a.nodeId, true);
  const stepFreeExists = isFinite(free.dist.get(b.nodeId) ?? Infinity);
  const stepFree = stepFreeExists ? new Set(pathSegs(free, a.nodeId, b.nodeId)) : new Set();

  // Corridor around those routes.
  const coreGeom = [...new Set([...shortest, ...stepFree])].map(
    (id) => segById.get(id).geometry.coordinates
  );
  const nearCore = (pt) => {
    const p = { lng: pt[0], lat: pt[1] };
    let best = Infinity;
    for (const line of coreGeom)
      for (let k = 1; k < line.length; k++) {
        const d = distanceToSegment(
          p,
          { lng: line[k - 1][0], lat: line[k - 1][1] },
          { lng: line[k][0], lat: line[k][1] }
        );
        if (d < best) best = d;
      }
    return best;
  };

  const corridor = new Set();
  const radius = new Set();
  for (const f of segments) {
    const id = f.properties.segment_id;
    if (shortest.has(id) || stepFree.has(id)) continue;
    const cs = f.geometry.coordinates;
    const ends = [cs[0], cs[cs.length - 1]];
    const nearDest = ends.some((e) =>
      [a, b].some((d) => haversine({ lng: e[0], lat: e[1] }, d.ll) <= DEST_RADIUS_M)
    );
    if (ends.every((e) => nearCore(e) <= ALT_BUFFER_M)) corridor.add(id);
    else if (nearDest) radius.add(id);
  }

  // Link segments from the finished set that lie near this journey.
  const link = new Set(
    app.segments
      .filter((s) => s.tier === "link")
      .filter((s) => {
        const mid = s.coords[Math.floor(s.coords.length / 2)];
        return nearCore(mid) <= 120;
      })
      .map((s) => s.id)
  );

  return { shortest, stepFree, stepFreeExists, corridor, radius, link };
}

// Which journey Figure 4.2 illustrates. Override with, for example:
//   FIGURE_JOURNEY=hunterian_museum:james_watt_south node scripts/export-figures.mjs
//
// The default is a journey involving the Hunterian Museum. Those are the ones
// where no step-free path exists at all, so the figure shows the method
// working on the case the project actually turns on, rather than on a journey
// where the step-free layer merely duplicates the shortest path.
const WANTED = (process.env.FIGURE_JOURNEY ?? "hunterian_museum:james_watt_south")
  .split(":")
  .filter(Boolean);

const candidates = [];
for (let i = 0; i < dests.length; i++) {
  for (let j = i + 1; j < dests.length; j++) {
    const L = layersFor(dests[i], dests[j]);
    candidates.push({
      a: dests[i],
      b: dests[j],
      L,
      total: L.shortest.size + L.corridor.size + L.radius.size + L.link.size,
    });
  }
}

console.log("\nLayer contributions for every journey:");
for (const c of candidates) {
  console.log(
    `  ${(c.a.id + " → " + c.b.id).padEnd(46)}` +
      ` shortest ${String(c.L.shortest.size).padStart(2)}` +
      `  step-free ${c.L.stepFree.size ? String(c.L.stepFree.size).padStart(2) : " –"}` +
      `  corridor ${String(c.L.corridor.size).padStart(2)}` +
      `  radius ${String(c.L.radius.size).padStart(2)}` +
      `  link ${String(c.L.link.size).padStart(2)}`
  );
}

const wanted = candidates.find(
  (c) =>
    (WANTED.includes(c.a.id) && WANTED.includes(c.b.id)) ||
    (WANTED.length === 1 && (c.a.id === WANTED[0] || c.b.id === WANTED[0]))
);
const best = wanted ?? candidates.reduce((x, y) => (y.total > x.total ? y : x));
if (!wanted) console.warn(`\n  FIGURE_JOURNEY did not match; using the richest journey instead.`);

const only = (set, ...minus) => [...set].filter((id) => !minus.some((m) => m.has(id)));

const selection = {
  from: best.a.name,
  to: best.b.name,
  fromAt: best.a.at,
  toAt: best.b.at,
  layers: [
    { key: "shortest", label: "Shortest path", ids: [...best.L.shortest] },
    {
      key: "stepFree",
      // Two quite different reasons for an empty layer, and the figure has to
      // say which: no step-free route exists at all, or one exists and runs
      // along the same paths as the shortest.
      label: best.L.stepFreeExists
        ? "Step-free path"
        : "Step-free path — none exists",
      empty: best.L.stepFreeExists ? "identical to the shortest path here" : "no step-free route between these two",
      ids: only(best.L.stepFree, best.L.shortest),
    },
    { key: "corridor", label: `Corridor within ${ALT_BUFFER_M} m`, ids: [...best.L.corridor] },
    { key: "radius", label: `Within ${DEST_RADIUS_M} m of a destination`, ids: [...best.L.radius] },
    { key: "link", label: "Added to connect the network", ids: [...best.L.link] },
  ].map((l) => ({
    ...l,
    count: l.ids.length,
    lines: l.ids.map((id) => (segById.has(id) ? geomOf(id) : app.segments.find((s) => s.id === id).coords.map(xy))),
  })),
};

// --- Shared context ---------------------------------------------------

const surveyed = new Set(app.segments.map((s) => s.id));
const out = {
  origin: ORIGIN,
  extentM: {
    width: Math.round((bbox.east - bbox.west) * M_PER_LNG),
    height: Math.round((bbox.north - bbox.south) * M_PER_LAT),
  },
  context: segments.map((f) => f.geometry.coordinates.map(xy)),
  surveyedIds: [...surveyed],
  buildings: buildingsGeo.features
    .filter((f) => f.properties.kind === "building")
    .map((f) => ({ name: f.properties.name, ring: f.geometry.coordinates[0].map(xy) })),
  destinations: dests.map((d) => ({ name: d.name, at: d.at })),
  journeys,
  selection,
};

writeFileSync(join(DIR, "figure-data.json"), JSON.stringify(out));
console.log(`Wrote survey/figure-data.json — ${(JSON.stringify(out).length / 1024).toFixed(0)} KB`);
console.log(`  extent ${out.extentM.width} × ${out.extentM.height} m, ${out.context.length} context ways`);
console.log(`\nFig 4.1 — six journeys:`);
for (const j of journeys) console.log(`  ${j.from} → ${j.to}: ${j.metres} m, ${j.segments} segments`);
console.log(`\nFig 4.2 — ${selection.from} → ${selection.to}, layer contributions:`);
for (const l of selection.layers) console.log(`  ${l.label.padEnd(38)} ${l.count}`);
