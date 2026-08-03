// Exports the network in a form small enough to hand to something else for
// drawing — a plotting library, a figure script, or a language model asked to
// write one.
//
// Two changes make it compact and easier to plot than the GeoJSON:
//
//   • coordinates become metres east and north of the south-west corner of
//     the study area, so there is no projection to reason about and a figure
//     can be drawn with a plain linear scale;
//   • everything not needed for a picture is dropped, and positions are
//     rounded to the metre, which is far finer than any printed figure can
//     show anyway.
//
// Usage:  npm run survey:export-plot
// Writes: survey/network-plot.json

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIR = join(__dirname, "..", "survey");

const net = JSON.parse(readFileSync(join(__dirname, "..", "src", "data", "campusNetwork.json"), "utf8"));
const raw = JSON.parse(readFileSync(join(DIR, "campus-network.geojson"), "utf8"));
const buildings = JSON.parse(readFileSync(join(DIR, "buildings.geojson"), "utf8"));

// Origin: the south-west corner of the downloaded bounding box.
const bbox = raw.properties.bbox;
const ORIGIN = { lat: bbox.south, lng: bbox.west };
const M_PER_LAT = 111320;
const M_PER_LNG = 111320 * Math.cos((ORIGIN.lat * Math.PI) / 180);

/** [lng, lat] -> [metres east, metres north], rounded to the metre. */
const xy = ([lng, lat]) => [
  Math.round((lng - ORIGIN.lng) * M_PER_LNG),
  Math.round((lat - ORIGIN.lat) * M_PER_LAT),
];

// Drop points that add nothing at figure scale: anything within 2 m of the
// straight line between its neighbours cannot be seen once the drawing is
// reduced to page width.
function simplify(points, tolerance = 2) {
  if (points.length <= 2) return points;
  const out = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const [ax, ay] = out[out.length - 1];
    const [bx, by] = points[i + 1];
    const [px, py] = points[i];
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
    const deviation = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
    if (deviation > tolerance) out.push(points[i]);
  }
  out.push(points[points.length - 1]);
  return out;
}

const surveyed = new Set(net.segments.map((s) => s.id));

const plot = {
  note:
    "Coordinates are metres east and north of the south-west corner of the study " +
    "area. Draw with a linear scale and equal aspect ratio; y increases north.",
  origin: { lat: ORIGIN.lat, lng: ORIGIN.lng },
  extentM: {
    width: Math.round((bbox.east - bbox.west) * M_PER_LNG),
    height: Math.round((bbox.north - bbox.south) * M_PER_LAT),
  },

  destinations: net.destinations.map((d) => ({
    name: d.name,
    at: xy([d.lng, d.lat]),
  })),

  // The 68 surveyed segments, with what a figure would distinguish them by.
  segments: net.segments.map((s) => ({
    id: s.id,
    tier: s.tier,
    // `blocked` is the survey's verdict for a wheelchair user: steps, a way
    // that is closed, too narrow, too steep, or a raised kerb.
    blocked:
      s.survey.passable === false ||
      s.survey.stepFree === false ||
      (s.survey.stepFree === null && s.highway === "steps") ||
      (s.survey.widthM != null && s.survey.widthM < 1) ||
      (s.survey.gradientPct != null && s.survey.gradientPct > 8.33) ||
      s.survey.droppedKerb === "raised",
    surveyed: s.survey.stepFree !== null && s.survey.widthM != null,
    points: simplify(s.coords.map(xy)),
  })),

  entrances: net.entrances
    .filter((e) => e.lat != null && e.lng != null)
    .map((e) => ({
      id: e.survey.indoorHandoverId ?? e.id,
      building: e.building,
      accessible: e.survey.accessible,
      at: xy([e.lng, e.lat]),
    })),

  buildings: buildings.features
    .filter((f) => f.properties.kind === "building")
    .map((f) => ({
      name: f.properties.name,
      ring: simplify(f.geometry.coordinates[0].map(xy), 3),
    })),

  // Everything downloaded but not surveyed, for context behind the figure.
  context: raw.features
    .filter((f) => f.properties.kind === "segment" && !surveyed.has(f.properties.segment_id))
    .map((f) => simplify(f.geometry.coordinates.map(xy), 4)),
};

const path = join(DIR, "network-plot.json");
writeFileSync(path, JSON.stringify(plot));
const kb = (JSON.stringify(plot).length / 1024).toFixed(0);

const pts = (arr) => arr.reduce((a, x) => a + (x.points ?? x.ring ?? x).length, 0);
console.log(`Wrote survey/network-plot.json — ${kb} KB`);
console.log(`  extent        ${plot.extentM.width} × ${plot.extentM.height} m`);
console.log(`  segments      ${plot.segments.length} (${pts(plot.segments)} points after simplifying)`);
console.log(`  blocked       ${plot.segments.filter((s) => s.blocked).length}`);
console.log(`  context ways  ${plot.context.length} (${pts(plot.context)} points)`);
console.log(`  destinations  ${plot.destinations.length}   entrances ${plot.entrances.length}   buildings ${plot.buildings.length}`);
