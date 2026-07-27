import type { GraphEdge, SurveyAttributes } from "./pathfinding";

// Accessibility judgement, kept separate from the search algorithm so that
// the criteria can be defended (and cited) independently of the code that
// applies them.
//
// IMPORTANT — the threshold figures below are working values taken from
// commonly quoted summaries of the standards. Confirm each against the
// primary source before quoting it in the dissertation:
//   • BS 8300-1:2018 — design of an accessible external environment
//     (available through the University Library's BSOL subscription)
//   • Inclusive Mobility (UK Department for Transport) — free PDF

/**
 * Who the route is being planned for.
 *
 * "Accessible" is not one thing. A flight of steps stops a wheelchair user
 * completely, but is barely an obstacle to someone with low vision — for
 * whom the real barriers are missing tactile paving, poor lighting and
 * uneven ground. Collapsing them into a single "accessible" mode would
 * serve one group and mislead the others, which is why this project models
 * them separately.
 */
export type RouteProfile = "shortest" | "wheelchair" | "lowVision" | "limitedMobility";

/**
 * The complete rule set for one profile.
 *
 * Every rule lives in this table rather than being scattered through the
 * code, so the criteria can be reviewed, challenged and cited as a table in
 * their own right — and changed without touching the search.
 *
 * All penalty multipliers must be >= 1. The A* heuristic is straight-line
 * distance, which is admissible only while cost never falls below true
 * distance; a multiplier under 1 would silently destroy the guarantee that
 * the route returned is the best one.
 */
export interface ProfileRules {
  id: RouteProfile;
  /** Shown in the route planner. */
  label: string;
  /** One line explaining who this is for. */
  description: string;

  /** Steps make the segment impassable. */
  stepsBlock: boolean;
  /** Steps are usable, but only where there is a handrail to hold. */
  stepsNeedHandrail: boolean;
  /** Narrower than this and the segment is impassable. `null` = no limit. */
  minWidthM: number | null;
  /** Below this it is usable but uncomfortable — no room to pass. */
  comfortWidthM: number | null;
  /** Steeper than this and the segment is impassable. `null` = no limit. */
  maxGradientPct: number | null;
  /** Above this it is usable but tiring. */
  comfortGradientPct: number;
  /** A raised kerb with no dropped crossing makes the segment impassable. */
  raisedKerbBlocks: boolean;

  penalties: {
    /** Nobody has surveyed this segment yet. */
    unverified: number;
    /** Below the comfortable width. */
    narrow: number;
    /** Above the comfortable gradient. */
    steep: number;
    /** Uneven or poor surface, or a material that is hard going. */
    roughSurface: number;
    /** Steps that the profile can use but would rather avoid. */
    steps: number;
    /** No tactile paving where a crossing has one kerb or another. */
    noTactilePaving: number;
    /** No street lighting. */
    unlit: number;
    /** No bench or rest point within reach. */
    noSeating: number;
    /** A raised kerb, where the profile can manage it but it hurts. */
    awkwardKerb: number;
  };
}

/** Surfaces that are hard going even in good condition. */
const DIFFICULT_SURFACES = ["gravel", "grass", "cobbles", "sett"];

export const PROFILES: Record<Exclude<RouteProfile, "shortest">, ProfileRules> = {
  /**
   * Wheelchair user. Steps are absolute barriers; width and gradient decide
   * everything else. Lighting and rest points do not affect whether the
   * journey is possible, so they carry no weight here.
   */
  wheelchair: {
    id: "wheelchair",
    label: "Step-free (wheelchair)",
    description: "Avoids all steps. Needs width, gentle gradients and dropped kerbs.",
    stepsBlock: true,
    stepsNeedHandrail: false,
    minWidthM: 1.0,
    comfortWidthM: 1.5,
    maxGradientPct: 8,
    comfortGradientPct: 5,
    raisedKerbBlocks: true,
    penalties: {
      unverified: 1.3,
      narrow: 1.4,
      steep: 1.6,
      roughSurface: 1.5,
      steps: 1, // unreachable — steps already block
      noTactilePaving: 1,
      unlit: 1,
      noSeating: 1,
      awkwardKerb: 1, // unreachable — raised kerbs already block
    },
  },

  /**
   * Blind or partially sighted traveller. Steps are not a barrier and are
   * not penalised heavily — a known flight of stairs is easier than an open
   * space with no edge to follow. What matters is being able to detect the
   * route: tactile paving at crossings, even ground underfoot, and lighting
   * for those with residual vision.
   */
  lowVision: {
    id: "lowVision",
    label: "Visually impaired",
    description: "Prefers tactile paving, even surfaces and well-lit paths. Steps are acceptable.",
    stepsBlock: false,
    stepsNeedHandrail: false,
    minWidthM: null,
    comfortWidthM: null,
    maxGradientPct: null,
    comfortGradientPct: 12,
    raisedKerbBlocks: false,
    penalties: {
      unverified: 1.3,
      narrow: 1,
      steep: 1.1,
      // Uneven ground is the main trip hazard when you cannot see it coming.
      roughSurface: 1.8,
      steps: 1.2,
      // A crossing with no tactile warning is where the serious risk is.
      noTactilePaving: 1.5,
      unlit: 1.6,
      noSeating: 1,
      awkwardKerb: 1.3,
    },
  },

  /**
   * Older traveller, or anyone who walks with difficulty or uses a stick.
   * Steps are manageable with something to hold, and impossible without.
   * Gradient and total effort matter more than for any other profile, and
   * somewhere to sit down is a genuine requirement rather than a comfort.
   */
  limitedMobility: {
    id: "limitedMobility",
    label: "Walks with difficulty",
    description: "Avoids steep climbs and steps without handrails. Prefers routes with places to rest.",
    stepsBlock: false,
    stepsNeedHandrail: true,
    minWidthM: 0.8,
    comfortWidthM: 1.2,
    maxGradientPct: 10,
    comfortGradientPct: 4,
    raisedKerbBlocks: false,
    penalties: {
      unverified: 1.3,
      narrow: 1.1,
      steep: 1.8,
      roughSurface: 1.6,
      steps: 1.5,
      noTactilePaving: 1,
      unlit: 1.2,
      // A proxy: rest points matter as a function of how far you have already
      // walked, but A* costs each segment independently, so preferring
      // segments that pass a bench is the closest an edge-local cost can get.
      noSeating: 1.25,
      awkwardKerb: 1.4,
    },
  },
};

/** Profiles in the order they are offered to the user. */
export const PROFILE_LIST: ProfileRules[] = [
  PROFILES.wheelchair,
  PROFILES.limitedMobility,
  PROFILES.lowVision,
];

export interface Assessment {
  /** False when something makes the segment impassable for this profile. */
  passable: boolean;
  /** True once the segment has actually been surveyed on the ground. */
  verified: boolean;
  /** Reasons the segment is impassable. */
  blockers: string[];
  /** Usable, but with a difficulty worth telling the user about. */
  warnings: string[];
}

/**
 * Has anyone actually walked this segment and measured it?
 *
 * Deliberately independent of profile: it is a fact about the data, not a
 * judgement about a person. Width is never pre-filled by the pipeline, so
 * its presence proves a surveyor was there.
 */
export function isSurveyed(edge: GraphEdge): boolean {
  return edge.survey.stepFree !== null && edge.survey.widthM != null;
}

/** Does this segment have steps, as far as anyone knows? */
function hasSteps(edge: GraphEdge): boolean {
  const s = edge.survey;
  // OSM's `highway=steps` is reliable even before fieldwork, so it counts
  // until a surveyor says otherwise.
  return s.stepFree === false || (s.stepFree === null && edge.highway === "steps");
}

/**
 * Judge one path segment for one profile.
 *
 * The three-state logic matters more than the thresholds themselves: a
 * segment nobody has surveyed is "unverified", never "fine". Telling someone
 * a path is passable when no one has checked is the exact failure this
 * project exists to prevent.
 */
export function assess(edge: GraphEdge, profile: RouteProfile = "wheelchair"): Assessment {
  const verified = isSurveyed(edge);
  if (profile === "shortest") {
    return { passable: true, verified, blockers: [], warnings: [] };
  }

  const rules = PROFILES[profile];
  const s: SurveyAttributes = edge.survey;
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (hasSteps(edge)) {
    const count = s.stepCount != null ? `${s.stepCount} steps` : "steps";
    if (rules.stepsBlock) {
      blockers.push(s.ramp === true ? `${count} (a ramp is present — check it)` : count);
    } else if (rules.stepsNeedHandrail && s.handrail === false) {
      blockers.push(`${count} with no handrail`);
    } else if (rules.stepsNeedHandrail && s.handrail === null) {
      // Unknown handrail on a profile that depends on one: usable, but the
      // user must be told the support they need has not been confirmed.
      warnings.push(`${count}, handrail not yet checked`);
    } else {
      warnings.push(count);
    }
  }

  if (s.widthM != null) {
    if (rules.minWidthM != null && s.widthM < rules.minWidthM) {
      blockers.push(`only ${s.widthM} m wide`);
    } else if (rules.comfortWidthM != null && s.widthM < rules.comfortWidthM) {
      warnings.push(`narrow (${s.widthM} m)`);
    }
  }

  if (s.gradientPct != null) {
    const g = Math.abs(s.gradientPct);
    if (rules.maxGradientPct != null && g > rules.maxGradientPct) {
      blockers.push(`too steep (${g}%)`);
    } else if (g > rules.comfortGradientPct) {
      warnings.push(`steep (${g}%)`);
    }
  }

  if (s.surfaceCondition === "poor") warnings.push("surface in poor condition");
  else if (s.surfaceCondition === "uneven") warnings.push("uneven surface");
  if (s.surface && DIFFICULT_SURFACES.includes(s.surface)) warnings.push(`${s.surface} surface`);

  if (s.droppedKerb === "raised" || s.droppedKerb === "none") {
    if (rules.raisedKerbBlocks) blockers.push("raised kerb with no dropped crossing");
    else warnings.push("raised kerb");
  }

  // Concerns that never block a journey, but change which route is better.
  if (rules.penalties.noTactilePaving > 1 && s.tactilePaving === false) {
    warnings.push("no tactile paving");
  }
  if (rules.penalties.unlit > 1 && s.lit === false) warnings.push("unlit after dark");
  if (rules.penalties.noSeating > 1 && s.seatingNearby === false) warnings.push("nowhere to rest");

  if (!verified) warnings.push("not yet surveyed");

  return { passable: blockers.length === 0, verified, blockers, warnings };
}

/**
 * Cost of traversing a segment, in "effort metres".
 * Returns null when the segment must not be used at all by this profile.
 */
export function edgeCost(edge: GraphEdge, profile: RouteProfile): number | null {
  if (profile === "shortest") return edge.lengthM;

  const rules = PROFILES[profile];
  const { passable, verified } = assess(edge, profile);
  if (!passable) return null;

  const s = edge.survey;
  const p = rules.penalties;
  let cost = edge.lengthM;

  if (!verified) cost *= p.unverified;
  if (hasSteps(edge)) cost *= p.steps;

  if (s.widthM != null && rules.comfortWidthM != null && s.widthM < rules.comfortWidthM) {
    cost *= p.narrow;
  }
  if (s.gradientPct != null && Math.abs(s.gradientPct) > rules.comfortGradientPct) {
    cost *= p.steep;
  }
  if (
    s.surfaceCondition === "poor" ||
    s.surfaceCondition === "uneven" ||
    (s.surface != null && DIFFICULT_SURFACES.includes(s.surface))
  ) {
    cost *= p.roughSurface;
  }
  if (s.tactilePaving === false) cost *= p.noTactilePaving;
  if (s.lit === false) cost *= p.unlit;
  if (s.seatingNearby === false) cost *= p.noSeating;
  if (s.droppedKerb === "raised" || s.droppedKerb === "none") cost *= p.awkwardKerb;

  return cost;
}

/**
 * Plain-language summary of a whole route, for on-screen text and spoken
 * guidance. Written to be read aloud, so it avoids symbols and
 * abbreviations that a screen reader would mangle.
 */
export function describeRoute(
  edges: GraphEdge[],
  profile: RouteProfile = "wheelchair"
): { metres: number; verifiedShare: number; warnings: string[]; restPoints: number } {
  const metres = edges.reduce((sum, e) => sum + e.lengthM, 0);
  const verifiedMetres = edges
    .filter((e) => isSurveyed(e))
    .reduce((sum, e) => sum + e.lengthM, 0);

  // Collect each distinct concern once rather than repeating it per segment.
  const seen = new Set<string>();
  for (const edge of edges) {
    for (const w of assess(edge, profile).warnings) seen.add(w.replace(/\s*\([^)]*\)/, ""));
  }

  return {
    metres: Math.round(metres),
    verifiedShare: metres > 0 ? verifiedMetres / metres : 0,
    warnings: [...seen],
    restPoints: edges.filter((e) => e.survey.seatingNearby === true).length,
  };
}
