CLAUDE.md
# Gilmorehill Campus Navigation App

## Project Overview
Smart navigation assistant for older and disabled people
on Glasgow University's Gilmorehill campus (ENG5059P MSc Project).
This repo covers outdoor navigation, connecting to a classmate's
indoor system via a handover point. Supervisor: Marion Hersh.

## Tech Stack
- React Native + Expo (TypeScript)
- Google Maps SDK
- Dijkstra / A* pathfinding
- GeoJSON road network data

## Accessibility Requirements
- WCAG 2.1 Level AA
- Voice guidance (TTS)
- Large fonts, high contrast UI
- Wheelchair-accessible routes
- BS 8300:2018 compliance

## Project Structure
src/
  screens/       # MapScreen, RoutePlannerScreen, SettingsScreen
  components/    # Reusable UI components
  navigation/    # Dijkstra/A* pathfinding logic
  data/          # GeoJSON campus road network
  utils/         # Helper functions

## Coding Standards
- TypeScript with full type annotations
- Functional components + React Hooks
- Comments on all navigation logic
- Accessibility props on all interactive elements