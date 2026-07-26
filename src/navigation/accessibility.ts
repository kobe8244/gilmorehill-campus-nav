import type { GraphEdge, SurveyAttributes } from "./pathfinding";

// Accessibility judgement, kept separate from the search algorithm so that
// the criteria can be defended (and cited) independently of the code that
// applies them.
//
// IMPORTANT — these figures are working values taken from the commonly
// quoted summaries of the standards below. Confirm each against the primary
// source before quoting it in the dissertation:
//   • BS 8300-1:2018 — design of an accessible external environment
//     (available through the University Library's BSOL subscription)
//   • Inclusive Mobility (UK Department for Transport) — free PDF
export const THRESHOLDS = {
  /** Below this a wheelchair cannot pass at all. */
  minWidthM: 1.0,
  /** Below this there is no room for two people to pass each other. */
  comfortWidthM: 1.5,
  /** Beyond this a self-propelled wheelchair cannot manage the slope. */
  maxGradientPct: 8,
  /** Roughly 1:20 — the gradient ramps are designed to. */
  comfortGradientPct: 5,
  /** Surfaces that are hard going even when in good condition. */
  difficultSurfaces: ["gravel", "grass", "cobbles", "sett"],
};

export interface Assessment {
  /** False when something makes the segment impassable in a wheelchair. */
  passable: boolean;
  /** True once the segment has actually been surveyed on the ground. */
  verified: boolean;
  /** Reasons the segment is impassable. */
  blockers: string[];
  /** Usable, but with a difficulty worth telling the user about. */
  warnings: string[];
}

// Judge one path segment against the thresholds above.
//
// The three-state logic matters more than the thresholds themselves: a
// segment nobody has surveyed is "unverified", never "fine". Telling a
// wheelchair user a path is passable when no one has checked is the exact
// failure this project exists to prevent.
export function assess(edge: GraphEdge): Assessment {
  const s: SurveyAttributes = edge.survey;
  const blockers: string[] = [];
  const warnings: string[] = [];

  // OSM's `highway=steps` is reliable even before fieldwork, so steps block
  // a route whether or not the segment has been surveyed.
  const hasSteps = s.stepFree === false || (s.stepFree === null && edge.highway === "steps");
  if (hasSteps) {
    const count = s.stepCount != null ? `${s.stepCount} steps` : "steps";
    blockers.push(s.ramp === true ? `${count} (a ramp is present — check it)` : count);
  }

  if (s.widthM != null) {
    if (s.widthM < THRESHOLDS.minWidthM) {
      blockers.push(`only ${s.widthM} m wide`);
    } else if (s.widthM < THRESHOLDS.comfortWidthM) {
      warnings.push(`narrow (${s.widthM} m — no passing room)`);
    }
  }

  if (s.gradientPct != null) {
    const g = Math.abs(s.gradientPct);
    if (g > THRESHOLDS.maxGradientPct) {
      blockers.push(`too steep (${g}%)`);
    } else if (g > THRESHOLDS.comfortGradientPct) {
      warnings.push(`steep (${g}%)`);
    }
  }

  if (s.surfaceCondition === "poor") warnings.push("surface in poor condition");
  else if (s.surfaceCondition === "uneven") warnings.push("uneven surface");

  if (s.surface && THRESHOLDS.difficultSurfaces.includes(s.surface)) {
    warnings.push(`${s.surface} surface`);
  }

  if (s.droppedKerb === "raised" || s.droppedKerb === "none") {
    blockers.push("raised kerb with no dropped crossing");
  }

  // "Verified" means a surveyor recorded the two attributes that decide
  // passability. Anything less and the verdict is a machine's guess.
  const verified = s.stepFree !== null && s.widthM != null;
  if (!verified) warnings.push("not yet surveyed");

  return { passable: blockers.length === 0, verified, blockers, warnings };
}

export type RouteProfile = "shortest" | "accessible";

// Penalty multipliers applied to a segment's true length.
//
// Every multiplier is >= 1 by design. The A* heuristic uses straight-line
// distance, which stays admissible (never an overestimate) only while cost
// is never less than real distance — a multiplier below 1 would silently
// break the search's optimality guarantee.
const PENALTY = {
  unverified: 1.3,
  narrow: 1.4,
  steep: 1.6,
  roughSurface: 1.5,
  noTactilePaving: 1.1,
};

// Cost of traversing a segment under a given profile, in "effort metres".
// Returns null when the segment must not be used at all.
export function edgeCost(edge: GraphEdge, profile: RouteProfile): number | null {
  if (profile === "shortest") return edge.lengthM;

  const { passable, verified, warnings } = assess(edge);
  if (!passable) return null;

  let cost = edge.lengthM;
  if (!verified) cost *= PENALTY.unverified;
  if (warnings.some((w) => w.startsWith("narrow"))) cost *= PENALTY.narrow;
  if (warnings.some((w) => w.startsWith("steep"))) cost *= PENALTY.steep;
  if (warnings.some((w) => w.includes("surface"))) cost *= PENALTY.roughSurface;
  if (edge.survey.tactilePaving === false) cost *= PENALTY.noTactilePaving;

  return cost;
}

// Plain-language summary of a whole route, for on-screen text and for the
// spoken guidance. Written to be read aloud, so it avoids symbols and
// abbreviations that a screen reader would mangle.
export function describeRoute(edges: GraphEdge[]): {
  metres: number;
  verifiedShare: number;
  warnings: string[];
} {
  const metres = edges.reduce((sum, e) => sum + e.lengthM, 0);
  const verifiedMetres = edges
    .filter((e) => assess(e).verified)
    .reduce((sum, e) => sum + e.lengthM, 0);

  // Collect each distinct concern once rather than repeating it per segment.
  const seen = new Set<string>();
  for (const edge of edges) {
    for (const w of assess(edge).warnings) seen.add(w.replace(/\s*\([^)]*\)/, ""));
  }

  return {
    metres: Math.round(metres),
    verifiedShare: metres > 0 ? verifiedMetres / metres : 0,
    warnings: [...seen],
  };
}
