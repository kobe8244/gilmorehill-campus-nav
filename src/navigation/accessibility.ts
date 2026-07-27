import type { Entrance, GraphEdge, SurveyAttributes } from "./pathfinding";

// Accessibility judgement, kept separate from the search algorithm so that
// the criteria can be defended (and cited) independently of the code that
// applies them.
//
// SOURCE — every threshold below is taken from:
//
//   Department for Transport (2021) *Inclusive Mobility: A Guide to Best
//   Practice on Access to Pedestrian and Transport Infrastructure*.
//   London: DfT. Section numbers are cited against each value.
//
// That guide governs the *external pedestrian* environment, which is what
// this project routes over. BS 8300-1:2018 remains the reference for
// building entrances and doors, and the entrance survey is judged against
// it separately.
//
// Where the guide gives a figure per user group, that figure is applied to
// the matching profile rather than averaged — the whole point of modelling
// profiles separately is that these numbers genuinely differ.

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
 * Entrance and door criteria — DfT (2021) Inclusive Mobility §11.2.
 * A route that ends at a door the traveller cannot open has not got them
 * anywhere, so entrances are judged on the same footing as the paths.
 */
export const DOOR = {
  /** Clear opening width once open: the minimum acceptable. */
  minClearWidthM: 0.9,
  /** The width the guide asks for wherever it can be achieved. */
  preferredClearWidthM: 1.2,
  /** Thresholds should be level; this is the greatest acceptable rise. */
  maxThresholdRiseMm: 10,
};

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
  /**
   * How far this group can be expected to travel before needing to rest,
   * in metres. Inclusive Mobility §3.4 gives these per user group; they are
   * recommendations averaged over a population, not hard limits, so a route
   * longer than this is reported rather than rejected.
   */
  maxDistanceWithoutRestM: number | null;

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

/**
 * Seating should appear at intervals of no more than this along a commonly
 * used pedestrian route — Inclusive Mobility §4.5.
 */
export const SEATING_INTERVAL_M = 50;

/**
 * A flight of steps should contain no more than this many steps before a
 * landing — Inclusive Mobility §5.1. A longer flight is non-compliant and
 * worth reporting even to a profile that can use steps.
 */
export const MAX_STEPS_PER_FLIGHT = 12;

/**
 * Gradient reference points, all from Inclusive Mobility §4.3, expressed as
 * percentages because that is what the survey records.
 *   1 in 60 ≈ 1.67%  — at or below this the route counts as "level"
 *   1 in 20 = 5%     — steeper than this is defined as a ramp
 *   1 in 12 ≈ 8.33%  — the absolute maximum as a general rule
 */
export const GRADIENT = { level: 1.67, ramp: 5, absoluteMax: 8.33 };

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
    // §4.2: 1000 mm is the absolute minimum, and only past an obstacle for
    // no more than 6 m. 1500 mm lets a wheelchair user and a walker pass;
    // 2000 mm — two wheelchairs — is the figure for normal circumstances.
    minWidthM: 1.0,
    comfortWidthM: 1.5,
    // §4.3: 1 in 12 absolute maximum, 1 in 20 before it counts as a ramp.
    maxGradientPct: GRADIENT.absoluteMax,
    comfortGradientPct: GRADIENT.ramp,
    raisedKerbBlocks: true,
    maxDistanceWithoutRestM: 150, // §3.4
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
    // §3.2: a long cane or assistance dog needs 1100 mm; being guided needs
    // 1200 mm. Width is a real requirement here, just a smaller one.
    minWidthM: 1.1,
    comfortWidthM: 1.2,
    // Gradient is not the barrier for this group, but a slope steep enough
    // to be a ramp is still worth mentioning.
    maxGradientPct: null,
    comfortGradientPct: GRADIENT.absoluteMax,
    raisedKerbBlocks: false,
    maxDistanceWithoutRestM: 150, // §3.4
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
    // §3.2: a stick user needs 750 mm; two sticks, crutches or a walking
    // frame need 900 mm. The larger figure is used, since the profile has to
    // serve the harder case.
    minWidthM: 0.9,
    comfortWidthM: 1.2,
    // §4.3 applies to everyone: 1 in 12 absolute maximum, 1 in 20 before a
    // slope becomes a ramp. The guide notes that a shallow slope running for
    // a long distance is itself an obstacle for this group.
    maxGradientPct: GRADIENT.absoluteMax,
    comfortGradientPct: GRADIENT.ramp,
    raisedKerbBlocks: false,
    // §3.4: walking stick and cane users — 50 m, the shortest of any group
    // and shorter than five of the six journeys this app offers.
    maxDistanceWithoutRestM: 50,
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
    // §5.1: a flight should have no more than 12 steps before a landing.
    // Worth saying even to someone who can use steps.
    if (s.stepCount != null && s.stepCount > MAX_STEPS_PER_FLIGHT && !rules.stepsBlock) {
      warnings.push(`long flight of ${s.stepCount} steps with no landing`);
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
export interface RouteSummary {
  metres: number;
  verifiedShare: number;
  warnings: string[];
  /** Segments along the route where a rest point was recorded. */
  restPoints: number;
  /**
   * Set when the route is longer than this group can be expected to manage
   * without a rest (Inclusive Mobility §3.4). Advisory, not a refusal —
   * the figure is a population average, and the person knows their own legs
   * better than a guide does.
   */
  restAdvice: string | null;
}

export function describeRoute(
  edges: GraphEdge[],
  profile: RouteProfile = "wheelchair"
): RouteSummary {
  const metres = edges.reduce((sum, e) => sum + e.lengthM, 0);
  const verifiedMetres = edges
    .filter((e) => isSurveyed(e))
    .reduce((sum, e) => sum + e.lengthM, 0);

  // Collect each distinct concern once rather than repeating it per segment.
  const seen = new Set<string>();
  for (const edge of edges) {
    for (const w of assess(edge, profile).warnings) seen.add(w.replace(/\s*\([^)]*\)/, ""));
  }

  const restPoints = edges.filter((e) => e.survey.seatingNearby === true).length;

  let restAdvice: string | null = null;
  const limit = profile === "shortest" ? null : PROFILES[profile].maxDistanceWithoutRestM;
  if (limit != null && metres > limit) {
    restAdvice =
      restPoints > 0
        ? `This route is ${Math.round(metres)} metres. The recommended distance ` +
          `without a rest is ${limit} metres, and ${restPoints} rest ` +
          `${restPoints === 1 ? "point was" : "points were"} recorded along the way.`
        : `This route is ${Math.round(metres)} metres. The recommended distance ` +
          `without a rest is ${limit} metres, and no rest points have been ` +
          `recorded along it.`;
  }

  return {
    metres: Math.round(metres),
    verifiedShare: metres > 0 ? verifiedMetres / metres : 0,
    warnings: [...seen],
    restPoints,
    restAdvice,
  };
}

// --- Entrances --------------------------------------------------------

/** Human-readable name of a profile, including the plain "shortest" mode. */
export function profileLabel(profile: RouteProfile): string {
  return profile === "shortest" ? "Shortest route" : PROFILES[profile].label;
}

/**
 * Judge a building entrance for one profile, against Inclusive Mobility
 * §11.2.
 *
 * The same three-state rule as the paths: an entrance nobody has visited is
 * unverified, not assumed usable. A route that ends at a door the traveller
 * cannot open has not taken them anywhere, so this decides whether a
 * destination is genuinely reachable — not merely whether a path exists.
 */
export function assessEntrance(entrance: Entrance, profile: RouteProfile): Assessment {
  const s = entrance.survey;
  // "Surveyed" means somebody stood at the door and reached a verdict.
  const verified = s.accessible !== null;
  if (profile === "shortest") {
    return { passable: true, verified, blockers: [], warnings: [] };
  }

  const rules = PROFILES[profile];
  const blockers: string[] = [];
  const warnings: string[] = [];

  // The surveyor's own verdict outranks anything inferred from measurements:
  // they were there and could see the whole situation. But `accessible` asks
  // "step-free and usable by a wheelchair", so a `no` is a wheelchair verdict
  // — it stops a wheelchair user and merely warns everyone else. Treating it
  // as universal would tell a blind traveller a door is shut to them because
  // it has a step.
  if (s.accessible === false) {
    if (rules.stepsBlock) blockers.push("recorded as not wheelchair accessible");
    else warnings.push("recorded as not wheelchair accessible");
  }

  // OSM's `wheelchair=no` is a third-party claim, not a survey. It is worth
  // repeating so nobody sets off expecting otherwise, but it never blocks a
  // route on its own — that would let unverified data make the decision.
  if (s.accessible === null && /wheelchair\s*=\s*no/.test(entrance.osmHint ?? "")) {
    warnings.push("OpenStreetMap records this door as not wheelchair accessible — unconfirmed");
  }

  // §11.2: a revolving door is "not well suited to many people, including
  // disabled people", and where one exists an alternative must be provided
  // nearby. So the revolving door itself is never the accessible way in.
  if (s.doorType === "revolving") {
    if (rules.stepsBlock) blockers.push("revolving door");
    else warnings.push("revolving door — look for the alternative door beside it");
  }

  // §11.2: manual doors are "difficult for many people to manage,
  // particularly wheelchair users"; a door recorded as heavy exceeds the
  // 15 N the guide allows.
  if (s.doorType === "heavy") {
    if (rules.stepsBlock) blockers.push("heavy door");
    else warnings.push("heavy door — may need help to open");
  }

  // §11.2: thresholds should be level. Any step is non-compliant, but only
  // a wheelchair is stopped outright by one.
  if (s.stepFree === false && s.ramp !== true) {
    const n = s.stepCount != null ? `${s.stepCount} step${s.stepCount === 1 ? "" : "s"}` : "a step";
    if (rules.stepsBlock) blockers.push(`${n} at the door and no ramp`);
    else warnings.push(`${n} at the door`);
  }

  // §11.2: 900 mm minimum clear width, 1200 mm preferred.
  if (s.doorWidthM != null) {
    if (rules.stepsBlock && s.doorWidthM < DOOR.minClearWidthM) {
      blockers.push(`door only ${s.doorWidthM} m wide`);
    } else if (s.doorWidthM < DOOR.preferredClearWidthM) {
      warnings.push(`narrow door (${s.doorWidthM} m)`);
    }
  }

  if (!verified) warnings.push("entrance not yet surveyed");

  return { passable: blockers.length === 0, verified, blockers, warnings };
}

/** Entrances serving a destination, best first for the given profile. */
export function rankEntrances(
  entrances: Entrance[],
  destinationId: string,
  profile: RouteProfile
): Entrance[] {
  return entrances
    .filter((e) => e.serves === destinationId && e.nodeId != null)
    .map((e) => ({ e, a: assessEntrance(e, profile) }))
    .sort((x, y) => {
      // Usable before unusable; confirmed before merely unchecked.
      if (x.a.passable !== y.a.passable) return x.a.passable ? -1 : 1;
      if (x.a.verified !== y.a.verified) return x.a.verified ? -1 : 1;
      return x.a.warnings.length - y.a.warnings.length;
    })
    .map(({ e }) => e);
}
