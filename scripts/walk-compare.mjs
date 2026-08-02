// Does splitting the survey by area really beat splitting it by tier?
//
// The claim that it does is quoted in the write-up, so it is computed here
// rather than estimated — and it imports planWalk from field-plan.mjs, so the
// comparison uses exactly the algorithm that produced the real itinerary.
//
// Usage:  node scripts/walk-compare.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { planWalk } from "./field-plan.mjs";
import { haversine } from "./study-area.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const net = JSON.parse(readFileSync(join(__dirname, "..", "src", "data", "campusNetwork.json"), "utf8"));

const nearestDest = (seg) => {
  const mid = seg.coords[Math.floor(seg.coords.length / 2)];
  const p = { lat: mid[1], lng: mid[0] };
  return net.destinations.reduce((best, d) => (haversine(p, d) < haversine(p, best) ? d : best));
};

const nodeOf = (id) => net.destinations.find((d) => d.id === id).nodeId;
const totalLen = net.segments.reduce((a, s) => a + s.lengthM, 0);

// A: by area — south (Main, Hunterian, James Watt) then north (Library)
const south = net.segments.filter((s) => nearestDest(s).id !== "university_library").map((s) => s.id);
const north = net.segments.filter((s) => nearestDest(s).id === "university_library").map((s) => s.id);
const a1 = planWalk(south, nodeOf("main_building"));
const a2 = planWalk(north, nodeOf("university_library"));

// B: by tier — core first, then everything else
const core = net.segments.filter((s) => s.tier === "core").map((s) => s.id);
const rest = net.segments.filter((s) => s.tier !== "core").map((s) => s.id);
const b1 = planWalk(core, nodeOf("main_building"));
const b2 = planWalk(rest, nodeOf("main_building"));

// C: one continuous pass over everything
const c1 = planWalk(net.segments.map((s) => s.id), nodeOf("main_building"));

const row = (name, parts, sessions) =>
  console.log(
    `  ${name.padEnd(34)} ${String(parts.reduce((a, p) => a + p.transitM, 0)).padStart(5)} m` +
      `   (${sessions})`
  );

console.log(`Survey network: ${net.segments.length} segments, ${Math.round(totalLen)} m to walk\n`);
console.log("Retracing required, by how the work is divided:");
row("A. by area (south, north)", [a1, a2], `${south.length} + ${north.length} segments`);
row("B. by tier (core, then the rest)", [b1, b2], `${core.length} + ${rest.length} segments`);
row("C. one continuous pass", [c1], `${net.segments.length} segments`);

const A = a1.transitM + a2.transitM;
const B = b1.transitM + b2.transitM;
console.log(
  `\nSplitting by area saves ${B - A} m of retracing against splitting by tier ` +
    `(${A} m vs ${B} m, ${Math.round((100 * (B - A)) / B)}% less).`
);
