import type { GraphEdge, Route } from "./pathfinding";
import { assess, type RouteProfile } from "./accessibility";

// Turn-by-turn guidance.
//
// A route drawn on a map is of no use to someone who cannot see it, and of
// limited use to anyone actually walking. This turns the geometry into
// instructions, and — the part that matters for this project — folds the
// surveyed accessibility attributes into them. "In twenty metres, twenty
// steps up, handrail on your left" is the sentence the survey was collected
// to make possible.

export type Manoeuvre =
  | "start"
  | "straight"
  | "slight-left"
  | "left"
  | "sharp-left"
  | "slight-right"
  | "right"
  | "sharp-right"
  | "turn-around"
  | "arrive";

export interface GuidanceStep {
  /** Where the instruction takes effect. */
  at: { lat: number; lng: number };
  /** Metres from the start of the route to this point. */
  distanceFromStartM: number;
  /** Metres of travel this instruction covers. */
  lengthM: number;
  manoeuvre: Manoeuvre;
  /** One line, written to be read aloud. */
  text: string;
  /** What the survey says about the stretch that follows. */
  notes: string[];
}

const TO_RAD = Math.PI / 180;
const TO_DEG = 180 / Math.PI;

/** Compass bearing in degrees from a to b. */
function bearing(a: LatLng, b: LatLng): number {
  const y = Math.sin((b.lng - a.lng) * TO_RAD) * Math.cos(b.lat * TO_RAD);
  const x =
    Math.cos(a.lat * TO_RAD) * Math.sin(b.lat * TO_RAD) -
    Math.sin(a.lat * TO_RAD) * Math.cos(b.lat * TO_RAD) * Math.cos((b.lng - a.lng) * TO_RAD);
  return (Math.atan2(y, x) * TO_DEG + 360) % 360;
}

export interface LatLng {
  lat: number;
  lng: number;
}

/** Metres between two points. */
export function metresBetween(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const dLat = (b.lat - a.lat) * TO_RAD;
  const dLng = (b.lng - a.lng) * TO_RAD;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * TO_RAD) * Math.cos(b.lat * TO_RAD) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Classify the change of direction between two bearings. */
function manoeuvreFor(from: number, to: number): Manoeuvre {
  let delta = ((to - from + 540) % 360) - 180; // -180..180, right positive
  if (Math.abs(delta) >= 150) return "turn-around";
  if (Math.abs(delta) < 20) return "straight";
  if (delta > 0) return delta < 55 ? "slight-right" : delta < 120 ? "right" : "sharp-right";
  delta = -delta;
  return delta < 55 ? "slight-left" : delta < 120 ? "left" : "sharp-left";
}

const PHRASE: Record<Manoeuvre, string> = {
  start: "Set off",
  straight: "Continue straight",
  "slight-left": "Bear left",
  left: "Turn left",
  "sharp-left": "Turn sharply left",
  "slight-right": "Bear right",
  right: "Turn right",
  "sharp-right": "Turn sharply right",
  "turn-around": "Turn around",
  arrive: "Arrive",
};

/**
 * Orient an edge so its coordinates run in the direction of travel.
 * Edges are undirected in the graph, so half of them come back reversed.
 */
function orientedCoords(edge: GraphEdge, fromNodeId: string): LatLng[] {
  const pts = edge.coords.map(([lng, lat]) => ({ lat, lng }));
  return edge.from === fromNodeId ? pts : pts.reverse();
}

/**
 * Things worth saying out loud about a stretch of path, drawn from the
 * survey. Only what a traveller can act on — the width of a path they are
 * already committed to is not news, but steps ahead are.
 */
function notesFor(edge: GraphEdge, profile: RouteProfile): string[] {
  const s = edge.survey;
  const out: string[] = [];

  if (s.stepFree === false || (s.stepFree === null && edge.highway === "steps")) {
    const count = s.stepCount != null ? `${s.stepCount} steps` : "steps";
    const rail =
      s.handrail === true ? ", with a handrail" : s.handrail === false ? ", no handrail" : "";
    out.push(`${count}${rail}`);
  }
  if (s.gradientPct != null && Math.abs(s.gradientPct) >= 5) {
    out.push(`a slope of ${Math.abs(s.gradientPct)} percent`);
  }
  if (s.surfaceCondition === "poor" || s.surfaceCondition === "uneven") {
    out.push(`${s.surfaceCondition} surface`);
  }
  if (profile === "lowVision" && s.tactilePaving === false) out.push("no tactile paving");
  if (s.seatingNearby === true) out.push("a place to rest");
  if (!assess(edge, profile).verified) out.push("this stretch has not been surveyed");

  return out;
}

/**
 * Build the instruction list for a route.
 *
 * Consecutive edges that continue in the same direction are merged, so the
 * traveller hears "continue straight for eighty metres" rather than one
 * instruction per surveyed segment — the segments are an artefact of how
 * OpenStreetMap splits ways, not something anyone walking would notice.
 */
export function buildGuidance(
  route: Route,
  destinationName: string,
  profile: RouteProfile = "wheelchair"
): GuidanceStep[] {
  if (route.edges.length === 0) return [];

  // Flatten the route into a single oriented polyline, remembering which
  // edge each leg came from so its survey notes travel with it.
  const legs: { a: LatLng; b: LatLng; edge: GraphEdge }[] = [];
  route.edges.forEach((edge, i) => {
    const pts = orientedCoords(edge, route.nodeIds[i]);
    for (let k = 1; k < pts.length; k++) legs.push({ a: pts[k - 1], b: pts[k], edge });
  });
  if (legs.length === 0) return [];

  const steps: GuidanceStep[] = [];
  let travelled = 0;
  let currentBearing = bearing(legs[0].a, legs[0].b);
  let stepStart = 0;
  let stepManoeuvre: Manoeuvre = "start";
  let stepAt = legs[0].a;
  const stepEdges = new Set<GraphEdge>([legs[0].edge]);

  const flush = (endDistance: number, next: Manoeuvre | null, nextAt: LatLng) => {
    const notes = [...new Set([...stepEdges].flatMap((e) => notesFor(e, profile)))];
    const length = endDistance - stepStart;
    steps.push({
      at: stepAt,
      distanceFromStartM: Math.round(stepStart),
      lengthM: Math.round(length),
      manoeuvre: stepManoeuvre,
      text:
        stepManoeuvre === "start"
          ? `Set off and continue for ${Math.round(length)} metres`
          : `${PHRASE[stepManoeuvre]}, then continue for ${Math.round(length)} metres`,
      notes,
    });
    if (next) {
      stepStart = endDistance;
      stepManoeuvre = next;
      stepAt = nextAt;
      stepEdges.clear();
    }
  };

  for (let i = 1; i < legs.length; i++) {
    const b = bearing(legs[i].a, legs[i].b);
    const m = manoeuvreFor(currentBearing, b);
    // A very short leg is usually a kink in the mapped geometry rather than a
    // real corner, so only a genuine change of direction starts a new step.
    const legLength = metresBetween(legs[i].a, legs[i].b);
    if (m !== "straight" && legLength > 3) {
      flush(travelled + metresBetween(legs[i - 1].a, legs[i - 1].b), m, legs[i].a);
    }
    travelled += metresBetween(legs[i - 1].a, legs[i - 1].b);
    currentBearing = b;
    stepEdges.add(legs[i].edge);
  }
  travelled += metresBetween(legs[legs.length - 1].a, legs[legs.length - 1].b);
  flush(travelled, null, legs[legs.length - 1].b);

  steps.push({
    at: legs[legs.length - 1].b,
    distanceFromStartM: Math.round(travelled),
    lengthM: 0,
    manoeuvre: "arrive",
    text: `Arrive at ${destinationName}`,
    notes: [],
  });

  return steps;
}

/** Perpendicular distance in metres from p to the segment a–b, and how far along it falls. */
function projectOnLeg(p: LatLng, a: LatLng, b: LatLng) {
  const mPerLat = 111320;
  const mPerLng = 111320 * Math.cos(p.lat * TO_RAD);
  const px = (p.lng - a.lng) * mPerLng;
  const py = (p.lat - a.lat) * mPerLat;
  const bx = (b.lng - a.lng) * mPerLng;
  const by = (b.lat - a.lat) * mPerLat;
  const lenSq = bx * bx + by * by;
  if (lenSq === 0) return { offRouteM: Math.hypot(px, py), alongM: 0 };
  const t = Math.max(0, Math.min(1, (px * bx + py * by) / lenSq));
  return {
    offRouteM: Math.hypot(px - t * bx, py - t * by),
    alongM: t * Math.sqrt(lenSq),
  };
}

export interface RouteProgress {
  /** Index into the guidance list of the instruction now in force. */
  stepIndex: number;
  /** Metres travelled along the route. */
  alongM: number;
  /** Metres from the route — large means the traveller has strayed. */
  offRouteM: number;
  /** Metres until the next instruction. */
  toNextM: number;
  /** Metres remaining to the destination. */
  remainingM: number;
}

/**
 * Where on the route a position falls.
 *
 * Returns null when the route has no geometry. `offRouteM` is reported
 * rather than acted on: GPS between tall sandstone buildings drifts by tens
 * of metres, so the caller decides how much to trust it — announcing "you
 * have left the route" at every wobble would be worse than silence.
 */
export function locateOnRoute(
  route: Route,
  steps: GuidanceStep[],
  position: LatLng
): RouteProgress | null {
  if (route.edges.length === 0 || steps.length === 0) return null;

  const legs: { a: LatLng; b: LatLng }[] = [];
  route.edges.forEach((edge, i) => {
    const pts = orientedCoords(edge, route.nodeIds[i]);
    for (let k = 1; k < pts.length; k++) legs.push({ a: pts[k - 1], b: pts[k] });
  });

  let best = { offRouteM: Infinity, alongM: 0 };
  let cumulative = 0;
  for (const leg of legs) {
    const legLength = metresBetween(leg.a, leg.b);
    const { offRouteM, alongM } = projectOnLeg(position, leg.a, leg.b);
    if (offRouteM < best.offRouteM) best = { offRouteM, alongM: cumulative + alongM };
    cumulative += legLength;
  }

  const total = cumulative;
  // The instruction in force is the last one whose point has been passed.
  let stepIndex = 0;
  for (let i = 0; i < steps.length; i++) {
    if (steps[i].distanceFromStartM <= best.alongM + 1) stepIndex = i;
  }
  const next = steps[Math.min(stepIndex + 1, steps.length - 1)];

  return {
    stepIndex,
    alongM: Math.round(best.alongM),
    offRouteM: Math.round(best.offRouteM),
    toNextM: Math.max(0, Math.round(next.distanceFromStartM - best.alongM)),
    remainingM: Math.max(0, Math.round(total - best.alongM)),
  };
}

/** The sentence to speak for a step, including what the survey found. */
export function spokenFor(step: GuidanceStep): string {
  return step.notes.length ? `${step.text}. Ahead: ${step.notes.join(", ")}.` : `${step.text}.`;
}
