CLAUDE.md
# Gilmorehill Campus Navigation

## Project Overview
Smart navigation assistant for older and disabled people
on Glasgow University's Gilmorehill campus (ENG5059P MSc Project).
This repo covers outdoor navigation, connecting to a classmate's
indoor system via a handover point. Supervisor: Marion Hersh.

## Scope — four destinations only
The project navigates between exactly four places:
- Main Building (Gilbert Scott Building, OSM relation/11951)
- Hunterian Museum (OSM node/600576868) — INSIDE the Main Building,
  level 2. Outdoor routing ends at its accessible entrance and hands
  over to the indoor system; it is the clearest handover case.
- University Library (OSM way/32660759)
- James Watt Building South (OSM way/182180587)

Defined once in `scripts/study-area.mjs` (DESTINATIONS). Change that
list and re-run both survey stages to alter the study area — never
hand-edit the generated data.

## Tech Stack
- React + Vite (TypeScript) — browser-based web app
- Google Maps JavaScript API (@react-google-maps/api)
- A* pathfinding with an admissible straight-line heuristic
- GeoJSON/OSM path network + field-surveyed accessibility attributes
- Voice guidance via the Web Speech API (window.speechSynthesis)
- Node + Overpass API scripts for the survey pipeline

Note: originally scaffolded as a React Native + Expo mobile app; pivoted
to a web app for the project demonstration.

## Data pipeline (important)
OpenStreetMap → survey CSVs → field measurement → app network:
1. `npm run survey:fetch`  — scripts/fetch-osm.mjs downloads paths,
   building outlines and entrance nodes around the four destinations.
2. `npm run survey:build`  — scripts/build-survey.mjs picks the segments
   worth surveying (all six destination pairs, plus the step-free
   alternative to each, plus a corridor of nearby options), and writes
   survey/*.csv, survey/basemap.html and src/data/campusNetwork.json.
3. `npm run survey:plan`   — scripts/field-plan.mjs writes survey/field-plan.md
   (ordered walking itinerary) and survey/field-sheet.html (printable
   recording sheet). Sessions split BY AREA (south: Main/Hunterian/James
   Watt; north: Library) — splitting by tier instead nearly doubles the
   walking, which was measured and rejected.
4. Field survey fills survey/segments.csv and survey/entrances.csv.
5. `npm run survey:check`  — scripts/check-survey.mjs validates the CSVs.
   `-- --fix` applies only unambiguous corrections (case, decimal commas,
   single-letter shorthand from the printed sheet).
6. `npm run survey:import` re-runs stage 2 to fold measurements in.

Segment tiers: `core` (routes between the four destinations, incl. the
step-free variant of each), `alt` (corridor of alternatives + everything
within 70 m of a destination), `link` (added by the stitching pass so the
survey network is one connected component — an island is useless to both
the surveyor and the router).

`src/data/campusNetwork.json` is GENERATED — never edit it by hand.
Re-running any stage is safe: prior CSV values are matched on the
`osm_way`/`osm_from`/`osm_to` columns, which name the actual ground, not on
`segment_id`, which is only a row number and shifts when OSM changes.
`node scripts/build-survey.mjs --dry-run` previews without writing.

Excel and WPS 表格 take exclusive locks on open CSVs; the scripts detect
EBUSY/EPERM and report it in plain English instead of a stack trace.

## Accessibility Requirements
- WCAG 2.1 Level AA
- Voice guidance (TTS)
- Large fonts, high contrast UI
- Wheelchair-accessible routes
- BS 8300:2018 compliance

Key design rule: `null` means "not surveyed", and is never treated as
"fine". An unverified segment is drawn dashed and reported as unverified.
Telling a wheelchair user a path is passable when nobody has checked is
the failure this project exists to prevent.

Four routing profiles live in `src/navigation/accessibility.ts` as one
reviewable `PROFILES` table: `wheelchair`, `limitedMobility`, `lowVision`
and `shortest`. "Accessible" is not one thing — steps stop a wheelchair
user completely but are barely an obstacle to someone with low vision, for
whom missing tactile paving and poor lighting are the real barriers. All
twelve surveyed attributes feed the model; adding a profile means adding a
row to that table, never touching the A* search.

Every penalty multiplier MUST stay >= 1. The A* heuristic is straight-line
distance, which is admissible only while cost never falls below true
distance; a multiplier below 1 silently destroys the optimality guarantee.

Thresholds in that table are SOURCED and citable: every one comes from
DfT (2021) *Inclusive Mobility*, with the section number in a comment
beside it (§3.2 widths per user group, §3.4 distance without a rest, §4.2
footway widths, §4.3 gradients, §4.5 seating intervals, §5.1 steps per
flight). Do not change a threshold without a citation to replace it.
BS 8300-1:2018 governs building entrances and doors only — that PDF is
FileOpen/DRM protected and cannot be read programmatically.

The penalty MULTIPLIERS are a separate matter: they still have no
empirical basis and need literature support or user preference data. The
user has decided to leave them as they are for now.

## Project Structure
scripts/
  study-area.mjs   # the four destinations + shared config/helpers
  fetch-osm.mjs    # stage 1: Overpass download
  build-survey.mjs # stage 2: segment selection, CSVs, field map, app data
survey/            # the field kit + generated GeoJSON (see survey/README.md)
src/
  pages/           # MapPage, RoutePlannerPage, SettingsPage
  components/      # Reusable UI (TabBar, CampusMap)
  navigation/      # pathfinding.ts (A*), accessibility.ts (thresholds/cost)
  data/            # campusGraph.ts + generated campusNetwork.json
  hooks/           # useTTS (Web Speech API) and other hooks
  constants/       # theme (high-contrast colours, sizes)
  styles/          # global.css

## Coding Standards
- TypeScript with full type annotations
- Functional components + React Hooks
- Comments on all navigation logic
- Accessibility props on all interactive elements

## Local Development
- Requires the Maps JavaScript API enabled in Google Cloud Console
- API key is read from `.env` (VITE_GOOGLE_MAPS_API_KEY); see `.env.example`
- `npm install` then `npm run dev` (Vite dev server on http://localhost:5173)
- `npm run build` type-checks and produces a production bundle in `dist/`
- Node lives at C:\Program Files\nodejs on the author's machine and may
  need prepending to PATH in PowerShell.
