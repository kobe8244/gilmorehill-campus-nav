# Field Survey Toolkit — Gilmorehill Campus

This folder is your kit for collecting the **real accessibility data** the
navigation app needs. The path *geometry* comes from OpenStreetMap; the
*accessibility attributes* (gradient, width, steps, kerbs …) are mostly
missing from OSM and are what you collect on site.

## What's in here

| File | What it is | Who fills it |
| ---- | ---------- | ------------ |
| `basemap.html` | Interactive numbered map of every path segment | — (your field reference) |
| `campus-network.geojson` | The raw path network (geometry + IDs) | — (feeds the app later) |
| `segments.csv` | One row per path segment, pre-filled with OSM hints | **you, in the field** |
| `nodes.csv` | One row per junction/node with coordinates | mostly auto; add entrance types |
| `entrances.csv` | Accessible building entrances = handover points | **you, in the field** |

## How to survey (recommended workflow)

1. **Open `basemap.html`** on a phone or tablet (double-click, or serve it).
   Tap **📍 Locate me** to show your GPS position on the map.
2. Each path segment has a blue **segment_id** label (e.g. `s001`) and each
   junction a red **node_id** (e.g. `n12`).
3. Walk the campus. For each segment, find its row in **`segments.csv`** by
   `segment_id` and fill the blank columns (see dictionary below).
4. For every accessible building entrance, add a row to **`entrances.csv`**.
5. Tapping a segment on the map shows what OSM already claims — **verify it**,
   don't trust it blindly.

> 437 segments (11.6 km) is the whole area. If time is short, prioritise the
> main routes between key buildings and the accessible entrances first.

## Data dictionary

### segments.csv

| Column | Meaning | Allowed values |
| ------ | ------- | -------------- |
| `segment_id` | Matches the label on the map | (pre-filled) |
| `from_id` / `to_id` | Junction nodes at each end | (pre-filled) |
| `length_m` | Auto-computed length | (pre-filled) |
| `highway` | OSM path type (`steps`, `footway` …) | (pre-filled hint) |
| `step_free` | Can a wheelchair pass without steps? | `yes` / `no` |
| `step_count` | Number of steps (if any) | integer |
| `ramp` | Ramp present? | `yes` / `no` |
| `handrail` | Handrail present? | `yes` / `no` |
| `gradient_pct` | Steepest slope, in percent | number (e.g. `4`) |
| `surface` | Surface material | `asphalt` / `paving_stones` / `concrete` / `gravel` / `grass` / `cobbles` / `other` |
| `surface_condition` | Condition | `good` / `uneven` / `poor` |
| `width_m` | Clear width in metres | number (e.g. `1.8`) |
| `dropped_kerb` | Kerb at crossing ends | `lowered` / `flush` / `raised` / `none` |
| `tactile_paving` | Tactile paving present? | `yes` / `no` |
| `lit` | Street lighting? | `yes` / `no` |
| `seating_nearby` | Bench/rest point nearby? | `yes` / `no` |
| `osm_hint` | What OSM already tagged | (reference only) |
| `notes` | Free text / photo filename | free text |

### entrances.csv (handover points)

| Column | Meaning | Allowed values |
| ------ | ------- | -------------- |
| `entrance_id` | Your unique ID | e.g. `main_e1` |
| `building` | Building name | free text |
| `accessible` | Step-free & usable by wheelchair? | `yes` / `no` |
| `door_type` | Door mechanism | `automatic` / `manual` / `heavy` / `revolving` |
| `step_free` | No step at the threshold? | `yes` / `no` |
| `lat`, `lng` | Coordinates (long-press in Google Maps) | decimal degrees |
| `indoor_handover_id` | **Shared ID agreed with the indoor team** | e.g. `MB-E1` |
| `notes` | Free text | free text |

## Judging "accessible" — which thresholds to use

Use these standards to decide what counts as accessible (and to justify it in
your dissertation). They are criteria, **not** data:

- **BS 8300-1:2018** — external built environment (UofG Library has this via
  British Standards Online / BSOL with your student login).
- **Inclusive Mobility (UK Dept for Transport)** — free PDF, focused on
  pedestrian routes: footway widths, gradients, tactile paving, dropped kerbs.

Typical figures to confirm from the source: ramps no steeper than ~1:20 (5%),
clear width ≥ ~1.5 m for wheelchair passing, dropped/flush kerbs at crossings.

## Handing the data back

Just send the filled `segments.csv`, `entrances.csv`, and (if you edited them)
`nodes.csv`. Photos are welcome — reference the filename in `notes`. The data
then gets converted into the app's routable graph and driven by a weighted
A\* accessible-routing engine.

## Attribution

Base path geometry © OpenStreetMap contributors, licensed under the
[Open Database License (ODbL)](https://www.openstreetmap.org/copyright).
Regenerate the base data any time with `node scripts/fetch-osm.mjs`.
