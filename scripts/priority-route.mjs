// Builds a PRIORITY survey network: instead of all 437 segments, it connects
// only the key campus buildings via their shortest accessible-ish paths
// (a minimum spanning tree over the buildings), and emits a much smaller
// segment set plus a clean, readable base map.
//
// Reads the already-downloaded network (no re-fetch needed):
//   survey/campus-network.geojson, survey/nodes.csv, survey/segments.csv
// Writes:
//   survey/segments-priority.csv   — only the priority segments (pre-filled)
//   survey/basemap-priority.html   — priority route highlighted, labelled
//   survey/basemap.html            — full map regenerated, decluttered
//
// Usage:  node scripts/priority-route.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIR = join(__dirname, "..", "survey");

// Key buildings to connect (approximate coords — snapped to the nearest
// path node, so they don't need to be exact). Trim or extend this list.
const PRIORITY_BUILDINGS = [
  { name: "Main Building", lat: 55.8717, lng: -4.2887 },
  { name: "University Library", lat: 55.8730, lng: -4.2879 },
  { name: "Boyd Orr Building", lat: 55.8722, lng: -4.2913 },
  { name: "Kelvin Building", lat: 55.8714, lng: -4.2896 },
  { name: "James Watt (South)", lat: 55.8709, lng: -4.2901 },
  { name: "Joseph Black Building", lat: 55.8721, lng: -4.2924 },
  { name: "Fraser Building", lat: 55.8725, lng: -4.2872 },
];

function haversine(aLat, aLng, bLat, bLng) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// --- Load the network ---
const geojson = JSON.parse(readFileSync(join(DIR, "campus-network.geojson"), "utf8"));

const nodeCoord = new Map(); // node_id -> {lat, lng}
const nodeLines = readFileSync(join(DIR, "nodes.csv"), "utf8").trim().split("\n");
for (const line of nodeLines.slice(1)) {
  const [id, lat, lng] = line.split(",");
  nodeCoord.set(id, { lat: +lat, lng: +lng });
}

// Build an undirected adjacency list from the segments
const adj = new Map(); // node_id -> [{ to, seg, w }]
for (const f of geojson.features) {
  const { from, to, segment_id, length_m } = f.properties;
  const w = Number(length_m) || 1;
  if (!adj.has(from)) adj.set(from, []);
  if (!adj.has(to)) adj.set(to, []);
  adj.get(from).push({ to, seg: segment_id, w });
  adj.get(to).push({ to: from, seg: segment_id, w });
}

const nodeIds = [...nodeCoord.keys()];

// OSM footway networks often contain disconnected fragments (service stubs,
// unlinked paths). Find the largest connected component — the main
// pedestrian network — and snap buildings only into it, so every priority
// building is mutually reachable.
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
      for (const e of adj.get(u) || []) if (!comp.has(e.to)) stack.push(e.to);
    }
    if (comp.size > best.size) best = comp;
  }
  return best;
}
const mainComponent = largestComponent();

// Snap each building to its nearest node within the main network
function nearestNode(lat, lng) {
  let best = null;
  let bestD = Infinity;
  for (const id of mainComponent) {
    const c = nodeCoord.get(id);
    const d = haversine(lat, lng, c.lat, c.lng);
    if (d < bestD) {
      bestD = d;
      best = id;
    }
  }
  return best;
}
const buildings = PRIORITY_BUILDINGS.map((b) => ({ ...b, nodeId: nearestNode(b.lat, b.lng) }));

// Dijkstra from a source node (small graph → simple O(V^2) is fine)
function dijkstra(src) {
  const dist = new Map(nodeIds.map((id) => [id, Infinity]));
  const prevN = new Map();
  const prevS = new Map();
  const visited = new Set();
  dist.set(src, 0);
  while (true) {
    let u = null;
    let ud = Infinity;
    for (const [id, d] of dist) if (!visited.has(id) && d < ud) ((u = id), (ud = d));
    if (u === null) break;
    visited.add(u);
    for (const e of adj.get(u) || []) {
      if (visited.has(e.to)) continue;
      const nd = ud + e.w;
      if (nd < dist.get(e.to)) {
        dist.set(e.to, nd);
        prevN.set(e.to, u);
        prevS.set(e.to, e.seg);
      }
    }
  }
  return { dist, prevN, prevS };
}

// Pre-compute shortest paths from every building
const dijkFrom = new Map();
for (const bn of new Set(buildings.map((b) => b.nodeId))) dijkFrom.set(bn, dijkstra(bn));

// Prim's MST over the building nodes; collect the segments along the chosen links
const buildingNodes = buildings.map((b) => b.nodeId);
const inTree = new Set([buildingNodes[0]]);
const remaining = new Set(buildingNodes.slice(1));
const chosen = new Set();
const links = [];

while (remaining.size) {
  let best = { dist: Infinity };
  for (const c of inTree) {
    const dc = dijkFrom.get(c);
    for (const r of remaining) {
      const d = dc.dist.get(r) ?? Infinity;
      if (d < best.dist) best = { c, r, dist: d };
    }
  }
  if (!isFinite(best.dist)) {
    console.warn("⚠ Some buildings are not connected in the OSM network — skipped.");
    break;
  }
  const dc = dijkFrom.get(best.c);
  let cur = best.r;
  while (cur !== best.c && cur != null) {
    const seg = dc.prevS.get(cur);
    if (seg) chosen.add(seg);
    cur = dc.prevN.get(cur);
  }
  links.push({ from: best.c, to: best.r, dist: Math.round(best.dist) });
  inTree.add(best.r);
  remaining.delete(best.r);
}

// --- Write segments-priority.csv (preserve pre-filled rows from segments.csv) ---
const segLines = readFileSync(join(DIR, "segments.csv"), "utf8").trim().split("\n");
const keptSeg = [segLines[0], ...segLines.slice(1).filter((l) => chosen.has(l.split(",")[0]))];
writeFileSync(join(DIR, "segments-priority.csv"), keptSeg.join("\n"));

// --- Maps ---
const TILE =
  'L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",' +
  '{maxZoom:20,attribution:"© OpenStreetMap contributors"}).addTo(map);';

const STYLE = `<style>
  html,body,#map{height:100%;margin:0}
  .seg-label{background:#003865;color:#fff;border:none;border-radius:3px;font:700 12px system-ui,sans-serif;padding:1px 5px}
  .node-label{background:#d32f2f;color:#fff;border:none;border-radius:8px;font:700 10px system-ui,sans-serif;padding:0 4px}
  .bldg-label{background:#111;color:#fff;border:none;border-radius:4px;font:700 13px system-ui,sans-serif;padding:2px 6px}
  .legend{background:#fff;padding:8px 10px;font:13px system-ui,sans-serif;line-height:1.5;box-shadow:0 1px 4px rgba(0,0,0,.3);border-radius:4px}
  button.locate{padding:8px 10px;font:14px system-ui;cursor:pointer}
</style>`;

const HEAD = (title) => `<!doctype html><html lang="en"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${title}</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
${STYLE}</head><body><div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script><script>`;

const LOCATE = `
  const L2=L.Control.extend({onAdd:()=>{const b=L.DomUtil.create("button","locate");b.textContent="📍 Locate me";
  b.onclick=()=>map.locate({setView:true,maxZoom:19,watch:true});return b;}});
  new L2({position:"topright"}).addTo(map);let me;
  map.on("locationfound",e=>{me?me.setLatLng(e.latlng):(me=L.marker(e.latlng).addTo(map).bindPopup("You are here"));});`;

// Full map (decluttered: labels on hover/tap)
function buildFullMap() {
  const nodes = [...nodeCoord.entries()].map(([id, c]) => ({ id, ...c }));
  return `${HEAD("Gilmorehill Survey — Full Network")}
  const NET=${JSON.stringify(geojson)};const NODES=${JSON.stringify(nodes)};
  const map=L.map("map");${TILE}
  const lines=L.geoJSON(NET,{style:{color:"#f5a623",weight:5,opacity:.9},
    onEachFeature:(f,l)=>{const p=f.properties;
      l.bindPopup("<b>"+p.segment_id+"</b> ("+p.length_m+" m)<br>highway: "+(p.highway||"—")+"<br>OSM: "+(p.osm_hint||"no accessibility tags"));
      l.bindTooltip(p.segment_id,{sticky:true,className:"seg-label"});}}).addTo(map);
  NODES.forEach(n=>L.circleMarker([n.lat,n.lng],{radius:3,color:"#d32f2f",fillOpacity:1})
    .bindTooltip(n.id,{direction:"top",className:"node-label"}).addTo(map));
  map.fitBounds(lines.getBounds(),{padding:[30,30]});${LOCATE}
  const lg=L.control({position:"bottomleft"});lg.onAdd=()=>{const d=L.DomUtil.create("div","legend");
    d.innerHTML="<b>Full network (437 segments)</b><br>Tap a segment or node to see its number.";return d;};lg.addTo(map);
  </script></body></html>`;
}

// Priority map: grey context + orange priority route with permanent labels
function buildPriorityMap() {
  const priorityFeatures = geojson.features.filter((f) => chosen.has(f.properties.segment_id));
  const contextFeatures = geojson.features.filter((f) => !chosen.has(f.properties.segment_id));
  const priorityGeo = { type: "FeatureCollection", features: priorityFeatures };
  const contextGeo = { type: "FeatureCollection", features: contextFeatures };
  const bldgMarkers = buildings.map((b) => ({ name: b.name, ...nodeCoord.get(b.nodeId) }));
  return `${HEAD("Gilmorehill Survey — Priority Route")}
  const PRI=${JSON.stringify(priorityGeo)};const CTX=${JSON.stringify(contextGeo)};const BLD=${JSON.stringify(bldgMarkers)};
  const map=L.map("map");${TILE}
  L.geoJSON(CTX,{style:{color:"#9aa0a6",weight:2,opacity:.5}}).addTo(map);
  const pri=L.geoJSON(PRI,{style:{color:"#f5a623",weight:6,opacity:.95},
    onEachFeature:(f,l)=>{const p=f.properties;
      l.bindPopup("<b>"+p.segment_id+"</b> ("+p.length_m+" m)<br>highway: "+(p.highway||"—")+"<br>OSM: "+(p.osm_hint||"no accessibility tags"));
      l.bindTooltip(p.segment_id,{permanent:true,direction:"center",className:"seg-label"});}}).addTo(map);
  BLD.forEach(b=>L.marker([b.lat,b.lng]).addTo(map)
    .bindTooltip(b.name,{permanent:true,direction:"top",className:"bldg-label"}));
  map.fitBounds(pri.getBounds(),{padding:[40,40]});${LOCATE}
  const lg=L.control({position:"bottomleft"});lg.onAdd=()=>{const d=L.DomUtil.create("div","legend");
    d.innerHTML="<b>Priority survey route</b><br>🟧 survey these (labels = segment_id)<br>⬛ key buildings<br>— grey = rest of network (skip for now)<br>Fill <b>segments-priority.csv</b>.";return d;};lg.addTo(map);
  </script></body></html>`;
}

writeFileSync(join(DIR, "basemap.html"), buildFullMap());
writeFileSync(join(DIR, "basemap-priority.html"), buildPriorityMap());

const totalLen = geojson.features
  .filter((f) => chosen.has(f.properties.segment_id))
  .reduce((s, f) => s + (Number(f.properties.length_m) || 0), 0);

console.log("=== Priority survey route ===");
console.log(`Buildings connected: ${buildings.length}`);
buildings.forEach((b) => console.log(`  • ${b.name}  → node ${b.nodeId}`));
console.log(`\nPriority segments: ${chosen.size}  (of ${geojson.features.length} total)`);
console.log(`Priority length:   ${(totalLen / 1000).toFixed(2)} km  (of 11.59 km total)`);
console.log(`\nWrote: segments-priority.csv, basemap-priority.html, basemap.html`);
