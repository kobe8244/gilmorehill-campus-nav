// Shared configuration for the Gilmorehill outdoor-navigation study area.
//
// The project is deliberately scoped to FOUR destinations rather than the
// whole campus, so that every path between them can be surveyed to a
// defensible standard instead of many paths being surveyed superficially.
//
// Both scripts/fetch-osm.mjs and scripts/build-survey.mjs import this file,
// so the two stages can never disagree about what the study area is.

// The four destinations. `osmType`/`osmId` were verified against the live
// Overpass API — querying by ID is exact, unlike name matching, which breaks
// when a mapper renames a building.
export const DESTINATIONS = [
  {
    id: "main_building",
    name: "Main Building",
    // OSM maps the Main Building under its architectural name.
    osmName: "Gilbert Scott Building",
    osmType: "relation",
    osmId: 11951,
  },
  {
    id: "hunterian_museum",
    name: "Hunterian Museum",
    osmName: "Hunterian Museum",
    // A point of interest, NOT a building of its own: the museum occupies
    // level 2 of the Gilbert Scott Building. Outdoor navigation therefore
    // ends at the museum's accessible entrance and hands over indoors.
    osmType: "node",
    osmId: 600576868,
    insideOf: "main_building",
  },
  {
    id: "university_library",
    name: "University Library",
    osmName: "University of Glasgow Library",
    osmType: "way",
    osmId: 32660759,
  },
  {
    id: "james_watt_south",
    name: "James Watt Building (South)",
    // OSM has a single "James Watt Building" way; the South block is the
    // University Avenue frontage. Confirm the exact wing during the survey.
    osmName: "James Watt Building",
    osmType: "way",
    osmId: 182180587,
  },
];

// Padding added around the four buildings to form the download bounding box.
// 180 m is enough to include the alternative routes and crossings that a
// step-free path may need to detour onto.
export const BBOX_PADDING_M = 180;

// Highway types a pedestrian (including a wheelchair user) may travel on.
// Carriageways are excluded: on this campus the walkable ways are mapped
// separately as footways, so including roads would invent routes that do
// not exist on the ground.
export const HIGHWAY_FILTER =
  "footway|path|pedestrian|steps|corridor|living_street|service";

// OSM tags surfaced to the surveyor as "hints" to VERIFY rather than
// re-measure from scratch. OSM's coverage of these is near zero here, which
// is precisely the gap this project's fieldwork fills.
export const ACCESS_TAG_KEYS = [
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

// Columns of survey/segments.csv, in order. `tier` and everything from
// `step_free` onwards is what the surveyor fills in on site.
export const SEGMENT_COLUMNS = [
  "segment_id",
  "tier",
  "from_id",
  "to_id",
  "length_m",
  "highway",
  "step_free",
  "step_count",
  "ramp",
  "handrail",
  "gradient_pct",
  "surface",
  "surface_condition",
  "width_m",
  "dropped_kerb",
  "tactile_paving",
  "lit",
  "seating_nearby",
  "osm_hint",
  // Durable identity. `segment_id` is a counter and shifts whenever OSM
  // changes underneath us; these three name the actual piece of ground, so
  // field data can be re-matched after a re-fetch instead of being silently
  // attached to a different path. Reference only — never type in these.
  "osm_way",
  "osm_from",
  "osm_to",
  "notes",
];

// Columns the surveyor fills in — used to detect whether a row already holds
// field data so that re-running the build never destroys it.
export const SEGMENT_FIELD_COLUMNS = [
  "step_free",
  "step_count",
  "ramp",
  "handrail",
  "gradient_pct",
  "surface",
  "surface_condition",
  "width_m",
  "dropped_kerb",
  "tactile_paving",
  "lit",
  "seating_nearby",
  "notes",
];

export const ENTRANCE_COLUMNS = [
  "entrance_id",
  "building",
  "serves",
  "accessible",
  "door_type",
  "step_free",
  "step_count",
  "ramp",
  "door_width_m",
  "lat",
  "lng",
  "nearest_node_id",
  "indoor_handover_id",
  "osm_hint",
  "notes",
];

export const ENTRANCE_FIELD_COLUMNS = [
  "accessible",
  "door_type",
  "step_free",
  "step_count",
  "ramp",
  "door_width_m",
  "indoor_handover_id",
  "notes",
];

// --- Geometry helpers -------------------------------------------------

// Great-circle distance in metres between two {lat, lng} points.
export function haversine(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// Shortest distance in metres from a point to a line segment. Distances here
// are under ~500 m, so projecting onto a local flat plane is accurate to a
// few centimetres and avoids the cost of a proper geodesic solution.
export function distanceToSegment(p, a, b) {
  const mPerDegLat = 111320;
  const mPerDegLng = 111320 * Math.cos((p.lat * Math.PI) / 180);
  const px = (p.lng - a.lng) * mPerDegLng;
  const py = (p.lat - a.lat) * mPerDegLat;
  const bx = (b.lng - a.lng) * mPerDegLng;
  const by = (b.lat - a.lat) * mPerDegLat;
  const lenSq = bx * bx + by * by;
  // Degenerate segment (both ends identical) — fall back to point distance.
  if (lenSq === 0) return Math.hypot(px, py);
  // Clamp the projection to [0, 1] so it stays within the segment.
  const t = Math.max(0, Math.min(1, (px * bx + py * by) / lenSq));
  return Math.hypot(px - t * bx, py - t * by);
}

// --- CSV helpers ------------------------------------------------------

// Quote fields containing commas, quotes or newlines, per RFC 4180.
export function csvRow(fields) {
  return fields
    .map((f) => {
      const s = f == null ? "" : String(f);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    })
    .join(",");
}

// Minimal RFC 4180 parser — handles the quoted free-text `notes` column that
// surveyors will inevitably type commas into.
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') ((field += '"'), i++);
        else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") ((row.push(field)), (field = ""));
    else if (c === "\n") ((row.push(field)), rows.push(row), (row = []), (field = ""));
    else if (c !== "\r") field += c;
  }
  if (field !== "" || row.length) ((row.push(field)), rows.push(row));
  if (!rows.length) return [];
  const header = rows[0];
  return rows.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}
