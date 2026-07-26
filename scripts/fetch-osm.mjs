// Stage 1 of the survey pipeline.
//
// Downloads, from OpenStreetMap (Overpass API), everything needed for the
// four-destination study area defined in scripts/study-area.mjs:
//
//   • the outlines of the four target buildings
//   • every entrance node mapped on or near them
//   • the pedestrian path network in a bounding box around them
//
// and turns the paths into a routable graph (junction nodes + segments).
//
// Usage:  npm run survey:fetch      (or: node scripts/fetch-osm.mjs)
// Writes: survey/campus-network.geojson, survey/buildings.geojson
//
// Stage 2 (scripts/build-survey.mjs) reads those two files, so the network
// only needs downloading again if the study area itself changes.
//
// Data © OpenStreetMap contributors, ODbL. Attribution required.

import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  DESTINATIONS,
  BBOX_PADDING_M,
  HIGHWAY_FILTER,
  ACCESS_TAG_KEYS,
  haversine,
} from "./study-area.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "survey");

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function overpass(query, label) {
  const headers = {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
    // Overpass rejects requests without a descriptive User-Agent (HTTP 406)
    "User-Agent": "GilmorehillCampusNav/1.0 (ENG5059P MSc project)",
  };
  let lastErr;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`[${label}] querying ${endpoint} (attempt ${attempt}) …`);
        const res = await fetch(endpoint, {
          method: "POST",
          headers,
          body: "data=" + encodeURIComponent(query),
        });
        if (res.status === 429) {
          const wait = attempt * 5000;
          console.warn(`  rate-limited (429), waiting ${wait / 1000}s …`);
          await sleep(wait);
          continue;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
      } catch (err) {
        console.warn(`  failed: ${err.message}`);
        lastErr = err;
        break; // hard error — try the next mirror
      }
    }
  }
  throw lastErr ?? new Error("all Overpass endpoints failed");
}

function lengthOf(coords) {
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    total += haversine(
      { lng: coords[i - 1][0], lat: coords[i - 1][1] },
      { lng: coords[i][0], lat: coords[i][1] }
    );
  }
  return total;
}

const hintOf = (tags) =>
  ACCESS_TAG_KEYS.filter((k) => tags[k] != null)
    .map((k) => `${k}=${tags[k]}`)
    .join("; ");

// --- Stage 1a: the four buildings ------------------------------------

async function fetchBuildings() {
  const selectors = DESTINATIONS.map((d) => `${d.osmType}(${d.osmId});`).join("\n  ");
  // The recurse-down (._;>;) pulls in each relation's member ways and every
  // way's nodes, so entrance nodes sitting on a building outline arrive with
  // their tags attached — no second lookup needed.
  const osm = await overpass(
    `[out:json][timeout:90];\n(\n  ${selectors}\n);\n(._;>;);\nout body geom;`,
    "buildings"
  );

  const wayById = new Map();
  const nodeById = new Map();
  const relById = new Map();
  for (const el of osm.elements) {
    if (el.type === "node") nodeById.set(el.id, el);
    else if (el.type === "way") wayById.set(el.id, el);
    else if (el.type === "relation") relById.set(el.id, el);
  }

  const buildings = [];
  for (const dest of DESTINATIONS) {
    // Collect the outline ring(s) and the set of node IDs that form them.
    let rings = [];
    let memberNodeIds = new Set();
    let centre = null;

    if (dest.osmType === "way") {
      const w = wayById.get(dest.osmId);
      if (!w) throw new Error(`OSM way ${dest.osmId} (${dest.name}) not found`);
      rings = [w.geometry.map((g) => [g.lon, g.lat])];
      memberNodeIds = new Set(w.nodes ?? []);
    } else if (dest.osmType === "relation") {
      const r = relById.get(dest.osmId);
      if (!r) throw new Error(`OSM relation ${dest.osmId} (${dest.name}) not found`);
      // A multipolygon building: take the outer rings. Inner rings are
      // courtyards (the quadrangles) and are not needed for our purposes.
      for (const m of r.members ?? []) {
        if (m.type !== "way" || (m.role && m.role !== "outer")) continue;
        const w = wayById.get(m.ref);
        if (!w?.geometry) continue;
        rings.push(w.geometry.map((g) => [g.lon, g.lat]));
        for (const n of w.nodes ?? []) memberNodeIds.add(n);
      }
    } else if (dest.osmType === "node") {
      const n = nodeById.get(dest.osmId);
      if (!n) throw new Error(`OSM node ${dest.osmId} (${dest.name}) not found`);
      centre = { lat: n.lat, lng: n.lon };
    }

    // Centroid of all outline vertices — good enough to snap onto the path
    // network, and far more stable than a hand-typed guess.
    if (!centre && rings.length) {
      const pts = rings.flat();
      centre = {
        lat: pts.reduce((s, p) => s + p[1], 0) / pts.length,
        lng: pts.reduce((s, p) => s + p[0], 0) / pts.length,
      };
    }
    if (!centre) throw new Error(`could not locate ${dest.name}`);

    buildings.push({ ...dest, centre, rings, memberNodeIds });
  }

  // Entrance nodes lying on any of the four outlines, tagged with the
  // building they belong to.
  const entrances = [];
  for (const [id, n] of nodeById) {
    if (!n.tags?.entrance) continue;
    const owner = buildings.find((b) => b.memberNodeIds.has(id));
    if (!owner) continue;
    entrances.push({
      osmNodeId: id,
      lat: n.lat,
      lng: n.lon,
      building: owner.id,
      entrance: n.tags.entrance,
      tags: n.tags,
    });
  }

  return { buildings, entrances };
}

// --- Stage 1b: the pedestrian network --------------------------------

function bboxAround(buildings) {
  const lats = buildings.flatMap((b) =>
    b.rings.length ? b.rings.flat().map((p) => p[1]) : [b.centre.lat]
  );
  const lngs = buildings.flatMap((b) =>
    b.rings.length ? b.rings.flat().map((p) => p[0]) : [b.centre.lng]
  );
  const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const dLat = BBOX_PADDING_M / 111320;
  const dLng = BBOX_PADDING_M / (111320 * Math.cos((midLat * Math.PI) / 180));
  return {
    south: Math.min(...lats) - dLat,
    north: Math.max(...lats) + dLat,
    west: Math.min(...lngs) - dLng,
    east: Math.max(...lngs) + dLng,
  };
}

async function fetchNetwork(bbox) {
  const { south, west, north, east } = bbox;
  const b = `${south},${west},${north},${east}`;
  const osm = await overpass(
    `[out:json][timeout:90];
(
  way["highway"~"^(${HIGHWAY_FILTER})$"](${b});
  node["entrance"](${b});
);
(._;>;);
out body;`,
    "network"
  );

  const nodesById = new Map();
  const ways = [];
  const looseEntrances = [];
  for (const el of osm.elements) {
    if (el.type === "node") {
      nodesById.set(el.id, { lat: el.lat, lng: el.lon, tags: el.tags ?? {} });
      if (el.tags?.entrance) looseEntrances.push({ osmNodeId: el.id, lat: el.lat, lng: el.lon, tags: el.tags });
    } else if (el.type === "way" && el.tags?.highway) {
      ways.push({ id: el.id, tags: el.tags, refs: el.nodes });
    }
  }

  // A node used by two or more ways is a junction. Junctions and way
  // endpoints become graph nodes; everything between them is just shape.
  const useCount = new Map();
  for (const w of ways) for (const r of w.refs) useCount.set(r, (useCount.get(r) || 0) + 1);

  const graphIdOf = new Map();
  let nCounter = 0;
  const graphId = (osmId) => {
    if (!graphIdOf.has(osmId)) graphIdOf.set(osmId, "n" + ++nCounter);
    return graphIdOf.get(osmId);
  };

  // Sort by OSM way id so segment numbering is reproducible. Overpass does
  // not guarantee element order, and unstable numbering would silently
  // invalidate field data collected against an earlier run.
  ways.sort((a, b) => a.id - b.id);

  const edges = [];
  let sCounter = 0;
  for (const w of ways) {
    let startIdx = 0;
    for (let i = 1; i < w.refs.length; i++) {
      const isEnd = i === w.refs.length - 1;
      const isJunction = (useCount.get(w.refs[i]) || 0) >= 2;
      if (!isEnd && !isJunction) continue;

      const coords = w.refs
        .slice(startIdx, i + 1)
        .map((r) => nodesById.get(r))
        .filter(Boolean)
        .map((n) => [n.lng, n.lat]);

      // Skip self-loops. OSM maps pedestrian squares and plazas as closed
      // ways; where such a way shares no node with anything else, the split
      // above yields one "segment" that starts and ends at the same node.
      // Its length is the perimeter of an area, not the length of a route,
      // and as a graph edge it leads nowhere — so it is not a path segment.
      const isSelfLoop = w.refs[startIdx] === w.refs[i];

      if (coords.length >= 2 && !isSelfLoop) {
        edges.push({
          segmentId: "s" + String(++sCounter).padStart(3, "0"),
          from: graphId(w.refs[startIdx]),
          to: graphId(w.refs[i]),
          coords,
          length: lengthOf(coords),
          tags: w.tags,
          osmWayId: w.id,
          // Endpoint OSM node ids: the segment's durable identity. If OSM
          // changes and the numbering shifts, field data can still be
          // matched back to the right piece of ground through these.
          fromOsm: w.refs[startIdx],
          toOsm: w.refs[i],
        });
      }
      startIdx = i;
    }
  }

  const nodes = [];
  for (const [osmId, gid] of graphIdOf) {
    const n = nodesById.get(osmId);
    if (n) nodes.push({ node_id: gid, lat: n.lat, lng: n.lng, osm_node_id: osmId });
  }

  return { nodes, edges, looseEntrances };
}

// --- Main -------------------------------------------------------------

(async () => {
  try {
    const { buildings, entrances } = await fetchBuildings();
    console.log("\nTarget buildings located:");
    for (const b of buildings) {
      console.log(
        `  • ${b.name.padEnd(28)} ${b.centre.lat.toFixed(5)}, ${b.centre.lng.toFixed(5)}` +
          `  (${b.osmType}/${b.osmId})`
      );
    }

    const bbox = bboxAround(buildings);
    console.log(
      `\nStudy-area bbox (+${BBOX_PADDING_M} m): ` +
        `${bbox.south.toFixed(5)},${bbox.west.toFixed(5)} → ${bbox.north.toFixed(5)},${bbox.east.toFixed(5)}`
    );

    const { nodes, edges, looseEntrances } = await fetchNetwork(bbox);

    // Entrance nodes inside the bbox that are not on one of the four
    // outlines: keep only those very close to a target building, since an
    // accessible entrance is sometimes mapped just off the wall line.
    const extra = [];
    for (const e of looseEntrances) {
      if (entrances.some((x) => x.osmNodeId === e.osmNodeId)) continue;
      let best = null;
      let bestD = Infinity;
      for (const b of buildings) {
        const d = haversine(e, b.centre);
        if (d < bestD) ((bestD = d), (best = b));
      }
      if (best && bestD <= 60) {
        extra.push({
          osmNodeId: e.osmNodeId,
          lat: e.lat,
          lng: e.lng,
          building: best.id,
          entrance: e.tags.entrance,
          tags: e.tags,
          nearby: true,
        });
      }
    }
    const allEntrances = [...entrances, ...extra];

    mkdirSync(OUT_DIR, { recursive: true });

    // --- campus-network.geojson: the routable network ---
    const network = {
      type: "FeatureCollection",
      properties: {
        source: "OpenStreetMap (Overpass API), ODbL",
        generated: new Date().toISOString(),
        bbox,
      },
      features: [
        ...edges.map((e) => ({
          type: "Feature",
          geometry: { type: "LineString", coordinates: e.coords },
          properties: {
            kind: "segment",
            segment_id: e.segmentId,
            from: e.from,
            to: e.to,
            length_m: Math.round(e.length),
            highway: e.tags.highway || "",
            osm_way_id: e.osmWayId,
            osm_from_node: e.fromOsm,
            osm_to_node: e.toOsm,
            osm_hint: hintOf(e.tags),
          },
        })),
        ...nodes.map((n) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [n.lng, n.lat] },
          properties: { kind: "node", node_id: n.node_id, osm_node_id: n.osm_node_id },
        })),
      ],
    };
    writeFileSync(join(OUT_DIR, "campus-network.geojson"), JSON.stringify(network, null, 2));

    // --- buildings.geojson: the four destinations + entrance candidates ---
    const buildingsGeo = {
      type: "FeatureCollection",
      properties: { source: "OpenStreetMap (Overpass API), ODbL" },
      features: [
        ...buildings.flatMap((b) =>
          b.rings.map((ring, i) => ({
            type: "Feature",
            geometry: { type: "Polygon", coordinates: [ring] },
            properties: {
              kind: "building",
              dest_id: b.id,
              name: b.name,
              ring: i,
              osm: `${b.osmType}/${b.osmId}`,
            },
          }))
        ),
        ...buildings.map((b) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [b.centre.lng, b.centre.lat] },
          properties: {
            kind: "destination",
            dest_id: b.id,
            name: b.name,
            osm: `${b.osmType}/${b.osmId}`,
            inside_of: b.insideOf ?? "",
          },
        })),
        ...allEntrances.map((e) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [e.lng, e.lat] },
          properties: {
            kind: "entrance",
            dest_id: e.building,
            osm_node_id: e.osmNodeId,
            entrance: e.entrance,
            wheelchair: e.tags.wheelchair ?? "",
            level: e.tags.level ?? "",
            osm_hint: Object.entries(e.tags)
              .map(([k, v]) => `${k}=${v}`)
              .join("; "),
            off_outline: e.nearby ? "yes" : "",
          },
        })),
      ],
    };
    writeFileSync(join(OUT_DIR, "buildings.geojson"), JSON.stringify(buildingsGeo, null, 2));

    // --- Coverage gap analysis ---
    // A single "has any accessibility tag" percentage is misleading, because
    // it is dominated by `surface`, which mappers add routinely. Reporting
    // per-tag coverage shows the real picture: the attributes that actually
    // decide whether a wheelchair user can pass are almost entirely absent.
    const coverage = ACCESS_TAG_KEYS.map((k) => ({
      tag: k,
      n: edges.filter((e) => e.tags[k] != null).length,
    })).sort((a, b) => b.n - a.n);

    const totalKm = edges.reduce((s, e) => s + e.length, 0) / 1000;
    console.log("\n=== Downloaded ===");
    console.log(`Junction nodes:    ${nodes.length}`);
    console.log(`Path segments:     ${edges.length}  (${totalKm.toFixed(2)} km)`);
    console.log(`Entrance nodes:    ${allEntrances.length} on/near the four buildings`);
    console.log("\n=== What OSM already knows (the gap your survey fills) ===");
    for (const { tag, n } of coverage) {
      const pct = Math.round((n / edges.length) * 100);
      console.log(`  ${tag.padEnd(16)} ${String(n).padStart(4)} / ${edges.length}  ${String(pct).padStart(3)}%`);
    }

    const table = [
      "| OSM tag | Segments tagged | Coverage |",
      "| ------- | --------------: | -------: |",
      ...coverage.map(({ tag, n }) => `| \`${tag}\` | ${n} / ${edges.length} | ${Math.round((n / edges.length) * 100)}% |`),
    ].join("\n");
    writeFileSync(
      join(OUT_DIR, "osm-coverage.md"),
      `# OSM accessibility-attribute coverage — Gilmorehill study area\n\n` +
        `Generated ${new Date().toISOString().slice(0, 10)} from ${edges.length} path segments ` +
        `(${totalKm.toFixed(2)} km) across the four-destination study area.\n\n` +
        `${table}\n\n` +
        `Attribution: base data © OpenStreetMap contributors, ODbL.\n`
    );

    console.log("\nWrote survey/campus-network.geojson, survey/buildings.geojson, survey/osm-coverage.md");
    console.log("Next:  npm run survey:build");
  } catch (err) {
    console.error("\nERROR: could not fetch OSM data.");
    console.error(err.message);
    console.error(
      "\nIf you are on a restricted network, a proxy or VPN may be needed to reach overpass-api.de."
    );
    process.exit(1);
  }
})();
