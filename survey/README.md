# Field Survey Kit — four destinations

This folder is the kit for collecting the **real accessibility data** the
navigation app needs. Path *geometry* comes from OpenStreetMap; the
*accessibility attributes* — width, gradient, kerbs, steps, surface — are
what you measure on site, and are the original contribution of the project.

## Scope: four destinations, not the whole campus

The project navigates between **four places only**:

| Destination | OSM feature | Notes |
| ----------- | ----------- | ----- |
| Main Building | `relation/11951` (Gilbert Scott Building) | |
| Hunterian Museum | `node/600576868` | **Inside** the Main Building, level 2 |
| University Library | `way/32660759` | |
| James Watt Building (South) | `way/182180587` | OSM maps the whole complex as one building; confirm the South wing on site |

Surveying four buildings properly beats surveying twenty superficially: an
accessible route is only as good as its worst unmeasured metre.

> **The Hunterian Museum is not a separate building.** It occupies level 2 of
> the Main Building, reached from the east quadrangle. Outdoor navigation
> therefore ends at the museum's accessible entrance, and the indoor system
> takes over from there. That makes it the clearest handover case in the
> project, not a redundant destination.

## What's in here

| File | What it is | Who fills it |
| ---- | ---------- | ------------ |
| **`field-plan.md`** | **The walking plan — read this before going out** | — (your itinerary) |
| **`field-sheet.html`** | **Printable recording sheet, in walking order** | **you, with a pen** |
| `basemap.html` | Interactive survey map — open this in the field | — (your reference) |
| `segments.csv` | One row per path segment to survey | **you, on site** |
| `entrances.csv` | Building entrances = indoor handover points | **you, on site** |
| `nodes.csv` | Junction coordinates | mostly automatic |
| `campus-network.geojson` | Raw path network from OSM | generated |
| `buildings.geojson` | Building outlines + entrance nodes | generated |
| `osm-coverage.md` | What OSM already knows — the gap analysis | generated |
| `field-summary.json` | Route distances between the four destinations | generated |

## What the data already tells us

Three findings came out of the pipeline before anyone set foot on campus.
They are worth writing up, and they shape what you do first.

**1. OSM has geometry but not accessibility.** Of 506 path segments
downloaded, the attributes that actually decide whether a wheelchair can
pass are almost entirely missing (full table in `osm-coverage.md`):

| Attribute | Coverage |
| --------- | -------: |
| `surface` | 73% |
| `incline` | 14% |
| `wheelchair` | 2% |
| `width` | **0%** |
| `kerb` (dropped kerbs) | **0%** |

Width and dropped kerbs — the two things that most often stop a wheelchair
journey — are recorded for essentially nothing. That is the gap this survey
fills.

**2. Three of the six journeys have no step-free route in OSM's data.**
Every one of them involves the Hunterian Museum, whose only mapped approach
is a 10 m flight of steps (segment `s354`), and whose mapped entrances are
both tagged `wheelchair=no`.

| Journey | Shortest | Step-free |
| ------- | -------: | --------: |
| Main Building → University Library | 183 m | 183 m |
| Main Building → James Watt (South) | 352 m | 352 m |
| University Library → James Watt (South) | 454 m | 454 m |
| Main Building → Hunterian Museum | 90 m | **none** |
| Hunterian Museum → University Library | 192 m | **none** |
| Hunterian Museum → James Watt (South) | 340 m | **none** |

**Your first field task** is to find how a wheelchair user actually reaches
the Hunterian Museum — presumably an accessible entrance and a lift that OSM
does not record — and add it to `entrances.csv`. Whether the answer is "there
is a lift and OSM is incomplete" or "there genuinely is no step-free access",
it is a real result.

**3. The survey is 60 segments / 2.25 km**, out of 16.68 km downloaded — the
routes between the four destinations plus a corridor of alternatives around
them. That is roughly a half-day of careful measurement.

## How to survey

**Start with [`field-plan.md`](field-plan.md).** It is generated from this
same data and gives you the equipment list, how to measure each column, and
an ordered walking route split into two sessions — south (Main Building,
Hunterian, James Watt) and north (Library) — so you finish an area while you
are standing in it instead of crossing campus twice. Roughly 6 hours of
fieldwork in total.

Then, in the field:

1. **Open `basemap.html`** on a phone or tablet. Tap **📍 Locate me** for your
   GPS position; the blue circle shows the accuracy, which degrades badly
   between the tall sandstone buildings, so trust the segment labels over the
   dot.
2. Segments are colour-coded by `tier`:
   - **orange — `core`**: the routes the app will actually offer. Survey first.
   - **blue — `alt`**: alternatives that make a step-free option possible when
     the direct route has stairs. Survey second.
   - **teal dashed — `link`**: short paths included only to join otherwise
     stranded pieces to the network. Survey last, but do survey them — an
     unmeasured link is a link the accessible route cannot honestly use.
   - grey is out of scope; green circles are entrances.
3. Each segment carries a label like `s042`. Find that row in
   **`segments.csv`** and fill the blank columns.
4. For every building entrance, complete its row in **`entrances.csv`** —
   including `indoor_handover_id`, the shared code agreed with the indoor
   team.
5. Tapping a segment shows what OSM claims about it. **Verify it**; do not
   trust it. `surface=asphalt` on a path that is now broken paving is exactly
   the kind of error this survey exists to catch.

> The map needs a network connection for its tiles. Load it once on campus
> Wi-Fi before walking out of range.

## Data dictionary

### segments.csv

| Column | Meaning | Allowed values |
| ------ | ------- | -------------- |
| `segment_id` | Matches the label on the map | (pre-filled) |
| `tier` | `core` = survey first, `alt` = survey second | (pre-filled) |
| `from_id` / `to_id` | Junction nodes at each end | (pre-filled) |
| `length_m` | Computed length | (pre-filled) |
| `highway` | OSM path type | (pre-filled) |
| `step_free` | Can a wheelchair pass without steps? | `yes` / `no` |
| `step_count` | Number of steps, if any | integer |
| `ramp` | Ramp present? | `yes` / `no` |
| `handrail` | Handrail present? | `yes` / `no` |
| `gradient_pct` | Steepest slope, percent | number, e.g. `4` |
| `surface` | Material | `asphalt` / `paving_stones` / `concrete` / `gravel` / `grass` / `cobbles` / `other` |
| `surface_condition` | Condition | `good` / `uneven` / `poor` |
| `width_m` | Narrowest clear width | number, e.g. `1.8` |
| `dropped_kerb` | Kerb where the path meets a road | `flush` (level with the road) / `lowered` (dropped, slight lip) / `raised` (**full kerb, nowhere to cross**) / `none` (**no kerb here at all**) |
| `tactile_paving` | Tactile paving present? | `yes` / `no` |
| `lit` | Street lighting? | `yes` / `no` |
| `seating_nearby` | Bench or rest point nearby? | `yes` / `no` |
| `osm_hint` | What OSM claims | (reference only) |
| `osm_way`, `osm_from`, `osm_to` | The segment's permanent OSM identity | (reference only — never type here) |
| `notes` | Free text, photo filename | free text |

Those three `osm_*` columns are what let your data survive a re-download.
`segment_id` is only a row number and shifts if OpenStreetMap changes; the
OSM ids name the actual piece of ground, so the pipeline re-matches your
measurements to the right path rather than to whatever now holds that number.
Leave them alone and they will quietly protect your fieldwork.

**`step_free` and `width_m` are the two that matter most** — the app treats a
segment as surveyed only once both are filled, and until then it warns the
user that the route is unverified.

**Every other column feeds the routing model too, and each one serves a
different traveller.** `handrail` decides whether someone who walks with a
stick can use a flight of steps at all. `lit` and `tactile_paving` are what a
visually impaired user's route is chosen on — for them steps are not a
barrier, but an unlit path with no tactile warning at the crossing is.
`seating_nearby` is what an older user needs to know. None of these are
optional extras; leaving one blank removes a traveller's route from the app.

Measure `width_m` at the **narrowest** point, not the average: a 2 m path
with one 0.8 m pinch point is a 0.8 m path to a wheelchair user.

`dropped_kerb` is the one column where two of the values look alike but mean
opposite things. **`raised` is a barrier** — a full kerb with nowhere to get
down. **`none` is not** — it means the path never meets a kerb, which is the
easiest case there is. Only use `raised` when someone on wheels would
actually be stopped.

### entrances.csv (indoor handover points)

| Column | Meaning | Allowed values |
| ------ | ------- | -------------- |
| `entrance_id` | Pre-filled from the OSM node id | (pre-filled) |
| `building` / `serves` | Which destination it serves | (pre-filled) |
| `accessible` | Step-free and usable by a wheelchair? | `yes` / `no` |
| `door_type` | Door mechanism | `automatic` / `manual` / `heavy` / `revolving` |
| `step_free` | No step at the threshold? | `yes` / `no` |
| `step_count` | Steps at the threshold | integer |
| `ramp` | Ramp to the door? | `yes` / `no` |
| `door_width_m` | **Clear** opening width, door fully open | number |
| `lat`, `lng` | Coordinates | (pre-filled; correct if wrong) |
| `nearest_node_id` | Path junction it connects to | (pre-filled) |
| `indoor_handover_id` | **Shared ID agreed with the indoor team** | e.g. `MB-E1` |
| `osm_hint` | What OSM claims | (reference only) |
| `notes` | Free text | free text |

Add rows for entrances OSM does not know about — hand-added rows are kept
when the pipeline is re-run.

**What the entrance columns are judged against** — Inclusive Mobility §11.2:

| Measurement | Criterion |
| ----------- | --------- |
| `door_width_m` | **900 mm minimum**, 1200 mm preferred. Measure the clear opening with the door fully open, not the door leaf |
| `step_free` at the threshold | Thresholds should be **level**. 10 mm is the maximum rise; above 5 mm it needs a bevelled edge — so any step you can see is already non-compliant |
| `door_type` = `revolving` | Not suited to many disabled people. Where one exists an **alternative hinged or sliding door must be provided nearby** — find it, and record that door instead |
| `door_type` = `heavy` | A door should open with no more than 15 N. If you cannot open it one-handed, say so in `notes` |
| `door_type` = `automatic` | The preferred arrangement; should stay open at least 6 seconds |

Recording a revolving or heavy door as `accessible=yes` will be flagged by
`survey:check`, because in both cases the genuinely accessible way in is
somewhere else and has not been recorded yet.

## Judging "accessible" — which thresholds to use

These are the criteria, **not** data. Confirm the exact figures against the
primary sources before quoting them in the dissertation; the values coded
into `src/navigation/accessibility.ts` are working approximations.

- **BS 8300-1:2018** — accessible external environments. Available through
  the University Library's British Standards Online (BSOL) subscription.
- **Inclusive Mobility** (UK Department for Transport) — free PDF, covering
  footway widths, gradients, tactile paving and dropped kerbs.

Working values currently in the code: minimum clear width 1.0 m (1.5 m for
two chairs to pass), maximum gradient 8% (5% comfortable, about 1:20).

## Getting the data into the app

```bash
npm run survey:check      # find typos BEFORE trusting the data
npm run survey:import     # reads segments.csv → src/data/campusNetwork.json
npm run dev               # the app now routes on your measurements
```

**Always run `survey:check` first.** Typing measurements on a phone in the
rain produces typos, and a typo is worse than a blank: a blank is honestly
"unknown", but `width_m = 140` (centimetres) or `step_free = Yes` becomes
confident, wrong advice to someone who cannot manage steps. The check reports
impossible values, contradictions (8 steps recorded on a step-free path), and
suspicious ones (a 30% gradient — did you write degrees?).

```bash
npm run survey:check -- --fix    # apply the unambiguous corrections
```

`--fix` only ever touches things that need no judgement: letter case (`Yes` →
`yes`), decimal commas (`1,4` → `1.4`), and the single-letter shorthand from
the printed sheet (`P` → `paving_stones`). Anything requiring a decision is
reported for you to resolve by hand.

Fill in as much or as little as you like — partial data works. The app tracks
what has been surveyed and marks unverified stretches with a dashed line,
rather than pretending an unmeasured path is safe.

> If a script says a file is open in another program, close it in Excel or
> WPS 表格 — both take an exclusive lock on the file while it is open.

## Regenerating the network

```bash
npm run survey            # fetch + build + plan, all three stages
```

Re-running is safe. `survey:build` carries over every value you have typed,
matching on the `osm_*` columns rather than the row number, so your data
follows the ground even if OpenStreetMap changes and the segment numbering
shifts. It warns loudly if a surveyed segment falls outside the new study
area rather than dropping it silently.

Add `--dry-run` to preview without writing anything:

```bash
node scripts/build-survey.mjs --dry-run
```

Still, commit your filled CSVs to git before regenerating. They are the one
part of this repository that cannot be reproduced.

To change which buildings are covered, edit `DESTINATIONS` in
`scripts/study-area.mjs` and re-run `npm run survey`.

## Attribution

Base path geometry © OpenStreetMap contributors, licensed under the
[Open Database License (ODbL)](https://www.openstreetmap.org/copyright).
Accessibility attributes surveyed on site for ENG5059P.
