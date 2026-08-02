// Sensitivity of the survey set to the two buffer distances.
//
// ALT_BUFFER_M and DEST_RADIUS_M are engineering choices, not figures from a
// standard. That is defensible only if the choice can be shown not to decide
// the outcome — so this sweeps both and reports how the selected set, and the
// findings that follow from it, actually move.
//
// Uses build-survey.mjs itself in --dry-run mode, so the numbers come from the
// production selection code rather than a reimplementation of it.
//
// Usage:  node scripts/sensitivity.mjs

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const script = join(__dirname, "build-survey.mjs");

function run(alt, dest) {
  const out = execFileSync(process.execPath, [script, "--dry-run"], {
    encoding: "utf8",
    env: { ...process.env, ALT_BUFFER_M: String(alt), DEST_RADIUS_M: String(dest) },
  });
  const grab = (re) => {
    const m = out.match(re);
    return m ? Number(m[1]) : null;
  };
  return {
    core: grab(/core\s+(\d+) segments/),
    alt: grab(/alternatives\s+(\d+) segments/),
    link: grab(/links\s+(\d+) segments/),
    total: grab(/TOTAL\s+(\d+) segments/),
    km: grab(/TOTAL\s+\d+ segments\s+([\d.]+) km/),
  };
}

console.log("=== DEST_RADIUS_M sweep (ALT_BUFFER_M held at 45) ===");
console.log("  radius   core  alt  link  TOTAL     km");
for (const r of [40, 50, 60, 70, 80, 100, 120]) {
  const s = run(45, r);
  const mark = r === 70 ? "  <- chosen" : "";
  console.log(
    `  ${String(r).padStart(4)} m  ${String(s.core).padStart(4)} ${String(s.alt).padStart(4)} ` +
      `${String(s.link).padStart(5)} ${String(s.total).padStart(6)}  ${String(s.km).padStart(5)}${mark}`
  );
}

console.log("\n=== ALT_BUFFER_M sweep (DEST_RADIUS_M held at 70) ===");
console.log("  buffer   core  alt  link  TOTAL     km");
for (const b of [25, 35, 45, 55, 70, 90]) {
  const s = run(b, 70);
  const mark = b === 45 ? "  <- chosen" : "";
  console.log(
    `  ${String(b).padStart(4)} m  ${String(s.core).padStart(4)} ${String(s.alt).padStart(4)} ` +
      `${String(s.link).padStart(5)} ${String(s.total).padStart(6)}  ${String(s.km).padStart(5)}${mark}`
  );
}
