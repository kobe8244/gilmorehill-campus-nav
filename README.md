# Gilmorehill Campus Navigation

A smart, accessibility-first outdoor navigation assistant for older and
disabled people on the University of Glasgow's Gilmorehill campus.

This is the **outdoor** navigation component of an ENG5059P MSc project. It
is designed to connect to a classmate's **indoor** navigation system via a
shared handover point (an accessible building entrance).

Supervisor: Marion Hersh.

## Features

- Interactive campus map centred on the University of Glasgow (Google Maps)
- Route planning between campus buildings using **Dijkstra's algorithm**
- **Wheelchair-accessible** routing option (avoids inaccessible paths)
- Route drawn on the map with automatic zoom-to-fit
- **Voice guidance** (text-to-speech) via the Web Speech API
- Accessibility-focused UI: large touch targets, high-contrast colours
  (targeting WCAG 2.1 Level AA and BS 8300:2018)

## Tech Stack

- React 18 + Vite (TypeScript)
- Google Maps JavaScript API (`@react-google-maps/api`)
- Dijkstra / A\* pathfinding over a GeoJSON-style campus graph
- Web Speech API for voice guidance

## Prerequisites

- [Node.js](https://nodejs.org/) 18 or later
- A Google Maps API key with the **Maps JavaScript API** enabled
  (see [Google Cloud Console](https://console.cloud.google.com/))

## Getting Started

```bash
# 1. Clone the repository
git clone https://github.com/kobe8244/gilmorehill-campus-nav.git
cd gilmorehill-campus-nav

# 2. Install dependencies
npm install

# 3. Add your Google Maps API key
#    Copy the example env file and paste your key into it
cp .env.example .env
#    then edit .env:  VITE_GOOGLE_MAPS_API_KEY=your_key_here

# 4. Start the development server
npm run dev
```

The app runs at **http://localhost:5173**.

### Google Maps API key setup

1. In the Google Cloud Console, enable **Maps JavaScript API**.
2. Under **Credentials**, restrict the key:
   - **Application restrictions → Websites**, add `http://localhost:5173/*`
   - **API restrictions → Restrict key → Maps JavaScript API**
3. Ensure billing is enabled on the project (required by Google Maps, even
   within the free monthly credit).

> `.env` is git-ignored so your key is never committed. `.env.example` is the
> template committed to the repo.

## Available Scripts

| Command           | Description                                      |
| ----------------- | ------------------------------------------------ |
| `npm run dev`     | Start the Vite dev server (hot reload)           |
| `npm run build`   | Type-check and build a production bundle (`dist/`) |
| `npm run preview` | Preview the production build locally             |

## Project Structure

```
src/
  pages/         # MapPage, RoutePlannerPage, SettingsPage
  components/    # TabBar, CampusMap
  navigation/    # dijkstra.ts — pathfinding logic
  data/          # campusGraph.ts — campus nodes & edges
  hooks/         # useTTS.ts — Web Speech API voice guidance
  constants/     # theme.ts — colours, font sizes, spacing
  styles/        # global.css
```

## Accessibility

The app targets:

- **WCAG 2.1 Level AA** — contrast, large text, keyboard/AT-friendly controls
- **BS 8300:2018** — inclusive design of the built environment
- Wheelchair-accessible route filtering
- Voice guidance for users with visual impairments

## Academic Context

ENG5059P MSc Project — University of Glasgow. This repository covers the
outdoor navigation system; it is intended to hand over to an indoor
navigation system at accessible building entrances.
