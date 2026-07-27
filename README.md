# Gilmorehill Campus Navigation

An accessibility-first **outdoor** navigation assistant for older and
disabled people on the University of Glasgow's Gilmorehill campus.

This is the outdoor component of an ENG5059P MSc project. It connects to a
classmate's **indoor** navigation system at a shared handover point — an
accessible building entrance.

Supervisor: Marion Hersh.

## Scope

The app navigates between **four destinations**:

- **Main Building** (Gilbert Scott Building)
- **Hunterian Museum** — inside the Main Building, level 2
- **University Library**
- **James Watt Building (South)**

The scope is deliberately narrow. Accessible routing is only trustworthy
where every path has been measured on the ground, and four buildings is what
one person can survey to that standard. The pipeline is parameterised, so
extending the study area is a matter of editing one list.

## How it works

```
OpenStreetMap ──► survey/ ──► field survey ──► src/data/ ──► the app
   geometry       CSV kit     real measurements   network      A* routing
```

1. `npm run survey:fetch` downloads the path network and building outlines
   around the four destinations from OpenStreetMap.
2. `npm run survey:build` works out which paths must be surveyed — the routes
   between all six destination pairs, *plus* the step-free alternative to
   each, plus a corridor of nearby options — and writes the field CSVs and an
   interactive survey map.
3. `npm run survey:plan` turns that into an ordered walking itinerary, split
   into two sessions by area — [survey/field-plan.md](survey/field-plan.md) —
   plus a printable recording sheet, `survey/field-sheet.html`.
4. You survey those paths on site, filling in `survey/segments.csv`.
5. `npm run survey:check` catches typos and contradictions before the data is
   trusted; `npm run survey:import` folds the measurements back into the
   routable network the app uses.

See [survey/README.md](survey/README.md) for the field guide and
[survey/field-plan.md](survey/field-plan.md) for the walking plan itself.

## What OSM does not know

Running the pipeline produced the gap this project exists to fill. Across the
506 path segments downloaded:

| Attribute | OSM coverage |
| --------- | -----------: |
| `surface` | 73% |
| `incline` | 14% |
| `wheelchair` | 2% |
| `width` | **0%** |
| `kerb` (dropped kerbs) | **0%** |

It also found that **three of the six journeys have no step-free route at
all** in the mapped data — every one of them involving the Hunterian Museum,
whose only mapped approach is a flight of steps. Confirming or refuting that
on site is the first fieldwork task.

## Features

- Interactive campus map (Leaflet + OpenStreetMap) showing the surveyed network
- **A\*** routing with an admissible straight-line heuristic
- **Four routing profiles**, because "accessible" is not one thing:

  | Profile | Blocks | Weighs heavily |
  | ------- | ------ | -------------- |
  | Step-free (wheelchair) | steps, <1.0 m width, >8% gradient, raised kerbs | narrow paths, steep ramps |
  | Walks with difficulty | steps without a handrail, >10% gradient | gradient, rough ground, **nowhere to rest** |
  | Visually impaired | nothing — steps are not a barrier | **missing tactile paving, unlit paths, uneven ground** |
  | Shortest | nothing | distance only |

  The rules live in one reviewable table in `src/navigation/accessibility.ts`,
  separate from the search, so the criteria can be challenged and cited
  independently of the code that applies them.

  **Every threshold is sourced**, from the Department for Transport's
  *Inclusive Mobility* (2021), with the section cited against each value:

  | Value | Figure | Source |
  | ----- | ------ | ------ |
  | Absolute minimum path width | 1000 mm (max 6 m of it) | §4.2 |
  | Width for a wheelchair and a walker to pass | 1500 mm | §4.2 |
  | Width for a long cane or assistance dog | 1100 mm | §3.2 |
  | Width for two sticks, crutches or a frame | 900 mm | §3.2 |
  | "Level" gradient | 1 in 60 (1.67%) | §4.3 |
  | Gradient above which a slope is a ramp | 1 in 20 (5%) | §4.3 |
  | Absolute maximum gradient | 1 in 12 (8.33%) | §4.3 |
  | Distance without a rest — wheelchair, vision impaired | 150 m | §3.4 |
  | Distance without a rest — stick and cane users | 50 m | §3.4 |
  | Seating interval on a pedestrian route | 50 m | §4.5 |
  | Maximum steps in a flight without a landing | 12 | §5.1 |

  BS 8300-1:2018 remains the reference for building entrances and doors; the
  entrance survey is judged against it separately.
- Routes drawn along the real path geometry, not straight lines between pins
- Unsurveyed stretches drawn **dashed** and reported as unverified — the app
  never claims a path is accessible when nobody has checked
- Honest failure: when no step-free route exists it says so, and explains why
- **Voice guidance** (Web Speech API), with `aria-live` results for screen readers
- Large touch targets and high-contrast colours (WCAG 2.1 AA, BS 8300:2018)

## Tech Stack

- React 18 + Vite (TypeScript)
- Leaflet with OpenStreetMap tiles — **no API key required**
- A\* pathfinding over an OpenStreetMap-derived campus graph
- Web Speech API for voice guidance
- Node scripts + the Overpass API for the survey pipeline

## Try it

The app is published here, and works on a phone:

**https://kobe8244.github.io/gilmorehill-campus-nav/**

The field survey kit is served alongside it:
[survey map](https://kobe8244.github.io/gilmorehill-campus-nav/survey/basemap.html) ·
[printable field sheet](https://kobe8244.github.io/gilmorehill-campus-nav/survey/field-sheet.html)

## Prerequisites

- [Node.js](https://nodejs.org/) 18 or later

That is the whole list. **No API key, no account, no billing** — the map uses
Leaflet with OpenStreetMap tiles, the same source the path network itself
comes from, so anyone can clone this and see it working immediately.

## Getting Started

```bash
git clone https://github.com/kobe8244/gilmorehill-campus-nav.git
cd gilmorehill-campus-nav
npm install
npm run dev               # http://localhost:5173
```

## Available Scripts

| Command | Description |
| ------- | ----------- |
| `npm run dev` | Vite dev server with hot reload |
| `npm run build` | Type-check and build to `dist/` |
| `npm run preview` | Preview the production build |
| `npm run survey:fetch` | Download the study area from OpenStreetMap |
| `npm run survey:build` | Choose the survey segments; write CSVs + field map |
| `npm run survey:plan` | Generate the walking itinerary + printable field sheet |
| `npm run survey:check` | Validate the filled CSVs (`-- --fix` to auto-correct) |
| `npm run survey:import` | Fold surveyed CSV data into the app's network |
| `npm run survey` | All three survey stages in order |

## Project Structure

```
scripts/
  study-area.mjs       # the four destinations + shared config
  fetch-osm.mjs        # stage 1: download from OpenStreetMap
  build-survey.mjs     # stage 2: pick segments, write the field kit
survey/                # the field kit (see survey/README.md)
src/
  pages/               # MapPage, RoutePlannerPage, SettingsPage
  components/          # TabBar, CampusMap
  navigation/
    pathfinding.ts     # A* search over the campus graph
    accessibility.ts   # BS 8300 / Inclusive Mobility thresholds, cost profiles
  data/
    campusGraph.ts     # loads the generated network
    campusNetwork.json # generated — do not edit by hand
  hooks/               # useTTS.ts — Web Speech API voice guidance
  constants/           # theme.ts
  styles/              # global.css
```

## Accessibility

Targets **WCAG 2.1 Level AA** and **BS 8300:2018**: contrast, large text,
keyboard and screen-reader friendly controls, wheelchair-accessible route
filtering, and voice guidance.

The routing thresholds in `src/navigation/accessibility.ts` (1.0 m minimum
clear width, 8% maximum gradient, and so on) are working values drawn from
common summaries of BS 8300-1:2018 and the Department for Transport's
*Inclusive Mobility*. Confirm each against the primary source before quoting
it in the dissertation.

## Academic Context

ENG5059P MSc Project — University of Glasgow. This repository covers outdoor
navigation and hands over to an indoor navigation system at accessible
building entrances.

Base path geometry © OpenStreetMap contributors, licensed under the
[ODbL](https://www.openstreetmap.org/copyright).
