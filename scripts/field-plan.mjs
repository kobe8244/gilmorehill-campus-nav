

// Stage 3 of the survey pipeline — the walking plan.
//
// Turns the 60 segments chosen by build-survey.mjs into an ordered itinerary
// you can actually follow on foot, split into sessions, with the transit
// walks between disconnected pieces made explicit.
//
// The survey network is not an Eulerian graph (it has 22 dead ends), so some
// retracing is unavoidable. This picks an order that keeps it small rather
// than pretending it is zero.
//
// Usage:  npm run survey:plan     (or: node scripts/field-plan.mjs)
// Writes: survey/field-plan.md

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { haversine } from "./study-area.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIR = join(__dirname, "..", "survey");

// Roughly how long one segment takes to record properly: pace the length,
// measure the narrowest width, read the gradient, note surface and kerbs,
// take a photo. Deliberately not optimistic.
const MINUTES_PER_SEGMENT = 3.5;
const MINUTES_PER_ENTRANCE = 4;
const WALKING_SPEED_M_PER_MIN = 55; // slow, because you are looking at things

const net = JSON.parse(readFileSync(join(__dirname, "..", "src", "data", "campusNetwork.json"), "utf8"));
const buildings = JSON.parse(readFileSync(join(DIR, "buildings.geojson"), "utf8"));

const nodeById = new Map(net.nodes.map((n) => [n.id, n]));
const segById = new Map(net.segments.map((s) => [s.id, s]));

// --- Graph ------------------------------------------------------------

const adj = new Map();
for (const s of net.segments) {
  if (!adj.has(s.from)) adj.set(s.from, []);
  if (!adj.has(s.to)) adj.set(s.to, []);
  adj.get(s.from).push({ to: s.to, seg: s.id, w: s.lengthM });
  adj.get(s.to).push({ to: s.from, seg: s.id, w: s.lengthM });
}

function dijkstra(src) {
  const dist = new Map([...adj.keys()].map((id) => [id, Infinity]));
  const prev = new Map();
  const seen = new Set();
  dist.set(src, 0);
  while (true) {
    let u = null;
    let ud = Infinity;
    for (const [id, d] of dist) if (!seen.has(id) && d < ud) ((u = id), (ud = d));
    if (u === null) break;
    seen.add(u);
    for (const e of adj.get(u) ?? []) {
      const nd = ud + e.w;
      if (nd < (dist.get(e.to) ?? Infinity)) {
        dist.set(e.to, nd);
        prev.set(e.to, u);
      }
    }
  }
  return { dist, prev };
}

const pathBetween = (prev, src, target) => {
  const out = [target];
  let cur = target;
  while (cur !== src && prev.has(cur)) {
    cur = prev.get(cur);
    out.unshift(cur);
  }
  return out;
};

// --- Compass bearing, for human-readable location hints ----------------

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
function bearing(from, to) {
  const toRad = (d) => (d * Math.PI) / 180;
  const y = Math.sin(toRad(to.lng - from.lng)) * Math.cos(toRad(to.lat));
  const x =
    Math.cos(toRad(from.lat)) * Math.sin(toRad(to.lat)) -
    Math.sin(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.cos(toRad(to.lng - from.lng));
  const deg = (Math.atan2(y, x) * 180) / Math.PI;
  return COMPASS[Math.round(((deg + 360) % 360) / 45) % 8];
}

// Describe where a segment is, relative to the nearest of the four buildings.
function whereIs(seg) {
  const mid = seg.coords[Math.floor(seg.coords.length / 2)];
  const p = { lat: mid[1], lng: mid[0] };
  let best = null;
  let bestD = Infinity;
  for (const d of net.destinations) {
    const dist = haversine(p, d);
    if (dist < bestD) ((bestD = dist), (best = d));
  }
  if (bestD < 25) return `at ${best.name}`;
  return `${Math.round(bestD)} m ${bearing(best, p)} of ${best.name}`;
}

// --- Order the walk ----------------------------------------------------

// Greedy route inspection: keep walking unsurveyed segments while any is
// adjacent; when stuck, take the shortest walk to the nearest unsurveyed one
// and record that as a transit rather than hiding it.
function planWalk(segmentIds, startNode) {
  const todo = new Set(segmentIds);
  const legs = [];
  let current = startNode;
  let leg = { start: current, steps: [] };
  let transitM = 0;

  while (todo.size > 0) {
    // Prefer continuing straight ahead: among unsurveyed segments touching
    // the current node, take the shortest so short spurs get cleared early.
    const here = (adj.get(current) ?? [])
      .filter((e) => todo.has(e.seg))
      .sort((a, b) => a.w - b.w);

    if (here.length > 0) {
      const next = here[0];
      leg.steps.push({ type: "survey", seg: next.seg, from: current, to: next.to });
      todo.delete(next.seg);
      current = next.to;
      continue;
    }

    // Stuck: walk (without surveying) to the nearest node that still has
    // work on it.
    const { dist, prev } = dijkstra(current);
    let target = null;
    let targetD = Infinity;
    for (const id of todo) {
      const s = segById.get(id);
      for (const end of [s.from, s.to]) {
        const d = dist.get(end) ?? Infinity;
        if (d < targetD) ((targetD = d), (target = end));
      }
    }

    let offNetwork = false;
    if (target == null || !isFinite(targetD)) {
      // Nothing left is reachable along surveyed paths. Never stop here:
      // stopping silently drops every remaining segment from the plan, and a
      // segment missing from the plan is a segment nobody surveys. Jump to
      // the nearest one as the crow flies and say so.
      const here = nodeById.get(current);
      for (const id of todo) {
        const s = segById.get(id);
        for (const end of [s.from, s.to]) {
          const n = nodeById.get(end);
          if (!n || !here) continue;
          const d = haversine(here, n);
          if (d < targetD) ((targetD = d), (target = end));
        }
      }
      if (target == null) break; // genuinely nothing left that has a position
      offNetwork = true;
    }

    if (leg.steps.length) legs.push(leg);
    const via = offNetwork ? [current, target] : pathBetween(prev, current, target);
    transitM += targetD;
    legs.push({
      transit: true,
      offNetwork,
      from: current,
      to: target,
      metres: Math.round(targetD),
      via,
    });
    current = target;
    leg = { start: current, steps: [] };
  }
  if (leg.steps.length) legs.push(leg);
  return { legs, transitM: Math.round(transitM) };
}

// --- Entrances ---------------------------------------------------------

const entrances = buildings.features
  .filter((f) => f.properties.kind === "entrance")
  .map((f) => ({
    id: `${f.properties.dest_id}_${f.properties.osm_node_id}`,
    dest: f.properties.dest_id,
    lat: f.geometry.coordinates[1],
    lng: f.geometry.coordinates[0],
    entrance: f.properties.entrance,
    wheelchair: f.properties.wheelchair,
  }));

const destName = new Map(net.destinations.map((d) => [d.id, d.name]));

// --- Build the two sessions -------------------------------------------

// Sessions are split by AREA, not by core/alt tier. Splitting by tier looks
// tidier on paper but sends you to the far end of campus and back again for
// the second half; splitting by area means that while you are standing
// somewhere you finish everything there. The two areas happen not to
// overlap in latitude at all, so the boundary is unambiguous on the ground.
const nearestDest = (seg) => {
  const mid = seg.coords[Math.floor(seg.coords.length / 2)];
  const p = { lat: mid[1], lng: mid[0] };
  return net.destinations.reduce((best, d) => (haversine(p, d) < haversine(p, best) ? d : best));
};

const areas = [
  {
    key: "south",
    title: "Session 1 — Main Building, Hunterian Museum and James Watt (South)",
    destIds: ["main_building", "hunterian_museum", "james_watt_south"],
    startDest: "main_building",
    note:
      "The southern half of the study area, and the more important of the two: " +
      "it holds most of the core routes and the whole Hunterian access question. " +
      "If you only ever do one session, do this one.",
  },
  {
    key: "north",
    title: "Session 2 — University Library approach",
    destIds: ["university_library"],
    startDest: "university_library",
    note:
      "The northern half: the routes up to the Library. Fewer core segments, but " +
      "this is where the step-free alternatives to the direct routes live, so it " +
      "is not optional.",
  },
];

for (const area of areas) {
  const segs = net.segments.filter((s) => area.destIds.includes(nearestDest(s).id));
  area.ids = segs.map((s) => s.id);
  area.startNode = net.destinations.find((d) => d.id === area.startDest).nodeId;
  area.plan = planWalk(area.ids, area.startNode);
  area.coreCount = segs.filter((s) => s.tier === "core").length;
}

function renderSession(area) {
  const { title, plan, ids, note, coreCount } = area;
  const surveyM = ids.reduce((sum, id) => sum + segById.get(id).lengthM, 0);
  const own = entrances.filter((e) => area.destIds.includes(e.dest));
  const minutes = Math.round(
    ids.length * MINUTES_PER_SEGMENT +
      own.length * MINUTES_PER_ENTRANCE +
      (surveyM + plan.transitM) / WALKING_SPEED_M_PER_MIN
  );
  const lines = [];
  lines.push(`## ${title}`);
  lines.push("");
  lines.push(
    `**${ids.length} segments (${coreCount} core) · ${own.length} entrances · ` +
      `${Math.round(surveyM)} m to survey · ${plan.transitM} m of retracing · ` +
      `about ${Math.floor(minutes / 60)} h ${minutes % 60} min**`
  );
  lines.push("");
  lines.push(note);
  lines.push("");
  lines.push(
    `Start at **${destName.get(area.startDest)}**, junction \`${area.startNode}\`. ` +
      `Survey \`core\` rows first if you are short of time — they are the routes the app offers.`
  );
  lines.push("");

  let legNo = 0;
  for (const leg of plan.legs) {
    if (leg.transit) {
      lines.push(
        leg.offNetwork
          ? `> ⚠ **Walk about ${leg.metres} m** to junction \`${leg.to}\` — there is no ` +
            `surveyed path connecting these, so find your own way across (check the map).`
          : `> ↪ **Walk ${leg.metres} m** from junction \`${leg.from}\` to \`${leg.to}\` ` +
            `without surveying — either already done, or a dead end you have to come back out of.`
      );
      lines.push("");
      continue;
    }
    legNo++;
    lines.push(`### Leg ${legNo} — from junction \`${leg.start}\``);
    lines.push("");
    lines.push("| ✓ | Segment | Tier | Length | Type | Where it is | Watch for |");
    lines.push("| - | ------- | ---- | -----: | ---- | ----------- | --------- |");
    for (const step of leg.steps) {
      const s = segById.get(step.seg);
      const watch = [];
      if (s.highway === "steps") watch.push("**STEPS — count them, look for a ramp**");
      if (s.highway === "service") watch.push("shared with vehicles");
      if (s.highway === "pedestrian") watch.push("open space — measure the usable width");
      lines.push(
        `| ☐ | \`${step.seg}\` | ${s.tier} | ${s.lengthM} m | ${s.highway} | ` +
          `${whereIs(s)} | ${watch.join("; ") || "—"} |`
      );
    }
    lines.push("");
  }

  if (own.length) {
    lines.push(`### Entrances in this area (${own.length})`);
    lines.push("");
    lines.push("| ✓ | entrance_id | Building | OSM says | Coordinates |");
    lines.push("| - | ----------- | -------- | -------- | ----------- |");
    for (const e of own) {
      lines.push(
        `| ☐ | \`${e.id}\` | ${destName.get(e.dest)} | entrance=${e.entrance}` +
          `${e.wheelchair ? `, wheelchair=${e.wheelchair}` : ""} | ` +
          `${e.lat.toFixed(5)}, ${e.lng.toFixed(5)} |`
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

// --- Write the plan ----------------------------------------------------

const totalSegments = net.segments.length;
const totalTransit = areas.reduce((sum, a) => sum + a.plan.transitM, 0);
const totalMinutes = Math.round(
  totalSegments * MINUTES_PER_SEGMENT +
    entrances.length * MINUTES_PER_ENTRANCE +
    (net.segments.reduce((a, s) => a + s.lengthM, 0) + totalTransit) / WALKING_SPEED_M_PER_MIN
);

const doc = `# Field survey plan — Gilmorehill, four destinations

Generated from the current study area. Re-run \`npm run survey:plan\` if the
study area changes.

**Total: ${totalSegments} segments + ${entrances.length} entrances ≈ ${Math.floor(totalMinutes / 60)} h ${totalMinutes % 60} min of fieldwork.**
Split over two sessions below. Doing it in two halves is recommended — the
measurements get careless after about three hours.

---

## Before you go

**Equipment**

| Item | Why |
| ---- | --- |
| Tape measure, 5 m+ (or a laser measure) | \`width_m\`, \`door_width_m\` — the most important column |
| Phone with a spirit-level / inclinometer app | \`gradient_pct\`. iPhone: Measure app → Level. Android: any "bubble level" |
| Phone with \`survey/basemap.html\` open | segment ids and your GPS position |
| A way to fill in the CSV | see "recording" below |
| Camera (the phone) | photograph anything unusual; put the filename in \`notes\` |
| High-vis or just care | some segments are \`service\` roads shared with vehicles |

**Recording — pick one before you leave**

- *Easiest:* open \`segments.csv\` in Excel or Google Sheets on the phone and
  type straight into it. Keep the column order intact.
- *Most reliable in rain:* print this plan, tick the boxes and write values
  in the margin, then type it up the same evening. Memory for "was that 1.2
  or 1.4 m" fades fast.

**Timing** — go on a dry weekday in daylight. Wet cobbles and low sun change
what you record about surface and lighting, and you cannot judge \`lit\` at all
in the middle of the day, so leave that column for one evening pass.

---

## How to measure each column

| Column | How | Trap to avoid |
| ------ | --- | ------------- |
| \`step_free\` | Can a wheelchair get from one end to the other with no step at all? | A single 5 cm lip still means \`no\` |
| \`step_count\` | Count every step including the top and bottom | — |
| \`ramp\` | Is there a ramp *as an alternative to the steps*? | A ramp that ends in a step is not a ramp |
| \`handrail\` | Continuous rail on at least one side | — |
| \`gradient_pct\` | Phone level flat on the ground, steepest part; degrees × 1.75 ≈ percent | Measure the **steepest** part, not the average |
| \`surface\` | Material underfoot | — |
| \`surface_condition\` | \`good\` / \`uneven\` / \`poor\` — would small front castors catch? | — |
| \`width_m\` | Clear width at the **narrowest** point, between real obstructions | Bins, bollards, café tables and parked bikes all count as the edge |
| \`dropped_kerb\` | At crossings: \`flush\` (level), \`lowered\` (slight lip), \`raised\` (full kerb), \`none\` | — |
| \`tactile_paving\` | The bumpy paving at crossings | — |
| \`lit\` | Street lighting present — **judge after dark** | — |
| \`seating_nearby\` | A bench within about 10 m; matters for older users who need to rest | — |
| \`notes\` | Anything a number cannot capture, and photo filenames | — |

**The two that matter most are \`step_free\` and \`width_m\`.** The app treats a
segment as surveyed only when both are filled; until then it warns the user
that the route is unverified. If you are short of time, fill those two on
every segment rather than filling everything on half of them.

---

## Field task 0 — the Hunterian Museum question

Do this first, before any measuring.

The data says the Hunterian Museum's only mapped approach is a 10 m flight of
steps (\`s354\`), and both entrances OSM knows about are tagged
\`wheelchair=no\`. So: **how does a wheelchair user actually get into the
Hunterian Museum?**

Go to the Main Building east quadrangle and find out. Ask at the museum desk
or the Main Building reception — staff will know, and it is faster than
hunting. Then record what you find:

- If there is an accessible entrance and a lift → add a row to
  \`entrances.csv\` with its coordinates, \`accessible=yes\`, and the lift
  described in \`notes\`. This becomes the museum's handover point.
- If there genuinely is no step-free access → record that too. A documented
  absence is a finding, and it is the strongest argument in your dissertation
  for why this work matters.

Either way, note the answer and who told you.

---

${areas.map(renderSession).join("\n---\n\n")}
---

## What to record at every entrance

Is it step-free; how many steps if not; is there a ramp; the door type
(automatic / manual / heavy / revolving) and its clear width; and —
importantly — \`indoor_handover_id\`, the shared code you and the indoor team
agree on so the two systems hand over at the same door.

Record the ones that turn out to be unusable too. "This door is not
accessible" is data, and it is half of what the app needs in order to be
honest with a wheelchair user.

---

## When you get back

\`\`\`bash
npm run survey:import     # folds your CSV into the app's network
npm run dev               # the app now routes on your measurements
\`\`\`

Then commit the filled CSVs to git — they are the irreplaceable part of this
repository. Everything else can be regenerated; a walk across campus cannot.

Partial data is fine and expected. The app reports how much of each route has
been verified and draws the rest dashed, so you can survey in passes and
watch the coverage climb.
`;

writeFileSync(join(DIR, "field-plan.md"), doc);

// --- Printable field sheet --------------------------------------------

// Paper beats a phone in the field: it works in rain and low sun, needs no
// battery, and you can write on it while holding a tape measure. The sheet
// follows the same walking order as the plan, so you never have to search
// for the row you are standing on.
function fieldSheetHtml() {
  const cell = (n = 1) => `<td class="w"${n > 1 ? ` colspan="${n}"` : ""}></td>`;

  const sections = areas
    .map((area) => {
      const rows = [];
      let legNo = 0;
      for (const leg of area.plan.legs) {
        if (leg.transit) {
          rows.push(
            `<tr class="transit"><td colspan="17">${leg.offNetwork ? "⚠ no surveyed path — find your own way, about" : "↪ walk"} ` +
              `${leg.metres} m to junction ${leg.to} — nothing to record</td></tr>`
          );
          continue;
        }
        legNo++;
        rows.push(
          `<tr class="leg"><td colspan="17">Leg ${legNo} — from junction ${leg.start}</td></tr>`
        );
        for (const step of leg.steps) {
          const s = segById.get(step.seg);
          const steps = s.highway === "steps" ? " steps" : "";
          rows.push(
            `<tr>` +
              `<td class="id">${step.seg}</td>` +
              `<td class="sm">${s.tier}</td>` +
              `<td class="sm">${s.lengthM}</td>` +
              `<td class="sm">${s.highway}${steps ? " ⚠" : ""}</td>` +
              cell() + // step_free
              cell() + // step_count
              cell() + // ramp
              cell() + // handrail
              cell() + // gradient
              cell() + // surface
              cell() + // condition
              cell() + // width
              cell() + // kerb
              cell() + // tactile
              cell() + // lit
              cell() + // seating
              cell() + // notes
              `</tr>`
          );
        }
      }

      const own = entrances.filter((e) => area.destIds.includes(e.dest));
      const entRows = own
        .map(
          (e) =>
            `<tr><td class="id" colspan="2">${e.id.replace(/^[a-z_]+_/, "…")}</td>` +
            `<td class="sm" colspan="2">${destName.get(e.dest)}</td>` +
            cell() + cell() + cell() + cell() + cell() + cell(2) + cell(2) + cell(3) + `</tr>`
        )
        .join("");

      return `
<h2>${area.title}</h2>
<p class="meta">${area.ids.length} segments · ${own.length} entrances · start at junction ${area.startNode}</p>
<table>
<thead>
<tr>
  <th rowspan="2">Segment</th><th rowspan="2">tier</th><th rowspan="2">m</th><th rowspan="2">type</th>
  <th colspan="5">steps &amp; slope</th><th colspan="3">surface</th><th colspan="4">crossing / comfort</th><th rowspan="2">notes<br><span class="hint">photo file, anything odd</span></th>
</tr>
<tr>
  <th>step<br>free</th><th>step<br>count</th><th>ramp</th><th>hand<br>rail</th><th>grad<br>%</th>
  <th>surface</th><th>cond</th><th>width<br>m</th>
  <th>kerb</th><th>tact</th><th>lit</th><th>seat</th>
</tr>
</thead>
<tbody>${rows.join("")}</tbody>
</table>

<h3>Entrances — ${area.destIds.map((d) => destName.get(d)).join(", ")}</h3>
<table>
<thead><tr>
  <th colspan="2">entrance_id</th><th colspan="2">building</th>
  <th>access<br>ible</th><th>step<br>free</th><th>step<br>count</th><th>ramp</th><th>door<br>type</th>
  <th colspan="2">door width m</th><th colspan="2">indoor_handover_id</th><th colspan="3">notes</th>
</tr></thead>
<tbody>${entRows}</tbody>
</table>
`;
    })
    .join('<div class="pagebreak"></div>');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/>
<title>Gilmorehill field sheet</title>
<style>
  @page { size: A4 landscape; margin: 8mm; }
  body { font: 9px/1.25 system-ui, sans-serif; color: #000; margin: 0; }
  h1 { font-size: 15px; margin: 0 0 2px; }
  h2 { font-size: 12px; margin: 10px 0 2px; }
  h3 { font-size: 11px; margin: 8px 0 2px; }
  p.meta, p.legend { margin: 0 0 4px; font-size: 9px; color: #333; }
  p.legend b { color: #000; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 4px; }
  th, td { border: 0.5px solid #888; padding: 1px 2px; text-align: center; }
  th { background: #eee; font-size: 8px; font-weight: 600; line-height: 1.1; }
  .hint { font-weight: 400; font-size: 7px; color: #555; }
  td.w { height: 9mm; }           /* room to write */
  td.id { font-weight: 700; font-size: 9.5px; white-space: nowrap; }
  td.sm { font-size: 8px; color: #333; }
  tr.leg td { background: #dde6ee; text-align: left; font-weight: 700; padding: 2px 4px; }
  tr.transit td { background: #f4f4f4; text-align: left; color: #555; font-style: italic; }
  .pagebreak { page-break-after: always; }
  @media screen { body { max-width: 1100px; margin: 16px auto; padding: 0 12px; } }
</style></head><body>

<h1>Gilmorehill field sheet — four destinations</h1>
<p class="legend">
<b>step free / ramp / hand rail / tact / lit / seat:</b> Y or N &nbsp;·&nbsp;
<b>surface:</b> A=asphalt, P=paving_stones, C=concrete, G=gravel, R=grass, K=cobbles, O=other &nbsp;·&nbsp;
<b>cond:</b> G=good, U=uneven, P=poor &nbsp;·&nbsp;
<b>kerb:</b> F=flush, L=lowered, R=raised, N=none &nbsp;·&nbsp;
<b>door type</b> (entrances): A=automatic, M=manual, H=heavy, R=revolving &nbsp;·&nbsp;
<b>grad %:</b> phone level, steepest point, degrees × 1.75 &nbsp;·&nbsp;
<b>width:</b> metres, at the NARROWEST point &nbsp;·&nbsp;
⚠ = steps, count them and look for a ramp
</p>
<p class="legend">The single letters above are understood by <code>npm run survey:check -- --fix</code>,
which expands them for you — the same letter is read differently in each column, so G in
<b>cond</b> is good while G in <b>surface</b> is gravel.
Leave a cell blank if you did not check it: blank means "unknown", which is honest.
Do not guess. <b>step free and width are the two that matter most.</b></p>

${sections}
</body></html>
`;
}

writeFileSync(join(DIR, "field-sheet.html"), fieldSheetHtml());

console.log("=== Field plan ===");
for (const a of areas) {
  const own = entrances.filter((e) => a.destIds.includes(e.dest)).length;
  console.log(
    `  ${a.key.padEnd(6)} ${String(a.ids.length).padStart(2)} segments ` +
      `(${a.coreCount} core), ${String(own).padStart(2)} entrances, ` +
      `${a.plan.transitM} m retracing`
  );
}
console.log(`  total  ${totalSegments} segments, ${entrances.length} entrances`);
console.log(`  estimated fieldwork: ${Math.floor(totalMinutes / 60)} h ${totalMinutes % 60} min`);
console.log("\nWrote survey/field-plan.md   (read this first)");
console.log("Wrote survey/field-sheet.html (open in a browser, Ctrl+P, print landscape)");
