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

- Interactive campus map (Google Maps) showing the surveyed network
- **A\*** routing with an admissible straight-line heuristic
- Two routing profiles: shortest route, and **step-free** for wheelchair users
- Routes drawn along the real path geometry, not straight lines between pins
- Unsurveyed stretches drawn **dashed** and reported as unverified — the app
  never claims a path is accessible when nobody has checked
- Honest failure: when no step-free route exists it says so, and explains why
- **Voice guidance** (Web Speech API), with `aria-live` results for screen readers
- Large touch targets and high-contrast colours (WCAG 2.1 AA, BS 8300:2018)

## Tech Stack

- React 18 + Vite (TypeScript)
- Google Maps JavaScript API (`@react-google-maps/api`)
- A\* pathfinding over an OpenStreetMap-derived campus graph
- Web Speech API for voice guidance
- Node scripts + the Overpass API for the survey pipeline

## Prerequisites

- [Node.js](https://nodejs.org/) 18 or later
- A Google Maps API key with the **Maps JavaScript API** enabled

## Getting Started

```bash
git clone https://github.com/kobe8244/gilmorehill-campus-nav.git
cd gilmorehill-campus-nav
npm install

cp .env.example .env      # then edit: VITE_GOOGLE_MAPS_API_KEY=your_key_here

npm run dev               # http://localhost:5173
```

### Google Maps API key setup

1. In the Google Cloud Console, enable **Maps JavaScript API**.
2. Under **Credentials**, restrict the key:
   - **Application restrictions → Websites**, add `http://localhost:5173/*`
   - **API restrictions → Restrict key → Maps JavaScript API**
3. Enable billing on the project (Google requires it even within the free
   monthly credit).

> `.env` is git-ignored so your key is never committed. `.env.example` is the
> committed template.

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
