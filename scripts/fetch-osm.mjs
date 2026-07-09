// Fetches the pedestrian path network around the University of Glasgow's
// Gilmorehill campus from OpenStreetMap (Overpass API) and turns it into a
// routable graph. Outputs a GeoJSON network, pre-filled survey CSVs, and a
// self-contained numbered base map (Leaflet) for field surveying.
//
// Usage:  node scripts/fetch-osm.mjs
//
// Data © OpenStreetMap contributors, ODbL. Attribution required.

import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "survey");

// Bounding box around the Gilmorehill campus (south, west, north, east)
const BBOX = { south: 55.8698, west: -4.2945, north: 55.8745, east: -4.2852 };

// Highway types that pedestrians (including wheelchair users) may use
const HIGHWAY_FILTER =
  "footway|path|pedestrian|steps|corridor|cycleway|living_street|service";

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// OSM tags we surface as "hints" so the surveyor can verify, not re-measure
const ACCESS_TAG_KEYS = [
  "surface",
  "smoothness",
  "incline",
  "wheelchair",
  "width",
  "tactile_paving",
  "handrail",
  "step_count",
  "lit",
  "kerb",
  "ramp",
  "ramp:wheelchair",
];

function buildQuery() {
  const { south, west, north, east } = BBOX;
  return `[out:json][timeout:90];
(
  way["highway"~"^(${HIGHWAY_FILTER})$"](${south},${west},${north},${east});
);
(._;>;);
out body;`;
}

async function fetchOverpass() {
  const query = buildQuery();
  const headers = {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
    // Overpass rejects requests without a descriptive User-Agent (HTTP 406)
    "User-Agent": "GilmorehillCampusNav/1.0 (ENG5059P MSc project)",
  };
  let lastErr;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    // Up to 3 attempts per endpoint, backing off on rate-limit (429)
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`Querying ${endpoint} (attempt ${attempt}) …`);
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
        break; // move to next endpoint on hard errors
      }
    }
  }
  throw lastErr;
}

// Haversine distance in metres between two [lng, lat] points
function haversine([lng1, lat1], [lng2, lat2]) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function lengthOf(coords) {
  let total = 0;
  for (let i = 1; i < coords.length; i++) total += haversine(coords[i - 1], coords[i]);
  return total;
}

function parseIncline(v) {
  if (!v) return "";
  const m = String(v).match(/-?\d+(\.\d+)?/);
  return m ? m[0] : "";
}

// CSV helper — quote fields containing commas, quotes or newlines
function csvRow(fields) {
  return fields
    .map((f) => {
      const s = f == null ? "" : String(f);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    })
    .join(",");
}

function main(osm) {
  // Index nodes and ways from the Overpass response
  const nodesById = new Map();
  const ways = [];
  for (const el of osm.elements) {
    if (el.type === "node") nodesById.set(el.id, { lat: el.lat, lon: el.lon });
    else if (el.type === "way") ways.push({ id: el.id, tags: el.tags || {}, refs: el.nodes });
  }

  // Count how many ways use each node — nodes shared by >= 2 ways are
  // intersections and become graph nodes (along with way endpoints).
  const useCount = new Map();
  for (const w of ways)
    for (const r of w.refs) useCount.set(r, (useCount.get(r) || 0) + 1);

  const graphIdOf = new Map();
  let nCounter = 0;
  const graphId = (osmId) => {
    if (!graphIdOf.has(osmId)) graphIdOf.set(osmId, "n" + ++nCounter);
    return graphIdOf.get(osmId);
  };

  // Split each way into edges between consecutive graph nodes
  const edges = [];
  let sCounter = 0;
  for (const w of ways) {
    let startIdx = 0;
    for (let i = 1; i < w.refs.length; i++) {
      const isEnd = i === w.refs.length - 1;
      const isJunction = (useCount.get(w.refs[i]) || 0) >= 2;
      if (!isEnd && !isJunction) continue;

      const slice = w.refs.slice(startIdx, i + 1);
      const coords = slice
        .map((r) => nodesById.get(r))
        .filter(Boolean)
        .map((n) => [n.lon, n.lat]);
      if (coords.length >= 2) {
        edges.push({
          segmentId: "s" + String(++sCounter).padStart(3, "0"),
          from: graphId(w.refs[startIdx]),
          to: graphId(w.refs[i]),
          coords,
          length: lengthOf(coords),
          tags: w.tags,
          osmWayId: w.id,
        });
      }
      startIdx = i;
    }
  }

  // Assemble graph node list
  const nodes = [];
  for (const [osmId, gid] of graphIdOf.entries()) {
    const n = nodesById.get(osmId);
    if (n) nodes.push({ node_id: gid, lat: n.lat, lng: n.lon, osm_node_id: osmId });
  }

  mkdirSync(OUT_DIR, { recursive: true });

  // --- GeoJSON network ---
  const geojson = {
    type: "FeatureCollection",
    features: edges.map((e) => ({
      type: "Feature",
      geometry: { type: "LineString", coordinates: e.coords },
      properties: {
        segment_id: e.segmentId,
        from: e.from,
        to: e.to,
        length_m: Math.round(e.length),
        highway: e.tags.highway || "",
        osm_hint: ACCESS_TAG_KEYS.filter((k) => e.tags[k] != null)
          .map((k) => `${k}=${e.tags[k]}`)
          .join("; "),
      },
    })),
  };
  writeFileSync(join(OUT_DIR, "campus-network.geojson"), JSON.stringify(geojson, null, 2));

  // --- segments.csv (pre-filled with OSM hints; blank columns for the field) ---
  const segHeader = [
    "segment_id", "from_id", "to_id", "length_m", "highway",
    "step_free", "step_count", "ramp", "handrail", "gradient_pct",
    "surface", "surface_condition", "width_m", "dropped_kerb",
    "tactile_paving", "lit", "seating_nearby", "osm_hint", "notes",
  ];
  const segLines = [csvRow(segHeader)];
  let withHints = 0;
  for (const e of edges) {
    const t = e.tags;
    const hint = ACCESS_TAG_KEYS.filter((k) => t[k] != null)
      .map((k) => `${k}=${t[k]}`)
      .join("; ");
    if (hint) withHints++;
    segLines.push(
      csvRow([
        e.segmentId, e.from, e.to, Math.round(e.length), t.highway || "",
        t.highway === "steps" ? "no" : t.wheelchair === "yes" ? "yes" : "",
        t.step_count || "",
        t.ramp || "",
        t.handrail || "",
        parseIncline(t.incline),
        t.surface || "",
        "", // surface_condition — field only
        t.width || "",
        t.kerb || "",
        t.tactile_paving || "",
        t.lit || "",
        "", // seating_nearby — field only
        hint,
        "",
      ])
    );
  }
  writeFileSync(join(OUT_DIR, "segments.csv"), segLines.join("\n"));

  // --- nodes.csv ---
  const nodeLines = [csvRow(["node_id", "lat", "lng", "type", "name", "notes"])];
  for (const n of nodes)
    nodeLines.push(csvRow([n.node_id, n.lat.toFixed(6), n.lng.toFixed(6), "", "", ""]));
  writeFileSync(join(OUT_DIR, "nodes.csv"), nodeLines.join("\n"));

  // --- self-contained numbered base map (Leaflet) ---
  writeFileSync(join(OUT_DIR, "basemap.html"), basemapHtml(geojson, nodes));

  const totalKm = edges.reduce((s, e) => s + e.length, 0) / 1000;
  console.log("\n=== Done ===");
  console.log(`Nodes:            ${nodes.length}`);
  console.log(`Segments:         ${edges.length}`);
  console.log(`Total path length: ${totalKm.toFixed(2)} km`);
  console.log(
    `Segments with any OSM accessibility hint: ${withHints}/${edges.length} ` +
      `(${Math.round((withHints / edges.length) * 100)}%)`
  );
  console.log(`\nOutput written to: ${OUT_DIR}`);
}

function basemapHtml(geojson, nodes) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Gilmorehill Survey Base Map</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<style>
  html, body, #map { height: 100%; margin: 0; }
  .seg-label { background: #003865; color: #fff; border: none; border-radius: 3px;
    font: 700 11px system-ui, sans-serif; padding: 1px 4px; }
  .node-label { background: #d32f2f; color: #fff; border: none; border-radius: 8px;
    font: 700 10px system-ui, sans-serif; padding: 0 4px; }
  .legend { background: #fff; padding: 8px 10px; font: 13px system-ui, sans-serif;
    line-height: 1.5; box-shadow: 0 1px 4px rgba(0,0,0,.3); border-radius: 4px; }
</style>
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
  const NETWORK = ${JSON.stringify(geojson)};
  const NODES = ${JSON.stringify(nodes)};

  const map = L.map("map");
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 20, attribution: "© OpenStreetMap contributors"
  }).addTo(map);

  // Draw path segments with permanent ID labels
  const lines = L.geoJSON(NETWORK, {
    style: { color: "#f5a623", weight: 5, opacity: 0.9 },
    onEachFeature: (f, layer) => {
      const p = f.properties;
      layer.bindPopup(
        "<b>" + p.segment_id + "</b> (" + p.length_m + " m)<br>" +
        "highway: " + (p.highway || "—") + "<br>" +
        "OSM: " + (p.osm_hint || "no accessibility tags")
      );
      // Label on hover (desktop) or tap (mobile shows the popup) — showing
      // all 400+ labels at once is unreadable, so they appear on demand.
      layer.bindTooltip(p.segment_id, { sticky: true, className: "seg-label" });
    },
  }).addTo(map);

  // Draw graph nodes; node id shown on hover/tap rather than permanently
  NODES.forEach((n) => {
    L.circleMarker([n.lat, n.lng], { radius: 3, color: "#d32f2f", fillOpacity: 1 })
      .bindTooltip(n.node_id, { direction: "top", className: "node-label" })
      .addTo(map);
  });

  map.fitBounds(lines.getBounds(), { padding: [30, 30] });

  // "Locate me" for field use (shows your GPS position)
  const LocateControl = L.Control.extend({
    onAdd: () => {
      const btn = L.DomUtil.create("button", "");
      btn.textContent = "📍 Locate me";
      btn.style.cssText = "padding:8px 10px;font:14px system-ui;cursor:pointer;";
      btn.onclick = () => map.locate({ setView: true, maxZoom: 19, watch: true });
      return btn;
    },
  });
  new LocateControl({ position: "topright" }).addTo(map);
  let meMarker;
  map.on("locationfound", (e) => {
    if (!meMarker) meMarker = L.marker(e.latlng).addTo(map).bindPopup("You are here");
    else meMarker.setLatLng(e.latlng);
  });

  const legend = L.control({ position: "bottomleft" });
  legend.onAdd = () => {
    const div = L.DomUtil.create("div", "legend");
    div.innerHTML =
      "<b>Gilmorehill survey base map</b><br>" +
      "🟧 path segment (blue label = segment_id)<br>" +
      "🔴 junction/node (red label = node_id)<br>" +
      "Tap a segment for its OSM hints.<br>" +
      "Fill <b>segments.csv</b> by segment_id.";
    return div;
  };
  legend.addTo(map);
</script>
</body>
</html>
`;
}

(async () => {
  try {
    const osm = await fetchOverpass();
    main(osm);
  } catch (err) {
    console.error("\nERROR: could not fetch OSM data.");
    console.error(err.message);
    process.exit(1);
  }
})();
