// Checks the field CSVs before they are trusted.
//
// Typing 68 rows of measurements on a phone in the rain produces typos, and a
// typo here is worse than a blank: a blank is honestly "unknown", whereas
// `width_m = 140` (centimetres) or `step_free = Yes` silently becomes wrong
// routing advice for someone who cannot walk up steps.
//
// Usage:  npm run survey:check          report problems
//         npm run survey:check -- --fix fix the safe ones automatically
//
// Only unambiguous corrections are ever applied: letter case, stray spaces,
// and decimal commas. Anything needing judgement is reported for a human.

import { readFileSync, existsSync } from "node:fs";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  SEGMENT_COLUMNS,
  SEGMENT_FIELD_COLUMNS,
  ENTRANCE_COLUMNS,
  csvRow,
  parseCsv,
} from "./study-area.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIR = join(__dirname, "..", "survey");
const FIX = process.argv.includes("--fix");

const YES_NO = ["yes", "no"];
const SURFACES = ["asphalt", "paving_stones", "concrete", "gravel", "grass", "cobbles", "other"];
const CONDITIONS = ["good", "uneven", "poor"];
const KERBS = ["lowered", "flush", "raised", "none"];
const DOORS = ["automatic", "manual", "heavy", "revolving"];

// Shorthand from the printed field sheet, PER COLUMN — the same letter means
// different things in different columns (`G` is good in `surface_condition`
// but gravel in `surface`; `R` is raised in `dropped_kerb` but grass in
// `surface`). A single shared table silently mistranslates half the sheet, so
// each column carries its own. These must stay in step with the legend
// printed at the top of survey/field-sheet.html.
const SHORTHAND = {
  yesno: { y: "yes", n: "no", "1": "yes", "0": "no", true: "yes", false: "no" },
  surface: {
    a: "asphalt", p: "paving_stones", c: "concrete",
    g: "gravel", r: "grass", k: "cobbles", o: "other",
  },
  condition: { g: "good", u: "uneven", p: "poor" },
  kerb: { f: "flush", l: "lowered", r: "raised", n: "none" },
  door: { a: "automatic", m: "manual", h: "heavy", r: "revolving" },
};

const errors = [];
const warnings = [];
const fixes = [];

const problem = (list, file, id, col, msg) => list.push({ file, id, col, msg });

// Normalise one cell. Returns the corrected value, or the original.
function normalise(raw) {
  return String(raw ?? "").trim().replace(/\s+/g, " ");
}

// A number the surveyor may have typed with a decimal comma (common outside
// the UK, and what a phone keyboard set to Chinese offers first).
function asNumber(v) {
  const cleaned = v.replace(",", ".");
  return cleaned !== "" && !isNaN(Number(cleaned)) ? Number(cleaned) : null;
}

function checkEnum(file, id, col, value, allowed, shorthand) {
  const v = value.toLowerCase();
  if (allowed.includes(v)) {
    // Still a fix if only the letter case or spacing was wrong.
    if (v !== value) fixes.push({ file, id, col, from: value, to: v });
    return v;
  }
  const expanded = shorthand?.[v];
  if (expanded && allowed.includes(expanded)) {
    fixes.push({ file, id, col, from: value, to: expanded });
    return expanded;
  }
  const codes = shorthand
    ? ` (sheet codes: ${Object.entries(shorthand)
        .filter(([k]) => k.length === 1)
        .map(([k, x]) => `${k.toUpperCase()}=${x}`)
        .join(", ")})`
    : "";
  problem(errors, file, id, col, `"${value}" is not one of: ${allowed.join(", ")}${codes}`);
  return value;
}

function checkNumber(file, id, col, value, { min, max, suspectAbove, suspectMsg }) {
  const n = asNumber(value);
  if (n === null) {
    problem(errors, file, id, col, `"${value}" is not a number`);
    return value;
  }
  const canonical = String(n);
  if (canonical !== value) fixes.push({ file, id, col, from: value, to: canonical });
  if (n < min || n > max) {
    problem(errors, file, id, col, `${n} is outside the plausible range ${min}–${max}`);
  } else if (suspectAbove != null && n > suspectAbove) {
    problem(warnings, file, id, col, `${n} — ${suspectMsg}`);
  }
  return canonical;
}

// --- segments.csv -----------------------------------------------------

function checkSegments() {
  const path = join(DIR, "segments.csv");
  if (!existsSync(path)) {
    console.error("ERROR: survey/segments.csv not found. Run  npm run survey:build  first.");
    process.exit(1);
  }
  const rows = parseCsv(readFileSync(path, "utf8"));
  const file = "segments.csv";
  let surveyed = 0;
  let partial = 0;

  for (const row of rows) {
    const id = row.segment_id || "(no id)";
    for (const col of SEGMENT_COLUMNS) row[col] = normalise(row[col]);

    for (const col of ["step_free", "ramp", "handrail", "tactile_paving", "lit", "seating_nearby"]) {
      if (row[col]) row[col] = checkEnum(file, id, col, row[col], YES_NO, SHORTHAND.yesno);
    }
    if (row.surface)
      row.surface = checkEnum(file, id, "surface", row.surface, SURFACES, SHORTHAND.surface);
    if (row.surface_condition)
      row.surface_condition = checkEnum(file, id, "surface_condition", row.surface_condition, CONDITIONS, SHORTHAND.condition);
    if (row.dropped_kerb)
      row.dropped_kerb = checkEnum(file, id, "dropped_kerb", row.dropped_kerb, KERBS, SHORTHAND.kerb);

    if (row.step_count)
      row.step_count = checkNumber(file, id, "step_count", row.step_count, { min: 0, max: 200 });
    if (row.gradient_pct)
      row.gradient_pct = checkNumber(file, id, "gradient_pct", row.gradient_pct, {
        min: 0, max: 60, suspectAbove: 25,
        suspectMsg: "very steep for a path — did you record degrees instead of percent? (degrees × 1.75 ≈ percent)",
      });
    if (row.width_m)
      row.width_m = checkNumber(file, id, "width_m", row.width_m, {
        min: 0.2, max: 30, suspectAbove: 12,
        suspectMsg: "unusually wide — did you record centimetres instead of metres?",
      });

    // `step_free=no` on a stepped path is pre-filled by the pipeline, not
    // typed by anyone. Counting it as fieldwork would overstate progress and
    // produce a warning on every flight of stairs before the survey starts.
    const isSeed = (col) => col === "step_free" && row.highway === "steps" && row[col] === "no";
    const humanFields = SEGMENT_FIELD_COLUMNS.filter((c) => row[c] !== "" && !isSeed(c));

    // Cross-field checks: individually valid values that contradict each other.
    if (row.step_free === "no" && !isSeed("step_free") && !row.step_count && !row.notes) {
      problem(
        warnings, file, id, "step_free",
        row.highway === "steps"
          ? "recorded as not step-free but the step count is blank"
          : `recorded as not step-free, but OSM calls this a ${row.highway} and nothing ` +
            `else on the row supports it — if you did not measure this, clear the cell`
      );
    }
    if (row.step_free === "yes" && row.highway === "steps" && !row.notes) {
      problem(
        warnings, file, id, "step_free",
        "OSM calls this steps but you recorded step-free — please say why in notes (a parallel ramp?)"
      );
    }
    if (row.step_count && Number(row.step_count) > 0 && row.step_free === "yes" && !row.ramp) {
      problem(errors, file, id, "step_free", `${row.step_count} steps recorded but marked step-free`);
    }

    // Matches the app's own definition of "surveyed" in campusGraph.ts:
    // width is never pre-filled, so its presence proves a person was there.
    const done = row.step_free !== "" && row.width_m !== "";
    if (done) surveyed++;
    else if (humanFields.length > 0) partial++;
  }

  return { rows, surveyed, partial, total: rows.length };
}

// --- entrances.csv ----------------------------------------------------

function checkEntrances() {
  const path = join(DIR, "entrances.csv");
  if (!existsSync(path)) return { rows: [], surveyed: 0, total: 0 };
  const rows = parseCsv(readFileSync(path, "utf8"));
  const file = "entrances.csv";
  let surveyed = 0;

  for (const row of rows) {
    const id = row.entrance_id || "(no id)";
    for (const col of ENTRANCE_COLUMNS) row[col] = normalise(row[col]);

    for (const col of ["accessible", "step_free", "ramp"]) {
      if (row[col]) row[col] = checkEnum(file, id, col, row[col], YES_NO, SHORTHAND.yesno);
    }
    if (row.door_type)
      row.door_type = checkEnum(file, id, "door_type", row.door_type, DOORS, SHORTHAND.door);
    if (row.step_count)
      row.step_count = checkNumber(file, id, "step_count", row.step_count, { min: 0, max: 100 });
    if (row.door_width_m)
      row.door_width_m = checkNumber(file, id, "door_width_m", row.door_width_m, {
        min: 0.4, max: 5, suspectAbove: 3,
        suspectMsg: "unusually wide for a door — centimetres instead of metres?",
      });

    if (row.accessible === "yes" && !row.indoor_handover_id) {
      problem(
        warnings, file, id, "indoor_handover_id",
        "accessible entrance with no handover id — agree one with the indoor team"
      );
    }
    if (row.accessible === "yes" && row.step_free === "no" && row.ramp !== "yes") {
      problem(errors, file, id, "accessible", "marked accessible, but not step-free and no ramp");
    }
    // A revolving door cannot be used by most wheelchair users. Where one is
    // the recorded accessible entrance, there is nearly always a side door
    // that is the real answer — so this is a prompt to look again, not a
    // verdict on the building.
    if (row.accessible === "yes" && row.door_type === "revolving") {
      problem(
        warnings, file, id, "door_type",
        "revolving door marked accessible — is there a side door? record that one instead"
      );
    }
    // Clear opening width, not the door leaf. Below roughly 0.8 m a standard
    // wheelchair will not pass however step-free the threshold is.
    const dw = asNumber(row.door_width_m);
    if (row.accessible === "yes" && dw !== null && dw < 0.8) {
      problem(
        errors, file, id, "door_width_m",
        `${dw} m is too narrow for a wheelchair, but the entrance is marked accessible`
      );
    }
    // `accessible` can arrive pre-filled from OSM's wheelchair tag, so it does
    // not prove anyone visited. `door_type` can only come from a person.
    if (row.door_type !== "") surveyed++;
  }

  return { rows, surveyed, total: rows.length };
}

// --- Run ---------------------------------------------------------------

const seg = checkSegments();
const ent = checkEntrances();

function writeBack(name, columns, rows) {
  const out = [csvRow(columns), ...rows.map((r) => csvRow(columns.map((c) => r[c] ?? "")))];
  try {
    writeFileSync(join(DIR, name), out.join("\n") + "\n");
  } catch (err) {
    if (err.code === "EBUSY" || err.code === "EPERM") {
      console.error(`\nERROR: ${name} is open in Excel / WPS 表格. Close it and run again.`);
      process.exit(1);
    }
    throw err;
  }
}

if (FIX && fixes.length) {
  writeBack("segments.csv", SEGMENT_COLUMNS, seg.rows);
  writeBack("entrances.csv", ENTRANCE_COLUMNS, ent.rows);
}

const pct = (n, d) => (d > 0 ? Math.round((100 * n) / d) : 0);

console.log("=== Survey progress ===");
console.log(
  `  segments fully surveyed (step_free AND width_m): ` +
    `${seg.surveyed}/${seg.total}  (${pct(seg.surveyed, seg.total)}%)`
);
if (seg.partial) console.log(`  segments partly filled:                          ${seg.partial}`);
console.log(`  entrances recorded:                              ${ent.surveyed}/${ent.total}`);

if (fixes.length) {
  console.log(`\n=== ${FIX ? "Fixed" : "Fixable"} automatically (${fixes.length}) ===`);
  for (const f of fixes.slice(0, 25)) {
    console.log(`  ${f.file} ${f.id} ${f.col}: "${f.from}" → "${f.to}"`);
  }
  if (fixes.length > 25) console.log(`  … and ${fixes.length - 25} more`);
  if (!FIX) console.log(`\n  Run  npm run survey:check -- --fix  to apply these.`);
}

if (warnings.length) {
  console.log(`\n=== Worth a second look (${warnings.length}) ===`);
  for (const w of warnings) console.log(`  ${w.file} ${w.id} ${w.col}: ${w.msg}`);
}

if (errors.length) {
  console.log(`\n=== Must be fixed by hand (${errors.length}) ===`);
  for (const e of errors) console.log(`  ${e.file} ${e.id} ${e.col}: ${e.msg}`);
  console.log("\nFix these in the CSV, then run this again.");
  process.exit(1);
}

if (!warnings.length && !fixes.length) {
  console.log("\nNo problems found.");
}
console.log(
  seg.surveyed > 0
    ? "\nNext:  npm run survey:import   then  npm run dev"
    : "\nNothing surveyed yet — see survey/field-plan.md to start."
);
