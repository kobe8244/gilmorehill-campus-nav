CLAUDE.md
# Gilmorehill Campus Navigation App

## Project Overview
Smart navigation assistant for older and disabled people
on Glasgow University's Gilmorehill campus (ENG5059P MSc Project).
This repo covers outdoor navigation, connecting to a classmate's
indoor system via a handover point. Supervisor: Marion Hersh.

## Tech Stack
- React + Vite (TypeScript) — browser-based web app
- Google Maps JavaScript API (@react-google-maps/api)
- Dijkstra / A* pathfinding
- GeoJSON road network data
- Voice guidance via the Web Speech API (window.speechSynthesis)

Note: originally scaffolded as a React Native + Expo mobile app; pivoted
to a web app for the project demonstration. The pathfinding logic
(src/navigation/dijkstra.ts) and campus data (src/data/campusGraph.ts)
are platform-agnostic TypeScript and were reused unchanged.

## Accessibility Requirements
- WCAG 2.1 Level AA
- Voice guidance (TTS)
- Large fonts, high contrast UI
- Wheelchair-accessible routes
- BS 8300:2018 compliance

## Project Structure
src/
  pages/         # MapPage, RoutePlannerPage, SettingsPage
  components/    # Reusable UI (TabBar, CampusMap)
  navigation/    # Dijkstra/A* pathfinding logic
  data/          # GeoJSON campus road network
  hooks/         # useTTS (Web Speech API) and other hooks
  constants/     # theme (high-contrast colours, sizes)
  styles/        # global.css

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