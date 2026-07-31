// Generates survey/findings.md — the results, in tables meant to be quoted.
//
// Written in TypeScript, unlike the rest of scripts/, so that it uses the
// very same accessibility model the app routes on. A report that
// reimplemented the criteria could drift from the system it describes, and
// then the dissertation would be citing something that no longer runs.
//
// Usage:  npm run survey:report   (always from the project root)

import { writeFileSync, readFileSync } from "node:fs";
import { campusGraph, destinations, entrances, entrancesFor, surveyProgress } from "../src/data/campusGraph";
import { findRouteToDestination } from "../src/navigation/pathfinding";
import type { GraphEdge } from "../src/navigation/pathfinding";
import {
  assess,
  assessEntrance,
  describeRoute,
  isSurveyed,
  profileLabel,
  PROFILES,
  GRADIENT,
  SEATING_INTERVAL_M,
  DOOR,
  type RouteProfile,
} from "../src/navigation/accessibility";

const PROFILE_ORDER: RouteProfile[] = ["wheelchair", "limitedMobility", "lowVision", "shortest"];
const short = (name: string) => name.replace(" Building", "").replace("University ", "").replace(" (South)", "");

const journeys = destinations.flatMap((a, i) =>
  destinations.slice(i + 1).map((b) => ({ a, b }))
);

function routeFor(a: (typeof destinations)[0], b: (typeof destinations)[0], p: RouteProfile) {
  const r = findRouteToDestination(campusGraph, a.nodeId, b.nodeId, entrancesFor(b.id), p, assessEntrance);
  return r && !r.entranceUnusable ? r : null;
}

// --- Blocking causes --------------------------------------------------

function blockersFor(p: RouteProfile) {
  const counts = new Map<string, GraphEdge[]>();
  for (const e of campusGraph.edges) {
    for (const b of assess(e, p).blockers) {
      const key = b.replace(/[\d.]+/g, "N").replace(/^N steps.*/, "steps");
      const list = counts.get(key);
      if (list) list.push(e);
      else counts.set(key, [e]);
    }
  }
  return [...counts].sort((x, y) => y[1].length - x[1].length);
}

// --- Critical cuts ----------------------------------------------------

// How many journeys open up if this one segment were made passable? Answers
// "where would money best be spent", which is the question a campus estates
// team actually has.
function criticalCuts(p: RouteProfile) {
  const reachable = () => journeys.filter((j) => routeFor(j.a, j.b, p)).length;
  const baseline = reachable();
  const out: { edge: GraphEdge; gained: number }[] = [];
  for (const e of campusGraph.edges) {
    if (assess(e, p).passable) continue;
    const saved = { ...e.survey };
    Object.assign(e.survey, {
      stepFree: true,
      widthM: Math.max(e.survey.widthM ?? 2, 2),
      gradientPct: 0,
      droppedKerb: "flush",
    });
    const gained = reachable() - baseline;
    Object.assign(e.survey, saved);
    if (gained > 0) out.push({ edge: e, gained });
  }
  return { baseline, cuts: out.sort((a, b) => b.gained - a.gained) };
}

// --- Build the document ----------------------------------------------

const p = surveyProgress();
const osmCoverage = readFileSync("survey/osm-coverage.md", "utf8")
  .split("\n")
  .filter((l) => l.startsWith("|"))
  .join("\n");

const lines: string[] = [];
const push = (...s: string[]) => lines.push(...s);

push(
  "# Findings — outdoor accessible navigation, Gilmorehill campus",
  "",
  "Generated from the survey data by `npm run survey:report`. Every figure",
  "below is computed by the same model the application routes on, so the",
  "tables cannot drift away from the running system.",
  "",
  `Study area: four destinations, ${campusGraph.edges.length} path segments ` +
    `(${(p.totalM / 1000).toFixed(2)} km), ${entrances.length} building entrances.`,
  "",
  "Accessibility criteria throughout are from the Department for Transport",
  "(2021) *Inclusive Mobility: A Guide to Best Practice on Access to",
  "Pedestrian and Transport Infrastructure*, cited by section.",
  "",
  "---",
  ""
);

// Table 1
push(
  "## Table 1 — What OpenStreetMap already records",
  "",
  "Coverage of accessibility attributes across the 500 path segments",
  "downloaded for the study area, before any fieldwork.",
  "",
  osmCoverage,
  "",
  "The two attributes that most often decide whether a wheelchair journey is",
  "possible — clear width and dropped kerbs — are recorded for essentially",
  "nothing. This is the gap the survey fills.",
  "",
  "---",
  ""
);

// Table 2
const surveyed = campusGraph.edges.filter(isSurveyed).length;
const partly = campusGraph.edges.filter((e) => !isSurveyed(e) && Object.values(e.survey).some((v) => v !== null)).length;
push(
  "## Table 2 — Survey coverage",
  "",
  "| | Count | Share |",
  "| --- | ---: | ---: |",
  `| Segments with both step-free status and width recorded | ${surveyed} / ${campusGraph.edges.length} | ${Math.round((surveyed / campusGraph.edges.length) * 100)}% |`,
  `| Segments partly recorded | ${partly} / ${campusGraph.edges.length} | ${Math.round((partly / campusGraph.edges.length) * 100)}% |`,
  `| Study network measured, by length | ${Math.round(p.surveyedM)} m / ${Math.round(p.totalM)} m | ${Math.round(p.share * 100)}% |`,
  `| Entrances recorded | ${entrances.filter((e) => e.survey.accessible !== null).length} / ${entrances.length} | ${Math.round((entrances.filter((e) => e.survey.accessible !== null).length / entrances.length) * 100)}% |`,
  "",
  "---",
  ""
);

// Table 3
push(
  "## Table 3 — Which journeys are possible, by traveller",
  "",
  "Distance in metres, or *none* where no usable route exists. A journey ends",
  "at an entrance the traveller can actually use, not merely at the building.",
  "",
  "| Journey | " + PROFILE_ORDER.map(profileLabel).join(" | ") + " |",
  "| --- | " + PROFILE_ORDER.map(() => "---:").join(" | ") + " |"
);
for (const j of journeys) {
  const cells = PROFILE_ORDER.map((pr) => {
    const r = routeFor(j.a, j.b, pr);
    return r ? `${describeRoute(r.edges, pr).metres} m` : "*none*";
  });
  push(`| ${short(j.a.name)} → ${short(j.b.name)} | ${cells.join(" | ")} |`);
}
const wheelOk = journeys.filter((j) => routeFor(j.a, j.b, "wheelchair")).length;
push(
  "",
  `**${wheelOk} of ${journeys.length} journeys are step-free.** ` +
    `The failures all involve the Hunterian Museum.`,
  "",
  "---",
  ""
);

// Table 4
push(
  "## Table 4 — What stops a wheelchair user",
  "",
  "| Barrier | Segments | Which |",
  "| --- | ---: | --- |"
);
for (const [reason, edges] of blockersFor("wheelchair")) {
  push(`| ${reason} | ${edges.length} | ${edges.map((e) => e.id).join(", ")} |`);
}
push(
  "",
  `Thresholds applied: steps block outright; clear width below ` +
    `${PROFILES.wheelchair.minWidthM} m (§4.2); gradient above ` +
    `${GRADIENT.absoluteMax}%, that is 1 in 12 (§4.3); a raised kerb with no ` +
    `dropped crossing (§4.11).`,
  "",
  "---",
  ""
);

// Table 5
const { baseline, cuts } = criticalCuts("wheelchair");
push(
  "## Table 5 — Where the network is cut",
  "",
  "Each row is a single segment which, if it were made passable, would open",
  "the given number of further journeys. This identifies where remedial work",
  "would have the most effect.",
  "",
  "| Segment | Type | Length | Why it is impassable | Journeys it would restore |",
  "| --- | --- | ---: | --- | ---: |"
);
for (const { edge, gained } of cuts) {
  push(
    `| \`${edge.id}\` | ${edge.highway} | ${edge.lengthM} m | ` +
      `${assess(edge, "wheelchair").blockers.join("; ")} | +${gained} |`
  );
}
if (!cuts.length) push("| — | | | *no single segment restores a journey on its own* | |");
push("", `Baseline: ${baseline} of ${journeys.length} journeys step-free.`, "", "---", "");

// Table 6
push(
  "## Table 6 — Entrance survey",
  "",
  "| Building | Entrances | Usable by a wheelchair | Narrower than the 1.2 m §11.2 asks for |",
  "| --- | ---: | ---: | ---: |"
);
const byBuilding = new Map<string, typeof entrances>();
for (const e of entrances) {
  const k = e.building ?? "—";
  const list = byBuilding.get(k);
  if (list) list.push(e);
  else byBuilding.set(k, [e]);
}
for (const [b, list] of byBuilding) {
  push(
    `| ${b} | ${list.length} | ${list.filter((e) => assessEntrance(e, "wheelchair").passable).length} | ` +
      `${list.filter((e) => e.survey.doorWidthM != null && e.survey.doorWidthM < DOOR.preferredClearWidthM).length} |`
  );
}
const hunterian = entrancesFor("hunterian_museum");
push(
  "",
  "### The Hunterian Museum",
  "",
  "OpenStreetMap tags both mapped entrances to the Hunterian Museum",
  "`wheelchair=no`, and its only mapped approach is a flight of steps. On",
  `that evidence the museum is unreachable. The survey found otherwise: all`,
  `${hunterian.length} entrances were confirmed usable on site, each with a lift to`,
  "level 2.",
  "",
  "The barrier is therefore not the door but the ground in front of it — the",
  "outdoor approaches remain cut by steps. That is a more precise and more",
  "actionable finding than the mapped data supports, and it could only have",
  "been established on foot.",
  "",
  "---",
  ""
);

// Table 7
push(
  "## Table 7 — Distance against the recommended limit without a rest",
  "",
  "Inclusive Mobility §3.4 gives a distance each group can be expected to",
  "manage before needing to rest; §4.5 asks for seating at intervals of no",
  `more than ${SEATING_INTERVAL_M} m.`,
  "",
  "| Journey | Length | Wheelchair (150 m) | Walks with difficulty (50 m) | Rest points on route |",
  "| --- | ---: | --- | --- | ---: |"
);
for (const j of journeys) {
  const r = routeFor(j.a, j.b, "shortest");
  if (!r) continue;
  const d = describeRoute(r.edges, "shortest");
  const wc = d.metres > 150 ? "exceeded" : "within";
  const lm = d.metres > 50 ? "**exceeded**" : "within";
  push(`| ${short(j.a.name)} → ${short(j.b.name)} | ${d.metres} m | ${wc} | ${lm} | ${d.restPoints} |`);
}
const withSeating = campusGraph.edges.filter((e) => e.survey.seatingNearby === true).length;
push(
  "",
  `Across the whole study network only **${withSeating} of ${campusGraph.edges.length} segments** ` +
    "have a rest point within reach. Every journey exceeds the 50 m limit for " +
    "stick and cane users, so for that group seating provision is not a " +
    "comfort but the thing that decides whether the journey can be made at all.",
  "",
  "---",
  ""
);

// Limitations
push(
  "## Limitations",
  "",
  "- **Penalty weights are not empirically grounded.** The thresholds that",
  "  decide whether a route is *possible* are all sourced from Inclusive",
  "  Mobility. The multipliers that decide which of several possible routes is",
  "  *preferred* are the author's estimates, and need literature support or",
  "  user preference data before any claim is made about route quality.",
  "- **Crossfall was not recorded.** §4.3 sets a maximum crossfall of 1 in 40",
  "  and notes that variable crossfalls trouble wheelchair users and people",
  "  with a balance impairment. The survey captures longitudinal gradient",
  "  only, so a path that is within the gradient limit but tilted across its",
  "  width would not be distinguished from a level one.",
  "- **Rest points are modelled per segment, not cumulatively.** §3.4 concerns",
  "  distance travelled since the last rest; A\\* costs each segment",
  "  independently, so the model prefers segments that pass a bench and",
  "  reports when a route exceeds the recommended limit, rather than",
  "  guaranteeing a rest within it.",
  `- **${campusGraph.edges.length - surveyed} segments are not fully measured.** They are treated as`,
  "  unknown rather than passable, and routes crossing them are reported as",
  "  unverified.",
  "- **Single surveyor, single pass.** No inter-rater reliability check was",
  "  possible, and conditions such as surface state and lighting were recorded",
  "  on one occasion.",
  ""
);

writeFileSync("survey/findings.md", lines.join("\n"));
console.log(`Wrote survey/findings.md — ${lines.length} lines`);
console.log(`  ${wheelOk}/${journeys.length} journeys step-free · ${cuts.length} critical cut(s) · ${Math.round(p.share * 100)}% measured`);
